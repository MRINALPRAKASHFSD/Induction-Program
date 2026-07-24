/**
 * api/event-attendance-mark.ts
 *
 * Public endpoint — marks attendance for a student at an event by scanning
 * the event's QR code (which encodes a plain HTTPS URL).
 *
 * NO authentication required (students scan without logging in).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ISOLATION GUARANTEE: This file is completely isolated from the induction
 * attendance system. It does NOT touch attendance_logs, attendance_sessions,
 * attendance_stats, QR rotation, geofencing, HMAC signing, or QStash workers.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Validation Pipeline (15 checks — all server-side, never trust client):
 *   1.  HTTP method guard (POST only)
 *   2.  Firebase Admin initialized
 *   3.  Input validation (event_id, enrollment_number shape)
 *   4.  Three-layer rate limit check (IP + Enrollment + Event) — fail open on Redis error
 *   5.  Event fetch (events/{event_id}) — O(1) document ID lookup
 *   6.  Event must exist
 *   7.  event.is_active === true
 *   8.  event.qr_enabled !== false
 *   9.  Attendance window: now within [starts_at - windowBefore, ends_at + windowAfter]
 *  10.  Status derivation: 'present' or 'late'
 *  11.  Student fetch (students/{enrollment_number}) — O(1) document ID lookup
 *  12.  Student must exist (enrollment not found → NOT_FOUND)
 *  13.  Student not suspended
 *  14.  Capacity pre-check (before entering transaction)
 *  15.  Firestore Transaction:
 *         a. Re-read event (fresh capacity)
 *         b. Re-check capacity inside tx (no race condition)
 *         c. Read event_attendance/{docId} (dedup check)
 *         d. If duplicate → return idempotent success
 *         e. Write event_attendance document
 *         f. Increment events.attendance_count
 *
 * Post-response (non-blocking, after 200 sent):
 *  - Redis analytics (timeline, first/last attendee, counters)
 *  - Audit log write to event_attendance_logs
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { EVENT_ATTENDANCE_CONFIG, RESPONSE_CODES } from '../server/event-attendance.config.js';
import { buildCounterIncrement, readCount } from '../server/event-counter.js';
import { parseUA } from '../server/event-ua-parser.js';
import { logRedisFailure, logRateLimitSkip } from '../server/event-redis-monitor.js';
import crypto from 'crypto';

// ── Firebase Admin Singleton ──────────────────────────────────────────────────
let firebaseInitialized = false;
let firebaseInitError = '';

try {
  if (!getApps().length) {
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY
    ) {
      throw new Error('Missing Firebase Admin credentials.');
    }
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('[event-attendance-mark] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function requestId(): string {
  return `eam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function apiResponse(
  res: any,
  status: number,
  ok: boolean,
  code: string,
  message: string,
  data: any = null,
  meta: Record<string, any> = {},
) {
  const ts = new Date().toISOString();
  return res.status(status).json({ ok, code, message, data, meta: { ...meta, timestamp: ts }, timestamp: ts });
}

function getClientIp(req: any): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// ── Rate Limit (3-layer) ──────────────────────────────────────────────────────
/**
 * Returns { allowed: true } or { allowed: false, retryAfter: number }.
 * Uses Redis pipeline to batch all checks in a single round trip.
 * Always fails open on Redis error (attendance must never be blocked by infra).
 */
async function checkRateLimit(
  ip: string,
  enrollment: string,
  eventId: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const cfg = EVENT_ATTENDANCE_CONFIG;
  const now  = Math.floor(Date.now() / 1000);

  let redis;
  try {
    redis = getRedis();
  } catch {
    logRateLimitSkip('event-attendance-mark', eventId, 'Redis not configured');
    return { allowed: true };
  }

  try {
    const ipKey  = `ea:ip:${hashIp(ip)}`;
    const enrKey = `ea:enr:${eventId}:${enrollment}`;
    const evtKey = `ea:evt:${eventId}`;
    const failKey = `ea:fail:${eventId}:${enrollment}`;

    // Pipeline: INCR + EXPIRE for all three layers + GET failure count
    const pipeline = redis.pipeline();
    pipeline.incr(ipKey);
    pipeline.expire(ipKey, cfg.rateLimitIp.windowSec, 'NX');
    pipeline.incr(enrKey);
    pipeline.expire(enrKey, cfg.rateLimitEnrollment.windowSec, 'NX');
    pipeline.incr(evtKey);
    pipeline.expire(evtKey, cfg.rateLimitEvent.windowSec, 'NX');
    pipeline.get(failKey);
    const results = await pipeline.exec();

    const ipCount  = results[0] as number;
    const enrCount = results[2] as number;
    const evtCount = results[4] as number;
    const failCount = parseInt((results[6] as string | null) ?? '0', 10);

    // Failure backoff: lockout after repeated failures
    if (failCount >= cfg.failureLockoutAfter) {
      const backoffSec = cfg.failureLockoutBaseSec * Math.pow(2, failCount - cfg.failureLockoutAfter);
      const retryAfter = Math.min(backoffSec, 300); // cap at 5 min
      return { allowed: false, retryAfter };
    }

    if (ipCount > cfg.rateLimitIp.max) {
      return { allowed: false, retryAfter: cfg.rateLimitIp.windowSec };
    }
    if (enrCount > cfg.rateLimitEnrollment.max) {
      return { allowed: false, retryAfter: cfg.rateLimitEnrollment.windowSec };
    }
    if (evtCount > cfg.rateLimitEvent.max) {
      return { allowed: false, retryAfter: cfg.rateLimitEvent.windowSec };
    }

    return { allowed: true };
  } catch (err: any) {
    logRedisFailure({
      endpoint:  'event-attendance-mark',
      event_id:  eventId,
      operation: 'rate_limit_pipeline',
      reason:    err.message,
    });
    return { allowed: true }; // fail open
  }
}

/** Increment the failure counter for exponential backoff. */
async function recordFailure(eventId: string, enrollment: string): Promise<void> {
  try {
    const redis = getRedis();
    const failKey = `ea:fail:${eventId}:${enrollment}`;
    const pipeline = redis.pipeline();
    pipeline.incr(failKey);
    pipeline.expire(failKey, 300); // 5 min TTL
    await pipeline.exec();
  } catch {
    // ignore — fail open
  }
}

/** Post-response analytics: sorted set timeline, first/last attendee, counters. Non-blocking. */
async function recordAnalytics(
  eventId: string,
  enrollment: string,
  studentName: string,
  nowMs: number,
): Promise<void> {
  try {
    const redis = getRedis();
    const timelineKey  = `ea:timeline:${eventId}`;
    const firstKey     = `ea:first:${eventId}`;
    const lastKey      = `ea:last:${eventId}`;
    const presentKey   = `ea:present:${eventId}`;

    const memberPayload = JSON.stringify({ enrollment, name: studentName, at: nowMs });

    const pipeline = redis.pipeline();
    // Sorted set by timestamp — for velocity and hourly breakdown
    pipeline.zadd(timelineKey, { score: nowMs, member: memberPayload });
    pipeline.expire(timelineKey, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX');
    // First attendee: only set if key doesn't exist
    pipeline.set(firstKey, memberPayload, { nx: true, ex: EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec });
    // Last attendee: always overwrite
    pipeline.set(lastKey, memberPayload, { ex: EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec });
    // Present count (for real-time metric)
    pipeline.incr(presentKey);
    pipeline.expire(presentKey, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX');
    await pipeline.exec();
  } catch (err: any) {
    logRedisFailure({
      endpoint:  'event-attendance-mark',
      event_id:  eventId,
      operation: 'analytics_pipeline',
      reason:    err.message,
    });
  }
}

async function incrementDuplicateCounter(eventId: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = `ea:dup:${eventId}`;
    await redis.pipeline().incr(key).expire(key, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX').exec();
  } catch { /* ignore */ }
}

async function incrementRejectedCounter(eventId: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = `ea:rej:${eventId}`;
    await redis.pipeline().incr(key).expire(key, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX').exec();
  } catch { /* ignore */ }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. Method guard
  if (req.method !== 'POST') {
    return apiResponse(res, 405, false, RESPONSE_CODES.INVALID_INPUT, 'Method Not Allowed');
  }

  // 2. Firebase guard
  if (!firebaseInitialized) {
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, `Backend configuration error: ${firebaseInitError}`);
  }

  const reqId = requestId();
  const ip = getClientIp(req);
  const ua = (req.headers['user-agent'] as string) || '';
  const parsedUA = parseUA(ua);

  // 3. Input validation
  const rawEventId    = req.body?.event_id;
  const rawEnrollment = req.body?.enrollment_number;
  const clientTs      = req.body?.client_timestamp ?? null;

  if (!rawEventId || typeof rawEventId !== 'string' || rawEventId.length > 128) {
    return apiResponse(res, 400, false, RESPONSE_CODES.INVALID_INPUT, 'Invalid or missing event_id.', null, { requestId: reqId });
  }

  const enrollment = typeof rawEnrollment === 'string' ? rawEnrollment.trim().toUpperCase() : '';
  if (!EVENT_ATTENDANCE_CONFIG.enrollmentPattern.test(enrollment)) {
    return apiResponse(res, 400, false, RESPONSE_CODES.INVALID_INPUT,
      'Invalid enrollment number format. Must be 3–40 alphanumeric characters.', null, { requestId: reqId });
  }

  const eventId = rawEventId.trim();

  // 4. Rate limit check
  const rateLimitResult = await checkRateLimit(ip, enrollment, eventId);
  if (!rateLimitResult.allowed) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 429, false, RESPONSE_CODES.RATE_LIMITED,
      `Too many attempts. Retry in ${rateLimitResult.retryAfter} seconds.`,
      null, { requestId: reqId, retryAfter: rateLimitResult.retryAfter });
  }

  const db = getFirestore();
  const cfg = EVENT_ATTENDANCE_CONFIG;
  const now = Date.now();

  // 5–8. Event validation
  const eventRef = db.collection('events').doc(eventId);
  let eventDoc;
  try {
    eventDoc = await eventRef.get();
  } catch (err: any) {
    console.error('[event-attendance-mark] Firestore event fetch error:', err.message);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Database error. Try again.', null, { requestId: reqId });
  }

  // 6. Event must exist
  if (!eventDoc.exists) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 404, false, RESPONSE_CODES.NOT_FOUND, 'Event not found.', null, { requestId: reqId });
  }

  const event = eventDoc.data()!;

  // 7. Event must be active
  if (event.is_active !== true) {
    void recordFailure(eventId, enrollment);
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 403, false, RESPONSE_CODES.QR_DISABLED,
      'This event is not currently active.', null, { requestId: reqId });
  }

  // 8. QR enabled check
  if (event.qr_enabled === false) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 403, false, RESPONSE_CODES.QR_DISABLED,
      'Attendance for this event has been disabled by the organizer.', null, { requestId: reqId });
  }

  // 9. Attendance window validation
  const startsAt = new Date(event.starts_at).getTime();
  const endsAt   = new Date(event.ends_at).getTime();
  const windowOpen  = startsAt - cfg.windowBeforeStartMs;
  const windowClose = endsAt   + cfg.windowAfterEndMs;

  if (now < windowOpen) {
    void recordFailure(eventId, enrollment);
    void incrementRejectedCounter(eventId);
    const openAt = new Date(windowOpen).toISOString();
    return apiResponse(res, 403, false, RESPONSE_CODES.OUTSIDE_WINDOW,
      `Attendance opens at ${new Date(windowOpen).toLocaleTimeString('en-IN')}.`,
      null, { requestId: reqId, opensAt: openAt });
  }

  if (now > windowClose) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 403, false, RESPONSE_CODES.OUTSIDE_WINDOW,
      'Attendance window for this event is closed.', null, { requestId: reqId });
  }

  // 10. Derive status
  const status = (now > startsAt + cfg.lateThresholdMs) ? 'late' : 'present';

  // 11–13. Student validation (O(1) — enrollment IS the document ID)
  const studentRef = db.collection('students').doc(enrollment);
  let studentDoc;
  try {
    studentDoc = await studentRef.get();
  } catch (err: any) {
    console.error('[event-attendance-mark] Firestore student fetch error:', err.message);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Database error. Try again.', null, { requestId: reqId });
  }

  // 12. Student must exist
  if (!studentDoc.exists) {
    void recordFailure(eventId, enrollment);
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 404, false, RESPONSE_CODES.NOT_FOUND,
      'Enrollment number not found. This student is not registered.', null, { requestId: reqId });
  }

  const student = studentDoc.data()!;

  // 13. Student not suspended
  if (student.is_suspended === true || student.is_deactivated === true) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 403, false, RESPONSE_CODES.SUSPENDED,
      'Your account is suspended. Please contact administration.', null, { requestId: reqId });
  }

  // 14. Capacity pre-check (fast path — avoids tx if obviously full)
  const currentCount = readCount(eventDoc);
  const capacity: number | undefined = event.capacity;
  const allowOverflow: boolean = event.allow_overflow ?? false;

  if (capacity !== undefined && !allowOverflow && currentCount >= capacity) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 409, false, RESPONSE_CODES.CAPACITY_FULL,
      'This event has reached its maximum capacity.', null, { requestId: reqId });
  }

  // 15. Firestore Transaction — atomic dedup + counter + write
  const attendanceDocId = `${eventId}_${enrollment}`;
  const attendanceRef   = db.collection('event_attendance').doc(attendanceDocId);
  const auditLogRef     = db.collection('event_attendance_logs').doc();

  let isDuplicate = false;
  let studentName = student.full_name as string || enrollment;

  try {
    isDuplicate = await db.runTransaction(async (tx) => {
      // Re-read event inside tx (fresh capacity, prevents race)
      const freshEventDoc = await tx.get(eventRef);
      if (!freshEventDoc.exists) throw new Error('event_disappeared');

      const freshEvent  = freshEventDoc.data()!;
      const freshCount  = readCount(freshEventDoc);
      const freshCap    = freshEvent.capacity as number | undefined;
      const freshOflow  = freshEvent.allow_overflow as boolean ?? false;

      // Re-validate QR enabled inside tx
      if (freshEvent.qr_enabled === false) throw new Error('qr_disabled_in_tx');

      // Re-validate capacity inside tx (no race condition)
      if (freshCap !== undefined && !freshOflow && freshCount >= freshCap) {
        throw new Error('capacity_full_in_tx');
      }

      // Dedup check (O(1) by document ID)
      const dupeDoc = await tx.get(attendanceRef);
      if (dupeDoc.exists) return true; // duplicate — don't write

      // Write attendance record
      tx.set(attendanceRef, {
        event_id:            eventId,
        student_uid:         student.auth_uid || enrollment,
        enrollment_number:   enrollment,
        student_name:        studentName,
        department:          student.department || student.course || '',
        school:              student.school || student.department_id || '',

        // Status & verification
        status,
        verification_method: 'QR' as const,

        // Metadata
        marked_by:           'student',
        created_by:          'system',
        client_timestamp:    clientTs,
        server_timestamp:    FieldValue.serverTimestamp(),

        // Audit / security (no raw PII)
        ip_hash:             hashIp(ip),
        browser:             parsedUA.browser,
        browser_version:     parsedUA.browser_version,
        os:                  parsedUA.os,
        device_type:         parsedUA.device_type,

        created_at:          FieldValue.serverTimestamp(),
      });

      // Atomically increment counter (via abstraction layer)
      buildCounterIncrement(tx, eventRef, freshCount);

      return false; // not a duplicate
    });
  } catch (txErr: any) {
    // Handle specific transaction abort reasons
    if (txErr.message === 'capacity_full_in_tx') {
      void incrementRejectedCounter(eventId);
      return apiResponse(res, 409, false, RESPONSE_CODES.CAPACITY_FULL,
        'This event has reached its maximum capacity.', null, { requestId: reqId });
    }
    if (txErr.message === 'qr_disabled_in_tx') {
      void incrementRejectedCounter(eventId);
      return apiResponse(res, 403, false, RESPONSE_CODES.QR_DISABLED,
        'Attendance for this event has been disabled by the organizer.', null, { requestId: reqId });
    }
    console.error('[event-attendance-mark] Transaction error:', txErr.message);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR,
      'Failed to record attendance. Please try again.', null, { requestId: reqId });
  }

  if (isDuplicate) {
    void incrementDuplicateCounter(eventId);
    return apiResponse(res, 200, true, RESPONSE_CODES.DUPLICATE,
      'Attendance already marked for this event.',
      { duplicate: true, studentName, eventTitle: event.title },
      { requestId: reqId });
  }

  // 200 — Send response immediately
  const responsePayload = {
    duplicate:    false,
    studentName,
    eventTitle:   event.title,
    status,
    enrollment,
  };

  // Must set response before async post-processing
  res.status(200).json({
    ok:        true,
    code:      RESPONSE_CODES.SUCCESS,
    message:   status === 'late' ? 'Attendance marked (late).' : 'Attendance marked successfully.',
    data:      responsePayload,
    meta:      { requestId: reqId, timestamp: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  });

  // Non-blocking post-response work — analytics + audit log
  void Promise.allSettled([
    recordAnalytics(eventId, enrollment, studentName, now),
    db.collection('event_attendance_logs').doc().create?.({
      event_id:   eventId,
      action:     'marked',
      enrollment,
      status,
      reason:     `QR attendance marked as ${status}`,
      ip_hash:    hashIp(ip),
      device:     parsedUA.device_type,
      timestamp:  FieldValue.serverTimestamp(),
    }).catch(() => {
      // Fallback if .create() not available
      return auditLogRef.set({
        event_id:   eventId,
        action:     'marked',
        enrollment,
        status,
        reason:     `QR attendance marked as ${status}`,
        ip_hash:    hashIp(ip),
        device:     parsedUA.device_type,
        timestamp:  FieldValue.serverTimestamp(),
      });
    }),
  ]);
}

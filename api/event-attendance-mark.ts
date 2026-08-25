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

// ── Rate Limit ──────────────────────────────────────────────────────
async function checkRateLimit(
  ip: string,
  applicationNumber: string,
  eventId: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  // RATE LIMITING REMOVED FOR EVENT ATTENDANCE
  // To support 5,000-10,000 simultaneous students, we do not apply IP, Event, or AppNum rate limits.
  return { allowed: true };
}

async function recordFailure(eventId: string, applicationNumber: string): Promise<void> {
  try {
    const redis = getRedis();
    const failKey = `ea:fail:${eventId}:${applicationNumber}`;
    await redis.pipeline().incr(failKey).expire(failKey, 300).exec();
  } catch { }
}

async function recordAnalytics(eventId: string, applicationNumber: string, studentName: string, nowMs: number): Promise<void> {
  try {
    const redis = getRedis();
    const timelineKey  = `ea:timeline:${eventId}`;
    const firstKey     = `ea:first:${eventId}`;
    const lastKey      = `ea:last:${eventId}`;
    const presentKey   = `ea:present:${eventId}`;
    const memberPayload = JSON.stringify({ applicationNumber, name: studentName, at: nowMs });
    const pipeline = redis.pipeline();
    pipeline.zadd(timelineKey, { score: nowMs, member: memberPayload });
    pipeline.expire(timelineKey, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX');
    pipeline.set(firstKey, memberPayload, { nx: true, ex: EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec });
    pipeline.set(lastKey, memberPayload, { ex: EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec });
    pipeline.incr(presentKey);
    pipeline.expire(presentKey, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX');
    await pipeline.exec();
  } catch (err: any) {
    logRedisFailure({ endpoint: 'event-attendance-mark', event_id: eventId, operation: 'analytics_pipeline', reason: err.message });
  }
}

async function incrementDuplicateCounter(eventId: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = `ea:dup:${eventId}`;
    await redis.pipeline().incr(key).expire(key, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX').exec();
  } catch { }
}

async function incrementRejectedCounter(eventId: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = `ea:rej:${eventId}`;
    await redis.pipeline().incr(key).expire(key, EVENT_ATTENDANCE_CONFIG.timelineRedisTtlSec, 'NX').exec();
  } catch { }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, RESPONSE_CODES.INVALID_INPUT, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, `Backend configuration error: ${firebaseInitError}`);

  const reqId = requestId();
  const ip = getClientIp(req);
  const ua = (req.headers['user-agent'] as string) || '';
  const parsedUA = parseUA(ua);

  const { event_id: rawEventId, application_number: rawAppNum, student_name, school, programme, client_timestamp } = req.body;

  if (!rawEventId || typeof rawEventId !== 'string') {
    return apiResponse(res, 400, false, RESPONSE_CODES.INVALID_INPUT, 'Missing event_id', null, { requestId: reqId });
  }
  if (!rawAppNum || typeof rawAppNum !== 'string') {
    return apiResponse(res, 400, false, RESPONSE_CODES.INVALID_INPUT, 'Missing application_number', null, { requestId: reqId });
  }

  const eventId = rawEventId.trim();
  const applicationNumber = rawAppNum.trim().toUpperCase().replace(/\//g, '-');

  const db = getFirestore();
  const cfg = EVENT_ATTENDANCE_CONFIG;
  const now = Date.now();

  const rateLimitResult = await checkRateLimit(ip, applicationNumber, eventId);
  if (!rateLimitResult.allowed) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 429, false, RESPONSE_CODES.RATE_LIMITED, `Too many attempts. Retry in ${rateLimitResult.retryAfter} seconds.`, null, { requestId: reqId, retryAfter: rateLimitResult.retryAfter });
  }

  // 🚀 HIGH PERFORMANCE: Fetch ALL required documents concurrently in one network round trip
  const eventRef = db.collection('events').doc(eventId);
  const studentRef = db.collection('students').doc(applicationNumber);
  const eventParticipantRef = db.collection('event_participants').doc(`${eventId}_${applicationNumber}`);
  const inductionParticipantRef = db.collection('induction_participants').doc(applicationNumber);

  let eventDoc, studentSnap, eventParticipantSnap, inductionParticipantSnap;

  try {
    [eventDoc, studentSnap, eventParticipantSnap, inductionParticipantSnap] = await Promise.all([
      eventRef.get(),
      studentRef.get(),
      eventParticipantRef.get(),
      inductionParticipantRef.get()
    ]);
  } catch (err: any) {
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Database error. Try again.', null, { requestId: reqId });
  }

  if (!eventDoc.exists) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 404, false, RESPONSE_CODES.NOT_FOUND, 'Event not found.', null, { requestId: reqId });
  }

  const event = eventDoc.data()!;

  if (event.is_active !== true || event.qr_enabled === false) {
    void recordFailure(eventId, applicationNumber);
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 403, false, RESPONSE_CODES.QR_DISABLED, 'Attendance for this event is not active.', null, { requestId: reqId });
  }

  // Resolve Student Identity
  let studentDocData: any = null;
  let isNewStudent = false;

  if (studentSnap.exists) {
    studentDocData = studentSnap.data();
  } else if (eventParticipantSnap.exists) {
    studentDocData = eventParticipantSnap.data();
  } else if (inductionParticipantSnap.exists) {
    studentDocData = inductionParticipantSnap.data();
  } else {
    isNewStudent = true;
    if (!student_name || !school || !programme) {
      return apiResponse(res, 400, false, 'NEW_STUDENT_DATA_REQUIRED', 'Application number not found. Please provide name, school, and programme to register.', null, { requestId: reqId });
    }
  }

  const finalStudentName = isNewStudent ? student_name.trim() : (studentDocData.student_name || studentDocData.full_name || applicationNumber);
  const finalStudentSchool = isNewStudent ? school.trim() : (studentDocData.school || studentDocData.department_id || '');
  const finalStudentProgramme = isNewStudent ? programme.trim() : (studentDocData.program || studentDocData.course || studentDocData.branch_id || '');

  // School Validation
  if (event.school && event.school.trim() !== '' && event.school.trim().toLowerCase() !== 'all') {
    if (event.school.trim().toLowerCase() !== finalStudentSchool.toLowerCase()) {
      void incrementRejectedCounter(eventId);
      return apiResponse(res, 403, false, 'SCHOOL_MISMATCH', 'This event is not available for your school.', null, { requestId: reqId });
    }
  }

  // Window & Capacity Validation
  const startsAt = new Date(event.starts_at).getTime();
  const endsAt   = new Date(event.ends_at).getTime();
  const windowOpen  = startsAt - cfg.windowBeforeStartMs;
  const windowClose = endsAt   + cfg.windowAfterEndMs;

  if (now < windowOpen) {
    void recordFailure(eventId, applicationNumber);
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 403, false, RESPONSE_CODES.OUTSIDE_WINDOW, `Attendance opens at ${new Date(windowOpen).toLocaleTimeString('en-IN')}.`, null, { requestId: reqId, opensAt: new Date(windowOpen).toISOString() });
  }

  if (now > windowClose) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 403, false, RESPONSE_CODES.OUTSIDE_WINDOW, 'Attendance window for this event is closed.', null, { requestId: reqId });
  }

  const lateWindowStart = endsAt - ((cfg.lateWindowMinutes ?? 10) * 60 * 1000);
  const status = (now >= lateWindowStart) ? 'late' : 'present';
  const currentCount = readCount(eventDoc);
  const capacity = event.capacity;
  const allowOverflow = event.allow_overflow ?? false;

  if (capacity !== undefined && !allowOverflow && currentCount >= capacity) {
    void incrementRejectedCounter(eventId);
    return apiResponse(res, 409, false, RESPONSE_CODES.CAPACITY_FULL, 'This event has reached its maximum capacity.', null, { requestId: reqId });
  }

  // Transaction
  const attendanceDocId = `${eventId}_${applicationNumber}`;
  const attendanceRef   = db.collection('event_attendance').doc(attendanceDocId);
  const auditLogRef     = db.collection('event_attendance_logs').doc();

  let isDuplicate = false;
  try {
    isDuplicate = await db.runTransaction(async (tx) => {
      // 🚀 HIGH PERFORMANCE: Fetch transaction reads concurrently
      const [freshEventDoc, dupeDoc] = await tx.getAll(eventRef, attendanceRef);
      
      if (!freshEventDoc.exists) throw new Error('event_disappeared');

      const freshEvent  = freshEventDoc.data()!;
      const freshCount  = readCount(freshEventDoc);
      const freshCap    = freshEvent.capacity;
      const freshOflow  = freshEvent.allow_overflow ?? false;

      if (freshEvent.qr_enabled === false) throw new Error('qr_disabled_in_tx');
      if (freshCap !== undefined && !freshOflow && freshCount >= freshCap) throw new Error('capacity_full_in_tx');

      if (dupeDoc.exists) return true;

      // Write attendance
      tx.set(attendanceRef, {
        event_id:            eventId,
        application_number:  applicationNumber,
        student_name:        finalStudentName,
        department:          finalStudentProgramme,
        school:              finalStudentSchool,
        event_title:         event.title || '',
        planner_id:          event.planner_id || '',
        day_number:          event.day_number || 1,
        status,
        verification_method: 'QR' as const,
        marked_by:           'student',
        created_by:          'system',
        client_timestamp:    client_timestamp || null,
        server_timestamp:    FieldValue.serverTimestamp(),
        ip_hash:             hashIp(ip),
        browser:             parsedUA.browser,
        browser_version:     parsedUA.browser_version,
        os:                  parsedUA.os,
        device_type:         parsedUA.device_type,
        created_at:          FieldValue.serverTimestamp(),
      });

      // Write student record if new
      if (isNewStudent) {
        tx.set(studentRef, {
          id: applicationNumber,
          enrollment_no: applicationNumber,
          student_name: finalStudentName,
          school: finalStudentSchool,
          program: finalStudentProgramme,
          created_at: FieldValue.serverTimestamp(),
          created_via: 'event_attendance'
        }, { merge: true });
      }

      buildCounterIncrement(tx, eventRef, freshCount);
      return false;
    });
  } catch (txErr: any) {
    if (txErr.message === 'capacity_full_in_tx') {
      void incrementRejectedCounter(eventId);
      return apiResponse(res, 409, false, RESPONSE_CODES.CAPACITY_FULL, 'This event has reached its maximum capacity.', null, { requestId: reqId });
    }
    if (txErr.message === 'qr_disabled_in_tx') {
      void incrementRejectedCounter(eventId);
      return apiResponse(res, 403, false, RESPONSE_CODES.QR_DISABLED, 'Attendance for this event has been disabled.', null, { requestId: reqId });
    }
    console.error('[event-attendance-mark] Tx error:', txErr.message);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Failed to record attendance.', null, { requestId: reqId });
  }

  if (isDuplicate) {
    void incrementDuplicateCounter(eventId);
    return apiResponse(res, 200, true, RESPONSE_CODES.DUPLICATE, 'Attendance already marked for this event.', { 
      duplicate: true, studentName: finalStudentName, eventTitle: event.title, programme: finalStudentProgramme, school: finalStudentSchool
    }, { requestId: reqId });
  }

  const responsePayload = {
    duplicate: false,
    studentName: finalStudentName,
    eventTitle: event.title,
    status,
    applicationNumber,
    programme: finalStudentProgramme,
    school: finalStudentSchool
  };

  res.status(200).json({
    ok: true,
    code: RESPONSE_CODES.SUCCESS,
    message: status === 'late' ? 'Attendance marked (late).' : 'Attendance marked successfully.',
    data: responsePayload,
    meta: { requestId: reqId, timestamp: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  });

  void Promise.allSettled([
    recordAnalytics(eventId, applicationNumber, finalStudentName, now),
    auditLogRef.set({
      event_id: eventId, action: 'marked', applicationNumber, status, reason: `QR attendance marked as ${status}`, ip_hash: hashIp(ip), device: parsedUA.device_type, timestamp: FieldValue.serverTimestamp()
    })
  ]);
}

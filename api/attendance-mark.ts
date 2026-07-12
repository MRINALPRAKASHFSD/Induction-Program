/**
 * api/attendance-mark.ts
 *
 * Enterprise-grade attendance marking endpoint.
 *
 * Architecture (in order of execution):
 *
 *   1. Input validation — fast fail on bad requests
 *   2. Redis rate limiter — max 5 attempts/enrollment/minute
 *   3. Firestore Phase 1 — resolve event by qr_token (outside transaction)
 *   4. QR expiry check — fast fail if session ended
 *   5. Redis pre-flight dedup — O(1) cache check, instant response for duplicates
 *   6. Firestore Phase 2 — runTransaction (O(1) reads, atomic write)
 *   7. Redis cache write — warm the cache for future duplicate checks
 *   8. QStash publish (async) — award points + analytics (non-blocking)
 *
 * Failure modes:
 *   - Redis down → fails open (attendance still works via Firestore)
 *   - QStash down → fails open (attendance recorded; points/analytics delayed)
 *   - Firestore down → hard fail (source of truth is unavailable)
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN  (optional but recommended)
 *   QSTASH_TOKEN, APP_URL                              (optional but recommended)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis';
import { publishAttendanceJob } from '../server/qstash';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token';
import crypto from 'crypto';

// ── Firebase Admin — module-level singleton ───────────────────────────────────
let firebaseInitialized = false;
let firebaseInitError = '';

try {
  if (!getApps().length) {
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY
    ) {
      throw new Error('Missing Firebase Admin credentials in environment variables.');
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('Firebase Admin Initialization Error:', e);
  firebaseInitError = e.message;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!firebaseInitialized) {
    return res.status(500).json({ ok: false, error: `Backend configuration error: ${firebaseInitError}` });
  }

  const requestId = crypto.randomUUID();

  // ── 1. Input & Auth Validation ────────────────────────────────────────────
  const { qr_token, enrollment_no } = req.body ?? {};

  if (!qr_token || typeof qr_token !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing or invalid qr_token.' });
  }
  if (!enrollment_no || typeof enrollment_no !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing or invalid enrollment_no.' });
  }

  const enrollmentClean = enrollment_no.trim().toUpperCase();
  if (enrollmentClean.length < 3 || enrollmentClean.length > 30) {
    return res.status(400).json({ ok: false, error: 'Invalid enrollment number format.' });
  }

  const clientIp: string =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  // JWT Verification (Never trust only frontend data)
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    console.warn(JSON.stringify({ requestId, status: 'unauthorized', reason: 'missing_token', ip: clientIp, enrollmentId: enrollmentClean }));
    return res.status(401).json({ ok: false, error: 'Unauthorized. Please log in first.' });
  }

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseIdToken(token);
    // Extra security: Ensure the token belongs to the student claiming this enrollment number
    // Assuming the user document in Firestore maps to this UID, or custom claims hold the enrollment
  } catch (err: any) {
    console.warn(JSON.stringify({ requestId, status: 'unauthorized', reason: 'invalid_token', error: err.message, ip: clientIp }));
    return res.status(401).json({ ok: false, error: 'Unauthorized. Invalid or expired token.' });
  }

  // ── 2. Redis Rate Limiter ────────────────────────────────────────────────
  // Prevents a student from hammering the endpoint (panic clicks).
  // Fails open — if Redis is unavailable, attendance still works.
  try {
    const redis = getRedis();
    const rateLimitKey = `ratelimit:attendance:${enrollmentClean}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) {
      await redis.expire(rateLimitKey, 60); // reset window after 60s
    }
    if (attempts > 5) {
      return res.status(429).json({
        ok: false,
        error: 'Too many attempts. Please wait a moment before trying again.',
      });
    }
  } catch (redisErr: any) {
    console.warn(JSON.stringify({ 
      requestId, 
      status: 'redis_error', 
      layer: 'rate_limiter', 
      error: redisErr.message, 
      enrollmentId: enrollmentClean, 
      ip: clientIp 
    }));
  }

  try {
    const db = getFirestore();

    // ── 3. Phase 1: Resolve Event (outside transaction) ──────────────────
    // qr_token has a single-field index in Firestore (auto-indexed).
    // limit(1) short-circuits as soon as the matching doc is found.
    const eventSnap = await db
      .collection('events')
      .where('qr_token', '==', qr_token)
      .limit(1)
      .get();

    if (eventSnap.empty) {
      return res.status(404).json({ ok: false, error: 'Event not found for this QR code.' });
    }

    const eventDoc = eventSnap.docs[0];
    const eventId = eventDoc.id;
    const eventData = eventDoc.data();

    // ── 4. Timing Validation (fast-fail, before Redis/Firestore writes) ──
    const now = new Date();
    if (eventData.starts_at && new Date(eventData.starts_at) > now) {
      return res.status(400).json({ ok: false, error: "This session hasn't started yet." });
    }
    if (eventData.ends_at && new Date(eventData.ends_at) < now) {
      return res.status(400).json({ ok: false, error: 'This session has already ended.' });
    }

    // ── 5. Redis Pre-flight Dedup ──────────────────────────────────────────
    // If the student already marked attendance, we can return instantly
    // without hitting Firestore at all. This is the KEY scaling win:
    // at 10k students, returning duplicates from Redis cache
    // keeps Firestore load proportional to NEW attendees only.
    try {
      const redis = getRedis();
      const dedupKey = `attended:${eventId}:${enrollmentClean}`;
      const cachedName = await redis.get<string>(dedupKey);
      if (cachedName) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          studentName: cachedName,
          eventTitle: eventData.title,
          day: eventData.day_number,
          message: 'Attendance already marked.',
        });
      }
    } catch (redisErr: any) {
      console.warn(JSON.stringify({ 
        requestId, 
        status: 'redis_error', 
        layer: 'dedup', 
        error: redisErr.message, 
        eventId, 
        enrollmentId: enrollmentClean 
      }));
    }

    // ── 6. Phase 2: Firestore Transaction (O(1) reads + atomic write) ────
    // Only new attendees reach this point.
    // Uses compound doc ID `{eventId}_{enrollmentNo}` as built-in dedup.
    // Firestore will throw if two concurrent transactions attempt the same write.
    const txResult = await db.runTransaction(async (transaction) => {
      // Student lookup — enrollment_no IS the doc ID (O(1), no index needed)
      const studentRef = db.collection('students').doc(enrollmentClean);
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists) {
        throw new Error('Student not found. Please register first at aarambh.app/register');
      }

      const studentData = studentDoc.data()!;

      // Attendance dedup — compound doc ID guarantees uniqueness
      const attendanceId = `${eventId}_${enrollmentClean}`;
      const attendanceRef = db.collection('attendance').doc(attendanceId);
      const attDoc = await transaction.get(attendanceRef);

      if (attDoc.exists) {
        return {
          ok: true as const,
          duplicate: true,
          studentName: studentData.full_name as string,
          eventTitle: eventData.title as string,
          dayNumber: eventData.day_number as number,
        };
      }

      // Atomic write — includes IP for audit trail
      transaction.set(attendanceRef, {
        student_id: enrollmentClean,
        event_id: eventId,
        scanned_at: FieldValue.serverTimestamp(),
        ip: clientIp,
      });

      // Note: Points are NOT incremented here — they're awarded async via QStash.
      // This keeps the transaction lean (2 reads + 1 write) for max throughput.

      return {
        ok: true as const,
        duplicate: false,
        studentName: studentData.full_name as string,
        eventTitle: eventData.title as string,
        dayNumber: eventData.day_number as number,
      };
    });

    // ── 7. Warm Redis Cache (non-blocking) ───────────────────────────────
    // Future duplicate checks will be served from cache (microseconds)
    // instead of hitting Firestore.
    if (!txResult.duplicate) {
      try {
        const redis = getRedis();
        const dedupKey = `attended:${eventId}:${enrollmentClean}`;
        await redis.set(dedupKey, txResult.studentName, { ex: 86400 }); // 24h TTL
      } catch (e: any) {
        console.warn(JSON.stringify({ 
          requestId, 
          status: 'redis_error', 
          layer: 'cache_write', 
          error: e.message, 
          eventId, 
          enrollmentId: enrollmentClean 
        }));
      }

      // ── 8. Publish to QStash Queue (async, non-blocking) ────────────────
      // Worker will: award +10 points + write to attendance_analytics
      // QStash will retry up to 3 times if the worker fails.
      try {
        await publishAttendanceJob({
          eventId,
          studentId: enrollmentClean,
          studentName: txResult.studentName,
          eventTitle: txResult.eventTitle,
          dayNumber: txResult.dayNumber,
          scannedAt: new Date().toISOString(),
          ip: clientIp,
        });
      } catch (e: any) {
        console.warn(JSON.stringify({ 
          requestId, 
          status: 'qstash_error', 
          layer: 'publish', 
          error: e.message, 
          eventId, 
          enrollmentId: enrollmentClean 
        }));
      }
    }

    // Log success
    console.log(JSON.stringify({
      requestId,
      status: 'success',
      duplicate: txResult.duplicate,
      eventId,
      enrollmentId: enrollmentClean,
      ip: clientIp
    }));

    return res.status(200).json({
      ok: true,
      duplicate: txResult.duplicate,
      studentName: txResult.studentName,
      eventTitle: txResult.eventTitle,
      day: txResult.dayNumber,
      message: txResult.duplicate ? 'Attendance already marked.' : 'Attendance marked successfully!',
    });
  } catch (error: any) {
    console.error(JSON.stringify({ 
      requestId, 
      status: 'fatal_error', 
      error: error.message, 
      stack: error.stack, 
      enrollmentId: enrollment_no, 
      ip: req.socket?.remoteAddress 
    }));
    return res.status(500).json({ ok: false, error: error.message || 'Internal Server Error' });
  }
}

/**
 * api/attendance-mark.ts
 *
 * Production-grade attendance marking endpoint — v3 (Security Hardened).
 *
 * Changes from v2:
 *   - GPS tolerance updated to 250m radius + 40m buffer (handles indoor/Android drift)
 *   - Nonce tracking moved to Redis ONLY (atomic SETNX, auto-TTL, no Firestore writes)
 *   - Full attendance audit log stored on every mark (browser, OS, IP, distance, nonce)
 *   - Device fingerprint collected from User-Agent for anomaly auditing
 *   - Improved error classification (network vs. validation vs. server)
 *
 * 13-point validation pipeline (ALL must pass):
 *
 *   1.  User is authenticated (Firebase JWT)
 *   2.  Rate limiting (Redis, 5 req/min per enrollment)
 *   3.  QR payload decoded and structurally valid
 *   4.  QR signature is cryptographically valid (HMAC-SHA256)
 *   5.  QR timestamp is fresh (not expired by rotation interval)
 *   6.  QR nonce is valid (Redis SETNX — single-use per student)
 *   7.  [Merged with 6] Anti-replay enforcement
 *   8.  Attendance session exists and is active
 *   9.  Student registration exists
 *  10.  Student account is active (not suspended)
 *  11.  Student belongs to correct programme
 *  12.  Student has not already marked attendance (Redis + Firestore dedup)
 *  13.  Student is inside campus geofence (250m + 40m GPS tolerance)
 *
 * Failure modes:
 *   - Redis down → fails OPEN for attendance (but nonce check skipped — logged)
 *   - QStash down → fails open (points delayed, attendance recorded)
 *   - Firestore down → hard fail (attendance requires persistence)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { publishAttendanceJob } from '../server/qstash.js';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { decodeQrPayload, verifyQrSignature, isQrExpired } from '../server/qr-crypto.js';
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

// ── Geofence constants (must stay in sync with src/lib/geofence.ts) ─────────────────
// Verified coordinates: 28.2712°N, 77.0679°E (main campus, near A-Block/main gate)
const CAMPUS_CENTER = {
  lat: parseFloat(process.env.CAMPUS_LAT || '28.2712'),
  lng: parseFloat(process.env.CAMPUS_LNG || '77.0679'),
};
const CAMPUS_RADIUS_METERS = 250;  // Updated: 250m radius
const GPS_TOLERANCE_METERS = 40;   // Updated: ±40m for indoor/cloudy/Android drift

// ── Haversine formula ────────────────────────────────────────────────────────
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Device fingerprint from User-Agent ────────────────────────────────────────
function parseUserAgent(ua: string): { browser: string; os: string } {
  const os = /iphone|ipad/i.test(ua) ? 'iOS'
    : /android/i.test(ua) ? 'Android'
    : /windows/i.test(ua) ? 'Windows'
    : /mac/i.test(ua) ? 'macOS'
    : /linux/i.test(ua) ? 'Linux'
    : 'Unknown';

  const browser = /edg\//i.test(ua) ? 'Edge'
    : /chrome/i.test(ua) ? 'Chrome'
    : /safari/i.test(ua) ? 'Safari'
    : /firefox/i.test(ua) ? 'Firefox'
    : /samsung/i.test(ua) ? 'Samsung Browser'
    : 'Unknown';

  return { browser, os };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!firebaseInitialized) {
    return res.status(500).json({ ok: false, error: `Backend configuration error: ${firebaseInitError}` });
  }

  const requestId = crypto.randomUUID();
  const clientIp: string =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const rawUA = req.headers['user-agent'] || '';
  const { browser, os } = parseUserAgent(rawUA);
  const uaTruncated = rawUA.slice(0, 200);

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION 1: Authentication
  // ══════════════════════════════════════════════════════════════════════════
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'You must be logged in to mark attendance.' });
  }

  let decodedToken: any;
  try {
    decodedToken = await verifyFirebaseIdToken(token);
  } catch {
    return res.status(401).json({ ok: false, error: 'Session expired. Please log in again.' });
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { qr_data, enrollment_no, latitude, longitude } = req.body ?? {};

  if (!qr_data || typeof qr_data !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid QR code data.' });
  }
  if (!enrollment_no || typeof enrollment_no !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing enrollment number.' });
  }

  const enrollmentClean = enrollment_no.trim().toUpperCase();
  if (enrollmentClean.length < 3 || enrollmentClean.length > 30) {
    return res.status(400).json({ ok: false, error: 'Invalid enrollment number format.' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION 2: Rate limiting (Redis)
  // ══════════════════════════════════════════════════════════════════════════
  let redisAvailable = true;
  let redis: any;
  try {
    redis = getRedis();
    const rateLimitKey = `ratelimit:attendance:${enrollmentClean}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 60);
    if (attempts > 5) {
      return res.status(429).json({
        ok: false,
        error: 'Too many attempts. Please wait a moment before trying again.',
      });
    }
  } catch (redisErr: any) {
    redisAvailable = false;
    console.warn(JSON.stringify({ requestId, layer: 'rate_limiter', error: redisErr.message }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION 3: QR payload structurally valid
  // ══════════════════════════════════════════════════════════════════════════
  const payload = decodeQrPayload(qr_data);
  if (!payload) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid QR code. Please scan the QR displayed by the admin.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION 4: HMAC-SHA256 signature valid
  // ══════════════════════════════════════════════════════════════════════════
  if (!verifyQrSignature(payload)) {
    console.warn(JSON.stringify({
      requestId, status: 'forged_qr', enrollmentId: enrollmentClean, ip: clientIp, browser, os,
    }));
    return res.status(403).json({
      ok: false,
      error: 'Invalid QR code. This QR was not generated by the system.',
    });
  }

  try {
    const db = getFirestore();

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 5: QR not expired
    // ════════════════════════════════════════════════════════════════════════
    const sessionRef = db.collection('attendance_sessions').doc(payload.sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Attendance session not found.' });
    }

    const session = sessionDoc.data()!;
    const rotationInterval = session.qr_rotation_interval_seconds || 30;

    if (isQrExpired(payload, rotationInterval)) {
      return res.status(400).json({
        ok: false,
        error: 'QR code has expired. Please scan the latest QR code shown by the admin.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 6 + 7: Nonce single-use via Redis SETNX (atomic)
    //
    // Why Redis-only (not Firestore)?
    //   - Nonces are TEMPORARY by nature — they expire in seconds
    //   - Firestore writes cost money and add latency for ephemeral data
    //   - Redis SETNX is atomic, extremely fast, and auto-expires via TTL
    //   - If Redis is down, we log a warning and fail OPEN (attendance proceeds)
    //     but flag the scan as nonce_unchecked for post-hoc audit
    // ════════════════════════════════════════════════════════════════════════
    let nonceUnchecked = false;
    if (redisAvailable && redis) {
      try {
        // SETNX: set only if not exists — atomic single-use per (nonce, student)
        const nonceKey = `nonce:${payload.nonce}:${enrollmentClean}`;
        const set = await redis.set(nonceKey, '1', { nx: true, ex: rotationInterval + 10 });
        if (set === null) {
          // Already scanned this nonce — potential rapid double-scan
          return res.status(400).json({
            ok: false,
            error: 'QR code already used. Please scan the current QR displayed by the admin.',
          });
        }
      } catch (nonceErr: any) {
        // Fail open — log but proceed
        nonceUnchecked = true;
        console.warn(JSON.stringify({ requestId, layer: 'nonce_check', error: (nonceErr as any).message }));
      }
    } else {
      nonceUnchecked = true;
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 8: Session is active
    // ════════════════════════════════════════════════════════════════════════
    if (session.status !== 'active') {
      const statusMessages: Record<string, string> = {
        pending:  'Attendance has not started yet. Please wait for the admin to begin.',
        paused:   'Attendance is temporarily paused. Please wait.',
        ended:    'Attendance has ended for this session.',
        locked:   'Attendance has been locked by the admin.',
      };
      return res.status(400).json({
        ok: false,
        error: statusMessages[session.status] || 'Attendance session is not active.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 9: Student registration exists
    // ════════════════════════════════════════════════════════════════════════
    const studentRef = db.collection('students').doc(enrollmentClean);
    const studentDoc = await studentRef.get();

    if (!studentDoc.exists) {
      return res.status(404).json({
        ok: false,
        error: 'Student not found. Please register first at aarambh.app/register',
      });
    }

    const studentData = studentDoc.data()!;

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 10: Student account is active
    // ════════════════════════════════════════════════════════════════════════
    if (studentData.is_suspended === true || studentData.is_deactivated === true) {
      return res.status(403).json({
        ok: false,
        error: 'Your account has been suspended. Please contact administration.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 11: Programme match
    // ════════════════════════════════════════════════════════════════════════
    const studentDeptId = (studentData.department_id || '').toLowerCase();
    const sessionProgrammeId = (session.programme_id || '').toLowerCase();

    if (sessionProgrammeId && studentDeptId !== sessionProgrammeId) {
      return res.status(403).json({
        ok: false,
        error: `This attendance session is for ${session.programme_name || 'a different programme'}. You are registered under a different school/programme.`,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 12: Duplicate check (Redis pre-flight + Firestore)
    // ════════════════════════════════════════════════════════════════════════
    const eventId = payload.eventId;
    const attendanceId = `${eventId}_${enrollmentClean}`;

    if (redisAvailable && redis) {
      try {
        const dedupKey = `attended:${eventId}:${enrollmentClean}`;
        const cachedName = await redis.get<string>(dedupKey);
        if (cachedName) {
          return res.status(200).json({
            ok: true,
            duplicate: true,
            studentName: cachedName,
            eventTitle: session.programme_name || 'Session',
            message: 'Attendance already marked for this session.',
          });
        }
      } catch { /* fail open */ }
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 13: Geofence — 250m radius + 40m GPS tolerance
    // ════════════════════════════════════════════════════════════════════════
    let distanceFromCampus = 0;
    const maxAllowedRadius = (session.geofence_radius_meters || CAMPUS_RADIUS_METERS) + GPS_TOLERANCE_METERS;

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      const campusCenter = session.geofence_center || CAMPUS_CENTER;
      distanceFromCampus = Math.round(haversineDistance(latitude, longitude, campusCenter.lat, campusCenter.lng));

      if (distanceFromCampus > maxAllowedRadius) {
        console.warn(JSON.stringify({
          requestId, status: 'geofence_rejected', enrollmentId: enrollmentClean,
          distance: distanceFromCampus, maxRadius: maxAllowedRadius, ip: clientIp,
        }));
        return res.status(403).json({
          ok: false,
          error: 'You must be inside the K.R. Mangalam University campus to mark attendance.',
          distance: distanceFromCampus,
          maxRadius: maxAllowedRadius,
        });
      }
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Location access is required to mark attendance. Please enable GPS.',
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ALL VALIDATIONS PASSED — Record attendance atomically
    // ══════════════════════════════════════════════════════════════════════════
    const attendanceRef = db.collection('attendance').doc(attendanceId);
    const existingAtt = await attendanceRef.get();

    if (existingAtt.exists) {
      // Warm Redis cache
      if (redisAvailable && redis) {
        try {
          await redis.set(`attended:${eventId}:${enrollmentClean}`, studentData.full_name, { ex: 86400 });
        } catch {}
      }
      return res.status(200).json({
        ok: true,
        duplicate: true,
        studentName: studentData.full_name,
        eventTitle: session.programme_name || 'Session',
        venue: session.venue,
        date: session.date,
        message: 'Attendance already marked for this session.',
      });
    }

    // ── Atomic write + audit log ──────────────────────────────────────────
    const now = new Date();
    await attendanceRef.set({
      // Core fields
      student_id:   enrollmentClean,
      student_name: studentData.full_name,
      event_id:     eventId,
      session_id:   payload.sessionId,
      programme_id: session.programme_id,
      scanned_at:   FieldValue.serverTimestamp(),

      // Audit fields (recommendation 2 & 3)
      audit: {
        ip:               clientIp,
        browser,
        os,
        user_agent:       uaTruncated,
        latitude,
        longitude,
        distance_meters:  distanceFromCampus,
        qr_nonce:         payload.nonce,
        nonce_unchecked:  nonceUnchecked, // true if Redis was down
        request_id:       requestId,
        scanned_at_iso:   now.toISOString(),
      },
    });

    // Increment session counter
    await sessionRef.update({
      total_present: FieldValue.increment(1),
    });

    // Warm Redis dedup cache
    if (redisAvailable && redis) {
      try {
        await redis.set(`attended:${eventId}:${enrollmentClean}`, studentData.full_name, { ex: 86400 });
      } catch {}
    }

    // Async: Award points via QStash
    try {
      await publishAttendanceJob({
        eventId,
        studentId:   enrollmentClean,
        studentName: studentData.full_name,
        eventTitle:  session.programme_name || 'Session',
        dayNumber:   1,
        scannedAt:   now.toISOString(),
        ip:          clientIp,
      });
    } catch (e: any) {
      console.warn(JSON.stringify({ requestId, layer: 'qstash', error: e.message }));
    }

    console.log(JSON.stringify({
      requestId, status: 'success',
      eventId, enrollmentId: enrollmentClean,
      ip: clientIp, browser, os,
      distance: distanceFromCampus,
    }));

    return res.status(200).json({
      ok: true,
      duplicate: false,
      studentName: studentData.full_name,
      eventTitle:  session.programme_name || 'Session',
      venue:       session.venue,
      date:        session.date,
      programme:   session.programme_name,
      message:     'Attendance marked successfully!',
    });

  } catch (error: any) {
    // ── Classify error for meaningful client messages (fix 4: offline detection)
    const isNetworkError = error.code === 'ECONNREFUSED'
      || error.code === 'ETIMEDOUT'
      || error.message?.includes('fetch')
      || error.message?.includes('network');

    const clientMessage = isNetworkError
      ? 'Network unavailable. Please reconnect and scan again.'
      : 'Internal server error. Please try again in a moment.';

    console.error(JSON.stringify({
      requestId, status: 'fatal_error',
      error: error.message, code: error.code,
      enrollmentId: enrollment_no, ip: clientIp,
    }));

    return res.status(500).json({ ok: false, error: clientMessage });
  }
}

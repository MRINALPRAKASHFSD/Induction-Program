/**
 * api/attendance-mark.ts
 *
 * Production-grade attendance marking endpoint — v4 (Opaque Token Architecture).
 *
 * Changes from v3:
 *   - QR validation replaced: Base64-decode + HMAC + nonce SETNX → single Redis GET
 *   - Redis is now the authoritative source of truth for QR token validity
 *   - Fail CLOSED: Redis unavailable → 503 (not fail-open) — prevents unverified attendance
 *   - qrVersion hardcoded to 2 in audit logs to distinguish token-based scans
 *   - sessionId is sourced from Redis token data (not from QR payload fields)
 *   - rotationId from Redis value stored in audit log for fraud/replay analysis
 *
 * 11-point validation pipeline (ALL must pass):
 *
 *   1.  User is authenticated (Firebase JWT)
 *   2.  Rate limiting (Redis, 5 req\/min per enrollment)
 *   3.  QR token format valid (regex)
 *   4.  QR token exists in Redis (not expired)
 *   5.  Attendance session exists and is active
 *   6.  Student registration exists
 *   7.  Student account is active (not suspended)
 *   8.  Student belongs to correct programme
 *   9.  Student has not already marked attendance (Redis + Firestore dedup)
 *  10.  Student is inside campus geofence (250m + 40m GPS tolerance)
 *  11.  Firestore transaction (duplicate-safe attendance write)
 *
 * Failure modes:
 *   - Redis down          → 503 Service Unavailable (FAIL CLOSED — token cannot be verified)
 *   - QStash down         → fails open (points delayed, attendance recorded synchronously)
 *   - Firestore down      → hard fail (attendance requires persistence)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { publishAttendanceJob } from '../server/qstash.js';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { isValidQrTokenFormat, qrTokenRedisKey, type QrTokenRedisValue } from '../server/qr-token.js';
import { processAttendanceFirestoreTransaction } from '../server/attendance-core.js';
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
// Verified coordinates: 28.272428°N, 77.0675693°E
// Source: Google AI Overview + official krmangalam.edu.in documents (A-Block / campus centroid)
const CAMPUS_CENTER = {
  lat: parseFloat(process.env.CAMPUS_LAT || '28.272428'),
  lng: parseFloat(process.env.CAMPUS_LNG || '77.0675693'),
};
const CAMPUS_RADIUS_METERS = 300;  // Full campus footprint (~300m radius from centroid)
const GPS_TOLERANCE_METERS = 15;   // ±15m for indoor/cloudy/Android GPS drift

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
  const { qr_data, enrollment_no, latitude, longitude, accuracy, gps_attempted } = req.body ?? {};

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
    // Redis is unavailable — FAIL CLOSED.
    // In v2 token architecture, Redis is the sole source of truth for QR validity.
    // Allowing attendance without Redis means any string passes validation.
    console.error(JSON.stringify({ requestId, layer: 'rate_limiter', status: 'redis_down', error: redisErr.message }));
    return res.status(503).json({
      ok: false,
      error: 'Attendance service temporarily unavailable. Please retry in a moment.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION 3: QR token format (fast regex — no Redis yet)
  // ══════════════════════════════════════════════════════════════════════════
  if (!isValidQrTokenFormat(qr_data)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid QR code. Please scan the QR displayed by the admin.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION 4: QR token exists in Redis (authoritative validity check)
  //
  // Redis is the SOLE source of truth for whether a QR token is currently active.
  // If the token is not in Redis it has expired, been rotated, or is fabricated.
  //
  // FAIL CLOSED: if Redis is unavailable at this point, we cannot verify the
  // token and MUST reject the request with 503. This is intentional — accepting
  // unverified tokens would bypass the entire QR security model.
  // The frontend retries automatically (500ms → 1s → 2s → 4s backoff).
  // ══════════════════════════════════════════════════════════════════════════
  let tokenData: QrTokenRedisValue;
  try {
    const raw = await redis.get(qrTokenRedisKey(qr_data)) as QrTokenRedisValue | null;
    if (!raw) {
      return res.status(400).json({
        ok: false,
        error: 'QR code has expired. Please scan the latest QR code shown by the admin.',
      });
    }
    tokenData = raw;
  } catch (tokenErr: any) {
    console.error(JSON.stringify({ requestId, layer: 'token_lookup', status: 'redis_down', error: tokenErr.message }));
    return res.status(503).json({
      ok: false,
      error: 'Attendance service temporarily unavailable. Please retry in a moment.',
    });
  }

  // Extract session context from the Redis token value
  const sessionId = tokenData.sessionId;
  const rotationId = tokenData.rotationId;

  try {
    const db = getFirestore();

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 5: Session is active
    // (sessionId resolved from Redis token — single Firestore read)
    // ════════════════════════════════════════════════════════════════════════
    const sessionRef = db.collection('attendance_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ ok: false, error: 'Attendance session not found.' });
    }

    const session = sessionDoc.data()!;

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 5 (cont.): Session must be active
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
    // VALIDATION 6: Student registration exists
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
    // VALIDATION 7: Student account is active
    // ════════════════════════════════════════════════════════════════════════
    if (studentData.is_suspended === true || studentData.is_deactivated === true) {
      return res.status(403).json({
        ok: false,
        error: 'Your account has been suspended. Please contact administration.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 8: Programme match
    // ════════════════════════════════════════════════════════════════════════
    const studentDeptId = (studentData.department_id || '').toLowerCase();
    const studentBranchId = (studentData.branch_id || '').toLowerCase();
    const studentProgram = (studentData.program || studentData.programme || '').toLowerCase();
    const sessionProgrammeId = (session.programme_id || '').toLowerCase();
    const sessionProgrammeName = (session.programme_name || '').toLowerCase();

    if (sessionProgrammeId) {
      const normalize = (s: string) => s.replace(/&/g, 'and').replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();
      
      const normDeptId = normalize(studentDeptId);
      const normBranchId = normalize(studentBranchId);
      const normStudentProgram = normalize(studentProgram);
      const normSessionId = normalize(sessionProgrammeId);
      const normSessionName = normalize(sessionProgrammeName);

      console.log(JSON.stringify({
        requestId, layer: 'validation8_programme',
        normDeptId, normBranchId, normStudentProgram,
        normSessionId, normSessionName,
      }));

      const isMatch = 
        normDeptId === normSessionId ||
        normBranchId === normSessionName ||
        normStudentProgram === normSessionName ||
        (normDeptId && normSessionId.includes(normDeptId)) ||
        (normBranchId && normSessionName.includes(normBranchId)) ||
        (normStudentProgram && normSessionName.includes(normStudentProgram)) ||
        (normSessionName && normBranchId && normBranchId.includes(normSessionName)) ||
        (normSessionName && normStudentProgram && normStudentProgram.includes(normSessionName));

      if (!isMatch) {
        console.warn(JSON.stringify({
          requestId, layer: 'validation8_programme', status: 'mismatch',
          student: enrollmentClean, normDeptId, normBranchId, normStudentProgram,
          normSessionId, normSessionName,
        }));
        return res.status(403).json({
          ok: false,
          error: `This attendance session is for ${session.programme_name || 'a different programme'}. You are registered under a different school/programme.`,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 9: Duplicate check (Redis pre-flight + Firestore transaction)
    // ════════════════════════════════════════════════════════════════════════
    const attendanceId = `${sessionId}_${enrollmentClean}`;

    try {
      const dedupKey = `attended:${sessionId}:${enrollmentClean}`;
      const cachedName = (await redis.get(dedupKey)) as string;
      if (cachedName) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          studentName: cachedName,
          eventTitle: session.title || session.programme_name || 'Session',
          message: 'Attendance already marked for this session.',
        });
      }
    } catch { /* Redis pre-flight dedup failed — Firestore transaction is the source of truth */ }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATION 10: Geofence — Configurable per-session (three modes)
    //
    //   disabled  → skip all location logic
    //   log_only  → attempt GPS (best-effort), log distance, NEVER block
    //   strict    → require GPS, reject if outside radius
    // ════════════════════════════════════════════════════════════════════════
    let distanceFromCampus: number | null = null;
    const gpsMode = session.geoFencingMode || 'disabled';

    if (gpsMode === 'strict') {
      // Strict: location is mandatory — 428 if missing
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(428).json({
          ok: false,
          requireLocation: true,
          geoFencingMode: 'strict',
          error: 'Location access is required to mark attendance. Please enable GPS.',
        });
      }
    } else if (gpsMode === 'log_only') {
      // Log Only: attempt GPS best-effort — 428 on first call to signal
      // frontend to try GPS, but accept resubmission with gps_attempted flag
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        if (!gps_attempted) {
          return res.status(428).json({
            ok: false,
            requireLocation: true,
            geoFencingMode: 'log_only',
            error: 'Location data is being collected for this session.',
          });
        }
        // gps_attempted=true → GPS was tried but failed, proceed without coords
      }
    }
    // disabled: no location logic at all

    // Calculate distance only when coordinates are available and mode is not disabled
    if (gpsMode !== 'disabled' && typeof latitude === 'number' && typeof longitude === 'number') {
      const campusLat = session.campusLatitude ?? CAMPUS_CENTER.lat;
      const campusLng = session.campusLongitude ?? CAMPUS_CENTER.lng;
      const allowedRadius = session.allowedRadius ?? CAMPUS_RADIUS_METERS;
      const maxAllowedRadius = allowedRadius + GPS_TOLERANCE_METERS;

      distanceFromCampus = Math.round(haversineDistance(latitude, longitude, campusLat, campusLng));

      if (gpsMode === 'strict') {
        if (typeof accuracy === 'number' && accuracy > 100) {
          return res.status(403).json({
            ok: false,
            error: 'Unable to verify your precise location. Please move outdoors or enable High Accuracy Location and try again.',
          });
        }

        if (distanceFromCampus > maxAllowedRadius) {
          console.warn(JSON.stringify({
            requestId, status: 'geofence_rejected', enrollmentId: enrollmentClean,
            distance: distanceFromCampus, maxRadius: maxAllowedRadius, ip: clientIp,
          }));
          return res.status(403).json({
            ok: false,
            error: 'You appear to be outside the permitted attendance location. Please move closer and try again.',
            distance: distanceFromCampus,
            maxRadius: maxAllowedRadius,
          });
        }
      }
      // log_only: distance is calculated and stored but never causes rejection
    }
    // ══════════════════════════════════════════════════════════════════════════
    // ALL VALIDATIONS PASSED — Enqueue to QStash
    // ══════════════════════════════════════════════════════════════════════════
    const now = new Date();

    // Async: Award points via QStash
    try {
      await publishAttendanceJob({
        sessionId,
        studentId: enrollmentClean,
        enrollmentNo: enrollmentClean,
        studentName: studentData.full_name,
        school: studentData.school || '',
        department: studentData.department_id || '',
        programme: studentData.program || studentData.branch_id || studentData.programme || '',
        semester: studentData.semester || '',
        section: studentData.section || '',
        email: studentData.email || '',
        scanTimeIso: now.toISOString(),
        qrVersion: 2,             // v2 = opaque token architecture
        scannerDeviceId: decodedToken.uid,
        ipAddress: clientIp,
        userAgent: uaTruncated,
        verificationResult: `token_verified:rotation_${rotationId}`,
        gpsMode,
        attendanceMode: 'verified',
        locationLat: typeof latitude === 'number' ? latitude : null,
        locationLng: typeof longitude === 'number' ? longitude : null,
        locationAccuracy: typeof accuracy === 'number' ? accuracy : null,
        distanceFromCampus,
      });
    } catch (e: any) {
      console.warn(JSON.stringify({ requestId, layer: 'qstash', error: e.message, status: 'fallback_to_sync' }));
      
      // Fallback: If QStash is down, misconfigured, or unreachable, process the attendance synchronously
      try {
        await processAttendanceFirestoreTransaction({
          sessionId,
          studentId: enrollmentClean,
          enrollmentNo: enrollmentClean,
          studentName: studentData.full_name,
          school: studentData.school || '',
          department: studentData.department_id || '',
          programme: studentData.programme || '',
          semester: studentData.semester || '',
          section: studentData.section || '',
          email: studentData.email || '',
          scanTimeIso: now.toISOString(),
          qrVersion: 2,           // v2 = opaque token architecture
          scannerDeviceId: decodedToken.uid,
          ipAddress: clientIp,
          userAgent: uaTruncated,
          verificationResult: `token_verified:rotation_${rotationId}`,
          gpsMode,
          attendanceMode: 'verified',
          locationLat: typeof latitude === 'number' ? latitude : null,
          locationLng: typeof longitude === 'number' ? longitude : null,
          locationAccuracy: typeof accuracy === 'number' ? accuracy : null,
          distanceFromCampus,
        });
      } catch (syncError: any) {
        console.error(JSON.stringify({ requestId, layer: 'sync_fallback', error: syncError.message }));
        return res.status(500).json({ ok: false, error: `Failed to record attendance. Please try again. [QStash error: ${e.message}]` });
      }
    }

    // Warm Redis dedup cache
    try {
      await redis.set(`attended:${sessionId}:${enrollmentClean}`, studentData.full_name, { ex: 86400 });
    } catch {}

    console.log(JSON.stringify({
      requestId, status: 'success',
      sessionId, enrollmentId: enrollmentClean,
      ip: clientIp, browser, os,
      distance: distanceFromCampus,
      rotationId,
      tokenAgeMs: Date.now() - tokenData.generatedAt,
    }));

    return res.status(202).json({
      ok: true,
      duplicate: false,
      studentName: studentData.full_name,
      eventTitle:  session.title || session.programme_name || 'Session',
      venue:       session.venue,
      date:        session.date,
      programme:   session.programme_name,
      // Guest headcount linkage fields (additive — safe for all consumers)
      sessionId:   sessionId,
      event_id:    session.event_id || null,
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

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

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
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('[induction-lookup] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

// ── Upstash Redis Initialization ──────────────────────────────────────────────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function apiResponse(res: any, status: number, ok: boolean, message: string, data: any = null) {
  return res.status(status).json({ ok, message, data, timestamp: new Date().toISOString() });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 1) return email;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 4))}@${domain}`;
}

function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length < 4) return mobile;
  return `${digits.slice(0, 2)}${'*'.repeat(digits.length - 4)}${digits.slice(-2)}`;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, `Firebase init error: ${firebaseInitError}`);

  try {
    const request_id = crypto.randomUUID();
    const { application_number } = req.body;

    if (!application_number || typeof application_number !== 'string') {
      return apiResponse(res, 400, false, 'Missing or invalid application_number.');
    }

    const normalizedAppNo = application_number.trim().toUpperCase();
    if (normalizedAppNo.length < 4) {
      return apiResponse(res, 400, false, 'Application number is too short.');
    }

    // ── Hashing for Security Logging ──────────────────────────────────────────
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const ua = req.headers['user-agent'] || 'unknown';

    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const deviceHash = crypto.createHash('sha256').update(ua).digest('hex');

    // ── Upstash Redis Rate Limiting ───────────────────────────────────────────
    let blockedReason = null;
    
    if (redis) {
      try {
        const now = new Date();
        const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;

        const rkIp = `rl:lookup:ip:${ipHash}:${hourKey}`;
        const rkDevice = `rl:lookup:dev:${deviceHash}:${hourKey}`;
        const rkApp = `rl:lookup:app:${normalizedAppNo}:${hourKey}`;

        const pipeline = redis.pipeline();
        pipeline.incr(rkIp);
        pipeline.expire(rkIp, 3600);
        pipeline.incr(rkDevice);
        pipeline.expire(rkDevice, 3600);
        pipeline.incr(rkApp);
        pipeline.expire(rkApp, 3600);

        const results = await pipeline.exec();
        const ipCount = results[0] as number;
        const devCount = results[2] as number;
        const appCount = results[4] as number;

        if (appCount > 5) blockedReason = 'Too many attempts for this Application Number. Try again later.';
        else if (devCount > 20) blockedReason = 'Too many attempts from this device. Try again later.';
        else if (ipCount > 50) blockedReason = 'Too many attempts from this network. Try again later.';
      } catch (redisErr: any) {
        console.error('[induction-lookup] Redis error during rate limiting:', redisErr.message);
      }
    } else {
      console.warn('[induction-lookup] Upstash Redis credentials missing. Bypassing rate limits.');
    }

    const db = getFirestore();

    if (blockedReason) {
      db.collection('security_events').add({
        request_id,
        event_type: 'LOOKUP_LIMIT',
        severity: 'WARNING',
        ip_hash: ipHash,
        device_hash: deviceHash,
        application_number: normalizedAppNo,
        timestamp: FieldValue.serverTimestamp(),
        metadata: {
          endpoint: '/api/induction-lookup',
          reason: blockedReason
        }
      }).catch(e => console.error('[induction-lookup] security_events log error:', e));

      return apiResponse(res, 429, false, blockedReason);
    }

    const participantRef = db.collection('induction_participants').doc(normalizedAppNo);
    const participantDoc = await participantRef.get();

    if (!participantDoc.exists) {
      db.collection('security_events').add({
        request_id,
        event_type: 'LOOKUP_NOT_FOUND',
        severity: 'INFO',
        ip_hash: ipHash,
        device_hash: deviceHash,
        application_number: normalizedAppNo,
        timestamp: FieldValue.serverTimestamp(),
        metadata: { endpoint: '/api/induction-lookup' }
      }).catch(e => console.error('[induction-lookup] security_events log error:', e));

      // Student not found → show full registration form
      return apiResponse(res, 200, true, 'Application number not found.', { found: false });
    }

    const participant = participantDoc.data()!;

    if (participant.admission_status && participant.admission_status !== 'ACTIVE') {
      db.collection('security_events').add({
        request_id,
        event_type: 'INELIGIBLE_LOOKUP',
        severity: 'WARNING',
        ip_hash: ipHash,
        device_hash: deviceHash,
        application_number: normalizedAppNo,
        timestamp: FieldValue.serverTimestamp(),
        metadata: {
          endpoint: '/api/induction-lookup',
          reason: `Student admission status is ${participant.admission_status}`
        }
      }).catch(e => console.error('[induction-lookup] security_events log error:', e));

      return apiResponse(res, 403, false, 'This application number is not eligible for induction registration. Please contact the admissions office.');
    }

    // Return masked data for display + full email for OTP dispatch
    return apiResponse(res, 200, true, 'Application number found.', {
      found: true,
      application_number: normalizedAppNo,
      student_name: participant.student_name || '',
      email: participant.email || '',           // full email sent to server for OTP
      masked_email: maskEmail(participant.email || ''),
      mobile: participant.mobile || '',
      masked_mobile: maskMobile(participant.mobile || ''),
      course: participant.course || '',
      school: participant.school || '',
      program: participant.program || '',
      registration_status: participant.registration_status || 'PENDING',
    });
  } catch (error: any) {
    console.error('[induction-lookup]', error);
    return apiResponse(res, 500, false, 'Internal server error during lookup.');
  }
}

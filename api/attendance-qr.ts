/**
 * api/attendance-qr.ts
 *
 * Admin-only QR token generation and rotation endpoint — v2 (Opaque Token Model).
 *
 * Actions:
 *   POST { action: "generate", sessionId }  → Generate new token (or rotate existing)
 *   POST { action: "current",  sessionId }  → Get current active token for display;
 *                                              auto-rotates when expired
 *
 * v2 Architecture:
 *   - QR contains ONLY an opaque token: att_<22 Base62 chars>
 *   - Token→session mapping stored in Redis with TTL = rotation interval
 *   - Token self-expires — no nonce Firestore collection, no HMAC secrets
 *   - rotationId monotonically increments per session for audit/fraud analysis
 *   - generatedAt stored for scan-latency diagnostics
 *
 * Security:
 *   - Only admin JWT with super_admin / coordinator role
 *   - Token is 192-bit random — guessing probability ≈ 2^-131 per attempt
 *   - Replay prevention via Redis TTL (expired token → no Redis hit → rejected)
 *   - Students never see token generation; QR rendering is admin-only
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { getRedis } from '../server/redis.js';
import {
  generateQrToken,
  qrTokenRedisKey,
  type QrTokenRedisValue,
} from '../server/qr-token.js';

// ── Firebase Admin singleton ──────────────────────────────────────────────────
let firebaseInitialized = false;

try {
  if (!getApps().length) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('Firebase Admin Init Error (attendance-qr):', e.message);
}

/**
 * Generate a new QR token, store it in Redis with TTL, and update the session document.
 *
 * Redis key:  attendance:qr:<token>
 * Redis TTL:  rotationIntervalSeconds
 * Redis value: { sessionId, eventId, rotationId, generatedAt, expiresAt }
 *
 * Firestore session update: current_qr_token, current_qr_generated_at, qr_rotation_id
 *
 * No Firestore subcollections. No HMAC. No nonce storage.
 */
async function rotateQr(
  db: FirebaseFirestore.Firestore,
  sessionId: string,
  eventId: string,
  rotationIntervalSeconds: number,
  currentRotationId: number,
): Promise<{ token: string; rotationId: number; generatedAt: number }> {

  const redis = getRedis();
  const token = generateQrToken();
  const now = Date.now();
  const newRotationId = currentRotationId + 1;

  const redisValue: QrTokenRedisValue = {
    sessionId,
    eventId,
    rotationId: newRotationId,
    generatedAt: now,
    expiresAt: now + rotationIntervalSeconds * 1000,
  };

  // Store token in Redis with hard TTL — this is the authoritative expiry.
  // Add +5s grace to tolerate network latency between generation and first poll.
  await redis.set(
    qrTokenRedisKey(token),
    redisValue,
    { ex: rotationIntervalSeconds + 5 },
  );

  // Update session with current token reference (for admin "current" polls)
  const sessionRef = db.collection('attendance_sessions').doc(sessionId);
  await sessionRef.update({
    current_qr_token: token,
    current_qr_generated_at: new Date(now).toISOString(),
    qr_rotation_id: newRotationId,
    updated_at: FieldValue.serverTimestamp(),
  });

  return { token, rotationId: newRotationId, generatedAt: now };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!firebaseInitialized) return res.status(500).json({ error: 'Backend not configured' });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseIdToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const role = decodedToken.role;
  if (role !== 'super_admin' && role !== 'coordinator') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { action, sessionId } = req.body ?? {};
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const db = getFirestore();

  try {
    // Fetch session
    const sessionRef = db.collection('attendance_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionDoc.data()!;

    if (session.status !== 'active' && action !== 'generate') {
      return res.status(400).json({ error: `Session is ${session.status}. Start the session first.` });
    }

    switch (action) {
      // ── GENERATE / FORCE ROTATE ─────────────────────────────────────────────
      case 'generate': {
        if (session.status !== 'active' && session.status !== 'pending') {
          return res.status(400).json({ error: `Cannot generate QR for ${session.status} session.` });
        }

        // If session is still pending, auto-start it on first QR generation
        if (session.status === 'pending') {
          await sessionRef.update({ status: 'active', updated_at: FieldValue.serverTimestamp() });
        }

        const rotationInterval = session.qr_rotation_interval_seconds || 30;
        const currentRotationId = session.qr_rotation_id || 0;

        const result = await rotateQr(db, sessionId, session.event_id, rotationInterval, currentRotationId);

        return res.status(200).json({
          ok: true,
          // qr_encoded field name kept unchanged — frontend passes this directly to QRCode.toDataURL()
          // In v2, this is the raw opaque token string (not a Base64url blob)
          qr_encoded: result.token,
          rotation_id: result.rotationId,
          generated_at: result.generatedAt,
          rotation_interval: rotationInterval,
        });
      }

      // ── CURRENT (with auto-rotation) ────────────────────────────────────────
      case 'current': {
        const rotationInterval = session.qr_rotation_interval_seconds || 30;
        const currentRotationId = session.qr_rotation_id || 0;
        const lastGenerated = session.current_qr_generated_at
          ? new Date(session.current_qr_generated_at).getTime()
          : 0;
        const elapsed = (Date.now() - lastGenerated) / 1000;
        const remainingSeconds = Math.max(0, Math.floor(rotationInterval - elapsed));

        // Auto-rotate only when token is actually expired or does not exist yet.
        // Do NOT regenerate on every poll — Redis writes are cheap but not free.
        if (!session.current_qr_token || elapsed >= rotationInterval) {
          const result = await rotateQr(db, sessionId, session.event_id, rotationInterval, currentRotationId);

          return res.status(200).json({
            ok: true,
            qr_encoded: result.token,
            rotation_id: result.rotationId,
            generated_at: result.generatedAt,
            rotation_interval: rotationInterval,
            rotated: true,
            next_rotation_in: rotationInterval,
          });
        }

        // Token is still valid — return the stored token without writing to Redis/Firestore.
        // Admin frontend holds the encoded QR image from the last rotated=true response.
        // It uses next_rotation_in to display the countdown timer.
        return res.status(200).json({
          ok: true,
          // NOTE: When rotated=false, frontend already has the QR image from the last rotation.
          // We omit qr_encoded here to avoid redundant data transfer on every poll.
          rotation_id: currentRotationId,
          generated_at: lastGenerated,
          rotation_interval: rotationInterval,
          rotated: false,
          next_rotation_in: remainingSeconds,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('attendance-qr error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

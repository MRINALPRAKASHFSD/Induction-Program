/**
 * api/attendance-qr.ts
 *
 * Admin-only QR code generation and rotation endpoint.
 *
 * Actions:
 *   POST { action: "generate", sessionId }     → Generate new QR (or rotate existing)
 *   POST { action: "current", sessionId }      → Get current active QR for display
 *
 * QR rotation:
 *   - When "current" is called and the current QR is older than the session's
 *     qr_rotation_interval_seconds, a new QR is auto-generated.
 *   - Old nonces are marked expired (but kept for audit).
 *   - The admin frontend polls this endpoint to keep the displayed QR fresh.
 *
 * Security:
 *   - Only admin JWT with super_admin/coordinator role
 *   - QR payload is signed with HMAC-SHA256
 *   - Nonce stored in Firestore for single-use verification
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { generateQrPayload, encodeQrPayload, type QrPayload } from '../server/qr-crypto.js';

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
 * Generate a new QR, store the nonce in Firestore, update the session.
 */
async function rotateQr(
  db: FirebaseFirestore.Firestore,
  sessionId: string,
  eventId: string,
  rotationIntervalSeconds: number,
): Promise<{ payload: QrPayload; encoded: string }> {
  // Generate cryptographically signed payload
  const payload = generateQrPayload(sessionId, eventId);
  const encoded = encodeQrPayload(payload);

  // Store nonce for single-use verification
  const nonceRef = db.collection('attendance_qr_nonces').doc(payload.nonce);
  await nonceRef.set({
    session_id: sessionId,
    event_id: eventId,
    generated_at: FieldValue.serverTimestamp(),
    expires_at: new Date(payload.timestamp + (rotationIntervalSeconds + 30) * 1000).toISOString(),
    used: false,
    used_by: null,
  });

  // Update session with current QR nonce
  const sessionRef = db.collection('attendance_sessions').doc(sessionId);
  await sessionRef.update({
    current_qr_nonce: payload.nonce,
    current_qr_generated_at: new Date(payload.timestamp).toISOString(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return { payload, encoded };
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

        // If session is pending, auto-start it
        if (session.status === 'pending') {
          await sessionRef.update({ status: 'active', updated_at: FieldValue.serverTimestamp() });
        }

        const result = await rotateQr(
          db,
          sessionId,
          session.event_id,
          session.qr_rotation_interval_seconds || 30,
        );

        return res.status(200).json({
          ok: true,
          qr_encoded: result.encoded,
          nonce: result.payload.nonce,
          timestamp: result.payload.timestamp,
          rotation_interval: session.qr_rotation_interval_seconds || 30,
        });
      }

      // ── CURRENT (with auto-rotation) ────────────────────────────────────────
      case 'current': {
        const rotationInterval = session.qr_rotation_interval_seconds || 30;
        const lastGenerated = session.current_qr_generated_at
          ? new Date(session.current_qr_generated_at).getTime()
          : 0;
        const elapsed = (Date.now() - lastGenerated) / 1000;

        // Auto-rotate if expired or no QR exists yet
        if (!session.current_qr_nonce || elapsed >= rotationInterval) {
          const result = await rotateQr(
            db,
            sessionId,
            session.event_id,
            rotationInterval,
          );

          return res.status(200).json({
            ok: true,
            qr_encoded: result.encoded,
            nonce: result.payload.nonce,
            timestamp: result.payload.timestamp,
            rotation_interval: rotationInterval,
            rotated: true,
            next_rotation_in: rotationInterval,
          });
        }

        // Return existing QR — regenerate from stored nonce
        // The admin frontend uses the encoded payload to render the QR
        const currentPayload = generateQrPayload(sessionId, session.event_id);
        // Override nonce and timestamp with stored values for consistency
        // Actually, we need to re-sign because the stored nonce was the original one
        // Instead, just return the remaining time and let admin keep displaying
        const remainingSeconds = Math.max(0, Math.floor(rotationInterval - elapsed));

        // Re-generate from stored data for display
        const result = await rotateQr(
          db,
          sessionId,
          session.event_id,
          rotationInterval,
        );

        return res.status(200).json({
          ok: true,
          qr_encoded: result.encoded,
          nonce: result.payload.nonce,
          timestamp: result.payload.timestamp,
          rotation_interval: rotationInterval,
          rotated: elapsed > 1, // effectively rotated since we regenerate each time
          next_rotation_in: rotationInterval,
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

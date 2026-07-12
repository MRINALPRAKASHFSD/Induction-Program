/**
 * api/attendance-worker.ts
 *
 * QStash Worker — processes attendance jobs asynchronously.
 *
 * Called by Upstash QStash after each successful attendance mark.
 * Responsibilities:
 *   1. Verify the QStash signature (security — prevents spoofing)
 *   2. Award +10 points to the student in Firestore
 *   3. Write a denormalized analytics record for the admin dashboard
 *
 * QStash retry policy: 3 retries with exponential backoff.
 * If all retries fail → logged in QStash dead letter queue (no data lost).
 *
 * Required env vars (same as attendance-mark.ts plus):
 *   QSTASH_CURRENT_SIGNING_KEY  — from Upstash QStash dashboard
 *   QSTASH_NEXT_SIGNING_KEY     — for rolling key rotation
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Receiver } from '@upstash/qstash';
import type { AttendanceJobPayload } from '../server/qstash';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!firebaseInitialized) {
    return res.status(500).json({ error: `Backend configuration error: ${firebaseInitError}` });
  }

  // ── 1. Verify QStash Signature ────────────────────────────────────────────
  // This prevents anyone from calling the worker endpoint directly.
  // QStash signs every delivery with HMAC-SHA256.
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (currentKey && nextKey) {
    try {
      const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });

      const rawBody = JSON.stringify(req.body);
      const signature = req.headers['upstash-signature'] as string;

      const isValid = await receiver.verify({
        signature,
        body: rawBody,
      });

      if (!isValid) {
        console.error('[attendance-worker] Invalid QStash signature — request rejected');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch (verifyErr) {
      console.error('[attendance-worker] Signature verification failed:', verifyErr);
      return res.status(401).json({ error: 'Signature verification failed' });
    }
  } else {
    // In dev mode without QStash keys, allow but log a warning
    console.warn('[attendance-worker] QStash signing keys not set — running in dev mode (no signature check)');
  }

  // ── 2. Process the Job ────────────────────────────────────────────────────
  const payload = req.body as AttendanceJobPayload;

  if (!payload.eventId || !payload.studentId) {
    return res.status(400).json({ error: 'Invalid job payload' });
  }

  try {
    const db = getFirestore();

    // Award points and write analytics in a single batch (atomic)
    const batch = db.batch();

    // +10 points to student
    const studentRef = db.collection('students').doc(payload.studentId);
    batch.update(studentRef, {
      points: FieldValue.increment(10),
    });

    // Analytics record — used by admin dashboard live counter
    // Collection: attendance_analytics
    // Doc ID: {eventId}_{studentId} (same compound key — idempotent writes)
    const analyticsRef = db
      .collection('attendance_analytics')
      .doc(`${payload.eventId}_${payload.studentId}`);
    batch.set(analyticsRef, {
      event_id: payload.eventId,
      student_id: payload.studentId,
      student_name: payload.studentName,
      event_title: payload.eventTitle,
      day_number: payload.dayNumber,
      scanned_at: payload.scannedAt,
      points_awarded: 10,
      ip: payload.ip,
      processed_at: FieldValue.serverTimestamp(),
    }, { merge: true }); // merge=true makes this safe to retry (QStash retries)

    await batch.commit();

    console.log(
      `[attendance-worker] ✓ Processed: ${payload.studentId} @ ${payload.eventTitle}`
    );

    return res.status(200).json({ ok: true, message: 'Job processed successfully.' });
  } catch (error: any) {
    console.error('[attendance-worker] Processing error:', error);
    // Return 500 so QStash retries this job
    return res.status(500).json({ ok: false, error: error.message });
  }
}

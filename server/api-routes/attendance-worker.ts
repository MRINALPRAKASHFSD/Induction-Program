/**
 * api/attendance-worker.ts
 *
 * QStash Worker — processes attendance jobs asynchronously.
 *
 * Called by Upstash QStash after each successful attendance mark.
 * Responsibilities:
 *   1. Verify the QStash signature (security — prevents spoofing)
 *   2. Write an immutable log to `attendance_logs`
 *   3. Increment a random distributed counter shard in `attendance_stats/{sessionId}/shards/{shardId}`
 *   4. Record the job in `processed_jobs` for idempotency
 *
 * QStash retry policy: 3 retries with exponential backoff.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Receiver } from '@upstash/qstash';
import type { AttendanceJobPayload } from '../server/qstash.js';
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
    console.warn('[attendance-worker] QStash signing keys not set — running in dev mode (no signature check)');
  }

  // ── 2. Process the Job ────────────────────────────────────────────────────
  const payload = req.body as AttendanceJobPayload;
  const messageId = req.headers['upstash-message-id'] as string || crypto.randomUUID();

  if (!payload.sessionId || !payload.studentId) {
    return res.status(400).json({ error: 'Invalid job payload' });
  }

  try {
    const db = getFirestore();

    // Idempotency Check using a Transaction
    await db.runTransaction(async (transaction) => {
      const processedJobRef = db.collection('processed_jobs').doc(messageId);
      const jobDoc = await transaction.get(processedJobRef);
      
      if (jobDoc.exists) {
        console.log(`[attendance-worker] Job ${messageId} already processed. Skipping.`);
        return;
      }

      const logId = `${payload.sessionId}_${payload.studentId}`;
      const logRef = db.collection('attendance_logs').doc(logId);
      const logDoc = await transaction.get(logRef);
      
      if (!logDoc.exists) {
        // Write the immutable attendance log
        transaction.set(logRef, {
          schema_version: 1,
          session_id: payload.sessionId,
          student_id: payload.studentId,
          enrollment_no: payload.enrollmentNo,
          student_name: payload.studentName,
          school: payload.school,
          department: payload.department,
          programme: payload.programme,
          semester: payload.semester,
          section: payload.section,
          email: payload.email,
          scan_time: FieldValue.serverTimestamp(),
          qr_version: payload.qrVersion,
          scanner_device_id: payload.scannerDeviceId,
          ip_address: payload.ipAddress,
          user_agent: payload.userAgent,
          verification_result: payload.verificationResult,
          created_at: FieldValue.serverTimestamp(),
        });

        // Fetch shard count dynamically from session config (default 64)
        const sessionRef = db.collection('attendance_sessions').doc(payload.sessionId);
        const sessionDoc = await transaction.get(sessionRef);
        const numShards = sessionDoc.exists ? (sessionDoc.data()?.num_shards || 64) : 64;
        
        // Pick a random shard
        const shardId = Math.floor(Math.random() * numShards).toString();
        const shardRef = db.collection('attendance_stats').doc(payload.sessionId).collection('shards').doc(shardId);
        
        // Increment the shard
        transaction.set(shardRef, {
          total_present: FieldValue.increment(1)
        }, { merge: true });
      }

      // Record job as processed with a TTL (e.g., 7 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      transaction.set(processedJobRef, {
        processed_at: FieldValue.serverTimestamp(),
        expires_at: expiresAt
      });
    });

    console.log(`[attendance-worker] ✓ Processed: ${payload.studentId} @ Session ${payload.sessionId}`);
    return res.status(200).json({ ok: true, message: 'Job processed successfully.' });
  } catch (error: any) {
    console.error('[attendance-worker] Processing error:', error);
    // Return 500 so QStash retries this job
    return res.status(500).json({ ok: false, error: error.message });
  }
}

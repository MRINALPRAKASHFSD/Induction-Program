/**
 * api/event-attendance-export.ts
 *
 * Admin-only CSV export for event attendance records.
 *
 * POST /api/event-attendance-export
 * Auth: Bearer token — super_admin or coordinator only
 *
 * Features:
 *   - UTF-8 BOM header (Excel compatibility)
 *   - Streaming via cursor-based 500-doc batches (no memory spike at 50K records)
 *   - Applies same filters as event-attendance-list (department, school, status)
 *   - Timestamps formatted as "YYYY-MM-DD HH:MM:SS IST"
 *   - No duplicate rows (document ID guarantees uniqueness)
 *   - Correct column ordering
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ISOLATION: Reads only from `event_attendance` and `events`.
 * Zero reads from any induction attendance collection.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { RESPONSE_CODES } from '../server/event-attendance.config.js';

// ── Firebase Admin Singleton ──────────────────────────────────────────────────
let firebaseInitialized = false;

try {
  if (!getApps().length) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('[event-attendance-export] Firebase Admin init error:', e.message);
}

// ── CSV Helpers ───────────────────────────────────────────────────────────────

function escapeCsv(val: string | null | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatISTTimestamp(firestoreTimestamp: any): string {
  if (!firestoreTimestamp) return '';
  const date = typeof firestoreTimestamp.toDate === 'function'
    ? firestoreTimestamp.toDate()
    : new Date(firestoreTimestamp);

  if (isNaN(date.getTime())) return '';

  // Format as IST (UTC+5:30)
  return date.toLocaleString('en-IN', {
    timeZone:   'Asia/Kolkata',
    year:       'numeric',
    month:      '2-digit',
    day:        '2-digit',
    hour:       '2-digit',
    minute:     '2-digit',
    second:     '2-digit',
    hour12:     false,
  }).replace(/\//g, '-').replace(',', '');
}

const CSV_HEADERS = [
  'S.No',
  'Enrollment Number',
  'Student Name',
  'Department',
  'School',
  'Status',
  'Verification Method',
  'Browser',
  'OS',
  'Device Type',
  'Marked At (IST)',
  'Event ID',
  'Event Title',
  'Venue',
];

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, code: RESPONSE_CODES.INVALID_INPUT, error: 'Method Not Allowed' });
  if (!firebaseInitialized) return res.status(500).json({ ok: false, code: RESPONSE_CODES.SERVER_ERROR, error: 'Backend not configured' });

  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'Authorization required' });

  let decodedToken: any;
  try {
    decodedToken = await verifyFirebaseIdToken(token);
  } catch {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'Invalid token' });
  }

  if (decodedToken.role !== 'super_admin' && decodedToken.role !== 'coordinator') {
    return res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Admin access required' });
  }

  const body = req.body ?? {};
  const { event_id, filter = {} } = body;

  if (!event_id || typeof event_id !== 'string') {
    return res.status(400).json({ ok: false, code: RESPONSE_CODES.INVALID_INPUT, error: 'Missing event_id' });
  }

  const db = getFirestore();

  // Fetch event metadata for filename and column values
  const eventDoc = await db.collection('events').doc(event_id).get();
  if (!eventDoc.exists) {
    return res.status(404).json({ ok: false, code: RESPONSE_CODES.NOT_FOUND, error: 'Event not found' });
  }
  const event = eventDoc.data()!;

  // ── Build query with filters ──────────────────────────────────────────────
  let q: any = db.collection('event_attendance')
    .where('event_id', '==', event_id)
    .orderBy('created_at', 'desc');

  if (filter.department) q = q.where('department', '==', filter.department);
  if (filter.school)     q = q.where('school', '==', filter.school);
  if (filter.status)     q = q.where('status', '==', filter.status);

  // ── Stream CSV via cursor-based 500-doc batches ───────────────────────────
  const safeTitle  = (event.title as string || 'event').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  const dateStr    = new Date().toISOString().split('T')[0];
  const filename   = `event_attendance_${safeTitle}_${dateStr}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const BATCH_SIZE = 500;
  let sno          = 1;
  let lastDoc: any = null;
  let isFirstBatch = true;

  try {
    while (true) {
      const batchQuery = lastDoc
        ? q.startAfter(lastDoc).limit(BATCH_SIZE)
        : q.limit(BATCH_SIZE);

      const snap = await batchQuery.get();
      if (snap.empty) break;

      const rows: string[] = [];

      if (isFirstBatch) {
        // UTF-8 BOM + headers
        rows.push('\uFEFF' + CSV_HEADERS.join(','));
        isFirstBatch = false;
      }

      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        rows.push([
          sno++,
          escapeCsv(d.enrollment_number),
          escapeCsv(d.student_name),
          escapeCsv(d.department),
          escapeCsv(d.school),
          escapeCsv(d.status ?? 'present'),
          escapeCsv(d.verification_method ?? 'QR'),
          escapeCsv(d.browser),
          escapeCsv(d.os),
          escapeCsv(d.device_type),
          escapeCsv(formatISTTimestamp(d.server_timestamp ?? d.created_at)),
          escapeCsv(event_id),
          escapeCsv(event.title),
          escapeCsv(event.venue),
        ].join(','));
      }

      // Write batch to response stream
      res.write(rows.join('\n') + '\n');

      if (snap.docs.length < BATCH_SIZE) break;
      lastDoc = snap.docs[snap.docs.length - 1];
    }

    res.end();
  } catch (error: any) {
    console.error('[event-attendance-export] Error:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, code: RESPONSE_CODES.SERVER_ERROR, error: error.message });
    }
    res.end();
  }
}

/**
 * api/attendance-export.ts
 *
 * Admin-only attendance CSV export endpoint.
 *
 * POST { sessionId } → Returns CSV file of all attendance records for a session.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';

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
  console.error('Firebase Admin Init Error (attendance-export):', e.message);
}

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

  const { sessionId } = req.body ?? {};
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  try {
    const db = getFirestore();

    // Fetch session details
    const sessionDoc = await db.collection('attendance_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionDoc.data()!;

    // Fetch all attendance records for this session
    // We remove .orderBy('scanned_at', 'asc') from the query to prevent
    // requiring a composite index in Firestore. Instead, we sort in memory.
    const attSnap = await db
      .collection('attendance')
      .where('session_id', '==', sessionId)
      .get();

    // Sort in memory by scanned_at to bypass Firestore composite index requirement
    const sortedDocs = attSnap.docs.sort((a, b) => {
      const aTime = a.data().scanned_at?.toMillis?.() || 0;
      const bTime = b.data().scanned_at?.toMillis?.() || 0;
      return aTime - bTime;
    });

    // Build CSV
    const headers = [
      'S.No',
      'Student ID',
      'Student Name',
      'Programme',
      'Event',
      'Venue',
      'Scanned At',
      'IP Address',
    ];

    const rows = sortedDocs.map((doc, index) => {
      const data = doc.data();
      const scannedAt = data.scanned_at?.toDate?.()
        ? data.scanned_at.toDate().toISOString()
        : data.scanned_at || '';

      return [
        index + 1,
        escapeCsv(data.student_id || ''),
        escapeCsv(data.student_name || ''),
        escapeCsv(data.programme_id || session.programme_name || ''),
        escapeCsv(session.event_id || ''),
        escapeCsv(session.venue || ''),
        scannedAt,
        escapeCsv(data.ip || ''),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    const filename = `attendance_${session.programme_name?.replace(/\s+/g, '_') || 'export'}_${session.date || 'session'}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error: any) {
    console.error('attendance-export error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * GET /api/event-guest-status?event_id=X&student_id=Y
 *
 * Student-facing. Returns existing guest doc for pre-populating the drawer on re-open.
 * Returns null if not submitted yet.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';

try {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }
} catch (e) { console.error('[event-guest-status] Firebase init error:', e); }

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try { await verifyFirebaseIdToken(token); } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }

  const event_id   = req.query?.event_id as string;
  const student_id = req.query?.student_id as string;

  if (!event_id || !student_id) {
    return res.status(400).json({ ok: false, error: 'Missing event_id or student_id' });
  }

  try {
    const db = getFirestore();
    const docId = `${event_id}_${student_id}`;
    const snap = await db.collection('event_guest_counts').doc(docId).get();

    if (!snap.exists) {
      return res.status(200).json({ ok: true, submitted: false, data: null });
    }

    return res.status(200).json({
      ok: true,
      submitted: true,
      data: { id: snap.id, ...snap.data() },
    });

  } catch (err: any) {
    console.error('[event-guest-status]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

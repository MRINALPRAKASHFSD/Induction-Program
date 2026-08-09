/**
 * POST /api/event-planner-publish
 * Body: { plannerId: string }
 *
 * Admin-only. Publishes a DRAFT/VALIDATED event planner.
 * Archives any previous PUBLISHED planner of the same type.
 * Invalidates Redis cache + writes announcement.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { publishEventPlanner } from '../server/event-planner-engine.js';
import crypto from 'crypto';

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
} catch (e) { console.error('[event-planner-publish] Firebase init error:', e); }

async function validateAdmin(req: any): Promise<{ uid: string; name: string } | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return decoded.uid ? { uid: decoded.uid, name: decoded.name || decoded.email || decoded.uid } : null;
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const admin = await validateAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { plannerId } = req.body ?? {};
  if (!plannerId || typeof plannerId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing plannerId in request body.' });
  }

  const ip = ((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown') as string)
    .split(',')[0].trim();
  const ipHash    = crypto.createHash('sha256').update(ip).digest('hex');
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    const db = getFirestore();
    await publishEventPlanner(db, plannerId, admin.uid, admin.name, ipHash, userAgent);

    return res.status(200).json({
      ok: true,
      plannerId,
      publishedAt: new Date().toISOString(),
      message: 'Planner published successfully.',
    });
  } catch (err: any) {
    console.error('[event-planner-publish]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

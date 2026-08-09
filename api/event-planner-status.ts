/**
 * GET /api/event-planner-status?type=orientation
 *
 * Admin-only. Returns active planner + history for a given plannerType.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { getEventPlannerStatus, ALLOWED_PLANNER_TYPES, type EventPlannerType } from '../server/event-planner-engine.js';

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
} catch (e) { console.error('[event-planner-status] Firebase init error:', e); }

async function validateAdmin(req: any): Promise<{ uid: string } | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return decoded.uid ? { uid: decoded.uid } : null;
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const admin = await validateAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const plannerType = (req.query?.type || '') as string;
  if (!ALLOWED_PLANNER_TYPES.includes(plannerType as EventPlannerType)) {
    return res.status(400).json({
      ok: false,
      error: `Missing or invalid ?type param. Allowed: ${ALLOWED_PLANNER_TYPES.join(', ')}`,
    });
  }

  try {
    const db = getFirestore();
    const status = await getEventPlannerStatus(db, plannerType as EventPlannerType);

    return res.status(200).json({ ok: true, ...status });
  } catch (err: any) {
    console.error('[event-planner-status]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

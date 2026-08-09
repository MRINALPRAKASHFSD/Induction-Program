/**
 * GET /api/event-schedule?type=orientation
 *
 * Student-facing (authenticated). Returns published schedule sessions for a plannerType.
 * Redis-cached: key = planner:{type}:{plannerId}, TTL 5 min.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { getPublishedEventSessions, ALLOWED_PLANNER_TYPES, type EventPlannerType } from '../server/event-planner-engine.js';

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
} catch (e) { console.error('[event-schedule] Firebase init error:', e); }

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  // Auth: require valid Firebase token (any registered student)
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try { await verifyFirebaseIdToken(token); } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }

  const plannerType = (req.query?.type || 'orientation') as string;
  if (!ALLOWED_PLANNER_TYPES.includes(plannerType as EventPlannerType)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid ?type param. Allowed: ${ALLOWED_PLANNER_TYPES.join(', ')}`,
    });
  }

  try {
    const db = getFirestore();
    const data = await getPublishedEventSessions(db, plannerType as EventPlannerType);

    if (!data) {
      return res.status(200).json({
        ok: true,
        plannerActive: false,
        sessions: [],
        days: [],
        plannerType,
        plannerId: null,
        publishedAt: null,
      });
    }

    return res.status(200).json({
      ok: true,
      plannerActive: true,
      plannerType,
      plannerId:   data.plannerId,
      publishedAt: data.publishedAt,
      sessions:    data.sessions,
      days:        data.days,
    });

  } catch (err: any) {
    console.error('[event-schedule]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

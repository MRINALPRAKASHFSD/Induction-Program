/**
 * GET /api/planner-admin-status
 *
 * Admin-only. Returns the current active planner summary + version history.
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
} catch (e) {
  console.error('[planner-admin-status] Firebase init error:', e);
}

async function validateAdmin(req: any): Promise<boolean> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return false;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return !!decoded.uid;
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  if (!(await validateAdmin(req))) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const db = getFirestore();

    // Fetch all planners sorted by publishedAt desc
    const snap = await db.collection('induction_planners')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const planners = snap.docs.map(d => ({
      id:              d.id,
      plannerId:       d.data().plannerId,
      plannerYear:     d.data().plannerYear,
      status:          d.data().status,
      excelFilename:   d.data().excelFilename,
      uploadedBy:      d.data().uploadedByName || d.data().uploadedBy,
      publishedBy:     d.data().publishedByName || d.data().publishedBy,
      uploadedAt:      d.data().uploadedAt,
      publishedAt:     d.data().publishedAt,
      summary:         d.data().summary,
      validationErrors:   d.data().validationErrors,
      validationWarnings: d.data().validationWarnings,
      importLog:       d.data().importLog,
    }));

    const activePlanner = planners.find(p => p.status === 'PUBLISHED' || p.status === 'ROLLED_BACK') || null;
    const history = planners.filter(p => p.id !== activePlanner?.id);

    // Latest 10 audit logs
    const auditSnap = await db.collection('planner_audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    const auditLogs = auditSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.status(200).json({
      ok: true,
      activePlanner,
      history,
      auditLogs,
      totalPlanners: planners.length,
    });

  } catch (err: any) {
    console.error('[planner-admin-status]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

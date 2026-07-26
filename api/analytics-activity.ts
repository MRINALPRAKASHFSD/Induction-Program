/**
 * api/analytics-activity.ts
 *
 * Backend endpoint for fetching the live activity feed for the Dashboard.
 *
 * POST /api/analytics-activity
 * Auth: Bearer token — super_admin or coordinator
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { RESPONSE_CODES } from '../server/event-attendance.config.js';

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
  console.error('[analytics-activity] Firebase Admin init error:', e.message);
}

function apiResponse(res: any, status: number, ok: boolean, code: string, message: string, data: any = null, meta: any = {}) {
  const ts = new Date().toISOString();
  return res.status(status).json({ ok, code, message, data, meta: { ...meta, timestamp: ts }, timestamp: ts });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, RESPONSE_CODES.INVALID_INPUT, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Backend not configured');

  const token = extractBearerToken(req.headers.authorization);
  if (!token) return apiResponse(res, 401, false, 'UNAUTHORIZED', 'Authorization required');

  let decodedToken: any;
  try {
    decodedToken = await verifyFirebaseIdToken(token);
  } catch {
    return apiResponse(res, 401, false, 'UNAUTHORIZED', 'Invalid token');
  }

  if (decodedToken.role !== 'super_admin' && decodedToken.role !== 'coordinator') {
    return apiResponse(res, 403, false, 'FORBIDDEN', 'Admin access required');
  }

  const { limit = 20, cursor = null } = req.body ?? {};

  const db = getFirestore();
  
  try {
    let q = db.collection('audit_logs').orderBy('time', 'desc').limit(limit);
    
    if (cursor) {
      const cursorDoc = await db.collection('audit_logs').doc(cursor).get();
      if (cursorDoc.exists) {
        q = q.startAfter(cursorDoc);
      }
    }

    const snap = await q.get();
    
    const logs = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        action: data.action || 'ACTIVITY',
        user: data.user || 'System',
        time: data.time?.toDate?.()?.toISOString() || new Date().toISOString(),
        details: data.details || 'Performed an action',
        documentId: data.documentId
      };
    });

    const hasNextPage = logs.length === limit;
    const nextCursor = hasNextPage ? logs[logs.length - 1].id : null;

    return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Activity feed fetched.', logs, { 
      nextCursor, 
      hasNextPage, 
      filtersApplied: { limit, cursor }, 
      dataSource: 'firestore' 
    });
  } catch (error: any) {
    console.error('[analytics-activity] Error fetching feed:', error);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Failed to fetch activity feed', null, { error: error.message });
  }
}

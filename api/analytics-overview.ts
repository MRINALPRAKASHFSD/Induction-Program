/**
 * api/analytics-overview.ts
 *
 * Backend endpoint for fetching top-level KPI metrics for the Analytics Dashboard.
 * Caches heavy aggregations in Redis.
 *
 * POST /api/analytics-overview
 * Auth: Bearer token — super_admin or coordinator
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { RESPONSE_CODES } from '../server/event-attendance.config.js';
import { logRedisFailure } from '../server/event-redis-monitor.js';

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
  console.error('[analytics-overview] Firebase Admin init error:', e.message);
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

  const { filter = {} } = req.body ?? {};
  const cacheKey = `analytics:overview:${JSON.stringify(filter)}`;
  const CACHE_TTL = 60; // 1 minute for live KPIs

  try {
    const redis = getRedis();
    const cached = await redis.get<any>(cacheKey);
    if (cached) {
      const ttl = await redis.ttl(cacheKey);
      const cacheAge = CACHE_TTL - (ttl > 0 ? ttl : 0);
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Overview metrics fetched (cached).', cached, { cacheAge, cached: true, filtersApplied: filter, dataSource: 'redis' });
    }
  } catch (err: any) {
    logRedisFailure({ endpoint: 'analytics-overview', operation: 'get_cache', reason: err.message });
  }

  const db = getFirestore();
  
  try {
    const [
      studentsSnap,
      attendanceSnap,
      clubsSnap,
      activeEventsSnap,
      totalEventsSnap,
      docsSnap,
      suspendedSnap,
      inactiveSnap
    ] = await Promise.all([
      db.collection('students').count().get(),
      db.collection('attendance_logs').count().get(),
      db.collection('clubs').count().get(),
      db.collection('events').where('is_active', '==', true).count().get(),
      db.collection('events').count().get(),
      db.collection('secure_documents').count().get(),
      db.collection('students').where('is_suspended', '==', true).count().get(),
      db.collection('students').where('is_deactivated', '==', true).count().get()
    ]);

    const totalStudents = studentsSnap.data().count;
    const suspended = suspendedSnap.data().count;
    const inactive = inactiveSnap.data().count;
    const activeStudents = Math.max(0, totalStudents - suspended - inactive);
    const eligibleStudents = activeStudents;
    
    const totalAttendance = attendanceSnap.data().count;
    const attendancePercentage = eligibleStudents > 0 
      ? parseFloat(((totalAttendance / eligibleStudents) * 100).toFixed(1)) 
      : 0;

    const activeEvents = activeEventsSnap.data().count;
    const totalEvents = totalEventsSnap.data().count;
    
    const data = {
      registrations: {
        total: totalStudents,
        active: activeStudents,
        inactive: inactive,
        suspended: suspended,
        today: null, // Not tracked efficiently without index
        yesterday: null,
        growthPct: null
      },
      attendance: {
        total: totalAttendance,
        present: totalAttendance, // Assuming all logs are successful marks
        late: null, // Not tracked
        percentage: attendancePercentage
      },
      events: {
        total: totalEvents,
        active: activeEvents,
        completed: Math.max(0, totalEvents - activeEvents)
      },
      clubs: {
        total: clubsSnap.data().count,
      },
      documents: {
        total: docsSnap.data().count,
      },
      qrActivity: {
        scans: totalAttendance,
        successful: totalAttendance,
        duplicates: null, // Not tracked
        invalid: null
      }
    };

    try {
      const redis = getRedis();
      await redis.set(cacheKey, data, { ex: CACHE_TTL });
    } catch (err: any) {
      logRedisFailure({ endpoint: 'analytics-overview', operation: 'set_cache', reason: err.message });
    }

    return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Overview metrics fetched.', data, { cacheAge: 0, cached: false, filtersApplied: filter, dataSource: 'firestore' });
  } catch (error: any) {
    console.error('[analytics-overview] Error fetching metrics:', error);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Failed to fetch overview metrics', null, { error: error.message });
  }
}

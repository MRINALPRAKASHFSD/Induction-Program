/**
 * api/analytics-students.ts
 *
 * Backend endpoint for fetching student analytics for the Dashboard.
 * Caches heavy aggregations in Redis.
 *
 * POST /api/analytics-students
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
  console.error('[analytics-students] Firebase Admin init error:', e.message);
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
  const cacheKey = `analytics:students:${JSON.stringify(filter)}`;
  const CACHE_TTL = 300; // 5 minutes

  try {
    const redis = getRedis();
    const cached = await redis.get<any>(cacheKey);
    if (cached) {
      const ttl = await redis.ttl(cacheKey);
      const cacheAge = CACHE_TTL - (ttl > 0 ? ttl : 0);
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Student metrics fetched (cached).', cached, { cacheAge, cached: true, filtersApplied: filter, dataSource: 'redis' });
    }
  } catch (err: any) {
    logRedisFailure({ endpoint: 'analytics-students', operation: 'get_cache', reason: err.message });
  }

  const db = getFirestore();
  
  try {
    const [
      studentsSnap,
      suspendedSnap,
      inactiveSnap,
      recentStudentsSnap
    ] = await Promise.all([
      db.collection('students').count().get(),
      db.collection('students').where('is_suspended', '==', true).count().get(),
      db.collection('students').where('is_deactivated', '==', true).count().get(),
      // Assuming created_at is an ISO string. We'll fetch all students to group them if small, 
      // but to be safe, we just fetch recent ones.
      db.collection('students').orderBy('created_at', 'desc').limit(1000).get()
    ]);
    
    const totalStudents = studentsSnap.data().count;
    const suspended = suspendedSnap.data().count;
    const inactive = inactiveSnap.data().count;
    const active = Math.max(0, totalStudents - suspended - inactive);
    
    // Group recent registrations by date
    const dailyMap = new Map<string, number>();
    recentStudentsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.created_at) {
        const dateStr = data.created_at.split('T')[0];
        dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + 1);
      }
    });
    
    const dailyRegistrations = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const data = {
      total: totalStudents,
      verified: active, // Using active as 'verified'
      pending: null, // Not explicitly tracked
      inactive: inactive,
      suspended: suspended,
      dailyRegistrations: dailyRegistrations.length > 0 ? dailyRegistrations : null,
      conversionRate: null,
      pendingAttendance: null,
      completedInduction: null,
      cancelled: null
    };

    try {
      const redis = getRedis();
      await redis.set(cacheKey, data, { ex: CACHE_TTL });
    } catch (err: any) {
      logRedisFailure({ endpoint: 'analytics-students', operation: 'set_cache', reason: err.message });
    }

    return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Student metrics fetched.', data, { cacheAge: 0, cached: false, filtersApplied: filter, dataSource: 'firestore' });
  } catch (error: any) {
    console.error('[analytics-students] Error fetching metrics:', error);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Failed to fetch student metrics', null, { error: error.message });
  }
}

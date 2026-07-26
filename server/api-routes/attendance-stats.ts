/**
 * api/attendance-stats.ts
 *
 * Aggregates distributed counter shards for a specific attendance session.
 * Uses Upstash Redis to cache the result for 5 seconds to prevent excessive
 * Firestore read costs when multiple admins are viewing the dashboard simultaneously.
 *
 * Actions:
 *   GET /api/attendance-stats?sessionId=<sessionId>
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Redis } from '@upstash/redis';
import { extractBearerToken, verifyFirebaseIdToken } from '../server/verify-id-token.js';

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
  console.error('Firebase Admin Init Error (attendance-stats):', e.message);
}

// ── Upstash Redis Initialization ──────────────────────────────────────────────
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!firebaseInitialized) return res.status(500).json({ error: 'Backend not configured' });

  // ── Auth: Verify admin role ───────────────────────────────────────────────
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
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const cacheKey = `attendance_stats:${sessionId}`;

  try {
    // 1. Try to fetch from Redis Cache (5 seconds TTL)
    try {
      const cachedStats = await redis.get<{ total_present: number; cached_at: string }>(cacheKey);
      if (cachedStats !== null) {
        return res.status(200).json({
          ok: true,
          total_present: cachedStats.total_present,
          cached_at: cachedStats.cached_at,
          source: 'cache'
        });
      }
    } catch (cacheError) {
      console.warn('[attendance-stats] Redis cache error, falling back to Firestore', cacheError);
    }

    const db = getFirestore();

    // 2. Aggregate shards from Firestore
    const shardsSnapshot = await db
      .collection('attendance_stats')
      .doc(sessionId)
      .collection('shards')
      .get();

    let totalPresent = 0;
    shardsSnapshot.forEach(doc => {
      totalPresent += doc.data().total_present || 0;
    });

    const result = {
      total_present: totalPresent,
      cached_at: new Date().toISOString(),
    };

    // 3. Store result in Redis Cache (expires in 5 seconds)
    try {
      await redis.set(cacheKey, result, { ex: 5 });
    } catch (cacheWriteError) {
      console.warn('[attendance-stats] Redis cache write error', cacheWriteError);
    }

    return res.status(200).json({
      ok: true,
      ...result,
      source: 'firestore'
    });

  } catch (error: any) {
    console.error('attendance-stats error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

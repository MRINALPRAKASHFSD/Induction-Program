/**
 * api/media/homepage.ts
 *
 * Lightweight API endpoint for the Homepage Memories section.
 * Fetches published media assets, respects scheduling, and caches results.
 *
 * GET /api/media/homepage
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getRedis } from '../../server/redis.js';
import { RESPONSE_CODES } from '../../server/event-attendance.config.js';
import { logRedisFailure } from '../../server/event-redis-monitor.js';

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
  console.error('[media-homepage] Firebase Admin init error:', e.message);
}

function apiResponse(res: any, status: number, ok: boolean, code: string, message: string, data: any = null, meta: any = {}) {
  const ts = new Date().toISOString();
  return res.status(status).json({ ok, code, message, data, meta: { ...meta, timestamp: ts }, timestamp: ts });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return apiResponse(res, 405, false, RESPONSE_CODES.INVALID_INPUT, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Backend not configured');

  const cacheKey = `media:homepage:assets`;

  try {
    const redis = getRedis();
    const cached = await redis.get<any>(cacheKey);
    if (cached) {
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Media fetched (cached).', cached, { cached: true, dataSource: 'redis' });
    }
  } catch (err: any) {
    logRedisFailure({ endpoint: 'media-homepage', operation: 'get_cache', reason: err.message });
  }

  const db = getFirestore();
  
  try {
    // Query Published assets intended for Homepage Memories
    const snapshot = await db.collection('media_assets')
      .where('status', '==', 'PUBLISHED')
      .get();
      
    let assets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filter out expired (featured_until) or not yet published (publish_from)
    const now = Date.now();
    assets = assets.filter((asset: any) => {
      if (asset.publish_from && new Date(asset.publish_from).getTime() > now) return false;
      if (asset.featured_until && new Date(asset.featured_until).getTime() < now) return false;
      return true;
    });

    // We want a mix of featured (highest weight) and random. 
    // Since this is cached, doing it in memory is fine for a few hundred assets.
    // Sort by display_weight desc
    assets.sort((a: any, b: any) => (b.display_weight || 0) - (a.display_weight || 0));

    // Take top 20 featured and randomly pick 10 from the rest
    const featured = assets.slice(0, 20);
    const rest = assets.slice(20);
    
    // Shuffle the rest
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    
    const randomPicks = rest.slice(0, 10);
    const finalAssets = [...featured, ...randomPicks];
    
    // Map to a clean public format for the frontend
    const publicAssets = finalAssets.map((asset: any) => ({
      id: asset.id,
      title: asset.title,
      subtitle: asset.subtitle,
      url: asset.url,
      thumbnail_url: asset.thumbnail_url || asset.url,
      dominant_color: asset.dominant_color || '#cccccc',
      display_weight: asset.display_weight || 1
    }));

    try {
      const redis = getRedis();
      await redis.set(cacheKey, publicAssets, { ex: 30 }); // cache for 30 seconds
    } catch (err: any) {
      logRedisFailure({ endpoint: 'media-homepage', operation: 'set_cache', reason: err.message });
    }

    return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Media fetched.', publicAssets, { cached: false, dataSource: 'firestore' });
  } catch (error: any) {
    console.error('[media-homepage] Error fetching media:', error);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Failed to fetch media', null, { error: error.message });
  }
}

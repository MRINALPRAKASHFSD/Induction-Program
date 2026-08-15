/**
 * api/media/landing.ts
 *
 * Landing Experience public API.
 *
 * GET  /api/media/landing
 *   Resolves landing_settings/global → active_collection slug
 *   → landing_collections/{slug} → published landing_slides
 *   Returns: { settings, collection, slides }
 *   Cached in Redis for 60s; Vercel CDN stale-while-revalidate 30s.
 *
 * POST /api/media/landing  (admin only — cache bust)
 *   Requires Firebase ID token in Authorization header.
 *   Deletes landing:homepage:v2 from Redis so next visitor gets fresh data.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getRedis } from '../../server/redis.js';
import { RESPONSE_CODES } from '../../server/event-attendance.config.js';
import { logRedisFailure } from '../../server/event-redis-monitor.js';

// ─── Firebase Admin bootstrap (idempotent) ───────────────────────────────────
let firebaseInitialized = false;
try {
  if (!getApps().length) {
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
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
  console.error('[media-landing] Firebase Admin init error:', e.message);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CACHE_KEY = 'landing:homepage:v2';
const CACHE_TTL = 60; // seconds

function apiResponse(
  res: any,
  status: number,
  ok: boolean,
  code: string,
  message: string,
  data: any = null,
  meta: any = {}
) {
  const ts = new Date().toISOString();
  return res.status(status).json({ ok, code, message, data, meta: { ...meta, timestamp: ts }, timestamp: ts });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!firebaseInitialized) {
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Backend not configured');
  }

  // ── POST: cache invalidation (admin saves trigger this) ────────────────────
  if (req.method === 'POST') {
    // Verify Firebase ID token so only authenticated admins can bust the cache
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return apiResponse(res, 401, false, 'UNAUTHORIZED', 'Authentication required');
    }
    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return apiResponse(res, 401, false, 'UNAUTHORIZED', 'Invalid or expired token');
    }
    try {
      const redis = getRedis();
      await redis.del(CACHE_KEY);
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Cache invalidated', null, { key: CACHE_KEY });
    } catch (err: any) {
      logRedisFailure({ endpoint: 'media-landing', operation: 'del_cache', reason: err.message });
      // Fail silently — cache will expire naturally
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Cache invalidation skipped (Redis unavailable)');
    }
  }

  // ── GET: serve landing experience data ─────────────────────────────────────
  if (req.method !== 'GET') {
    return apiResponse(res, 405, false, RESPONSE_CODES.INVALID_INPUT, 'Method Not Allowed');
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');

  // 1. Try Redis cache
  try {
    const redis = getRedis();
    const cached = await redis.get<any>(CACHE_KEY);
    if (cached) {
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Landing data fetched (cached).', cached, {
        cached: true,
        dataSource: 'redis',
      });
    }
  } catch (err: any) {
    logRedisFailure({ endpoint: 'media-landing', operation: 'get_cache', reason: err.message });
  }

  const db = getFirestore();

  try {
    // 2. Fetch landing_settings/global singleton
    const settingsDoc = await db.collection('landing_settings').doc('global').get();
    const rawSettings = settingsDoc.exists ? settingsDoc.data()! : {};

    const settings = {
      active_collection:        rawSettings.active_collection        ?? null,
      enable_slideshow:         rawSettings.enable_slideshow         ?? true,
      enable_countdown:         rawSettings.enable_countdown         ?? true,
      enable_memories:          rawSettings.enable_memories          ?? true,
      enable_stats:             rawSettings.enable_stats             ?? true,
      enable_footer:            rawSettings.enable_footer            ?? true,
      navbar_mode:              rawSettings.navbar_mode              ?? 'glass',
      maintenance_mode:         rawSettings.maintenance_mode         ?? false,
      maintenance_message:      rawSettings.maintenance_message      ?? '',
    };

    const activeSlug = settings.active_collection;

    // 3. No active collection — return settings with empty slides (graceful)
    if (!activeSlug) {
      const payload = { settings, collection: null, slides: [] };
      await tryCacheSet(payload);
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'No active collection configured.', payload, {
        cached: false,
        dataSource: 'firestore',
      });
    }

    // 4. Fetch active landing_collection
    const colDoc = await db.collection('landing_collections').doc(activeSlug).get();
    if (!colDoc.exists) {
      const payload = { settings, collection: null, slides: [] };
      await tryCacheSet(payload);
      return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Active collection not found.', payload, {
        cached: false,
        dataSource: 'firestore',
      });
    }

    const colData = colDoc.data()!;
    const collection = {
      id:                     colDoc.id,
      name:                   colData.name                   ?? '',
      slug:                   colData.slug                   ?? colDoc.id,
      academic_year:          colData.academic_year          ?? '',
      theme:                  colData.theme                  ?? 'classic-aarambh',
      transition:             colData.transition             ?? 'crossfade',
      default_duration_ms:    colData.default_duration_ms    ?? 6000,
      ken_burns_enabled:      colData.ken_burns_enabled      ?? false,
      particles_intensity:    colData.particles_intensity    ?? 'low',
      // Layer toggles
      show_background_image:  colData.show_background_image  ?? true,
      show_overlay:           colData.show_overlay           ?? true,
      show_orbit:             colData.show_orbit             ?? true,
      show_particles:         colData.show_particles         ?? true,
      show_watermark:         colData.show_watermark         ?? true,
      show_logo:              colData.show_logo              ?? true,
      show_glow:              colData.show_glow              ?? true,
      show_noise:             colData.show_noise             ?? true,
      // Hero text
      heading:                colData.heading                ?? 'आरंभ',
      subheading:             colData.subheading             ?? 'AARAMBH 2026',
      tagline_prefix:         colData.tagline_prefix         ?? 'Embracing',
      tagline_script:         colData.tagline_script         ?? '',
      tagline_suffix:         colData.tagline_suffix         ?? 'New Horizons',
      body_copy:              colData.body_copy              ?? 'Register. Connect. Belong.',
      // CTAs
      cta_primary_label:      colData.cta_primary_label      ?? 'Register Now',
      cta_primary_link:       colData.cta_primary_link       ?? '/register',
      cta_secondary_label:    colData.cta_secondary_label    ?? 'Lodge Attendance',
      cta_secondary_link:     colData.cta_secondary_link     ?? '/attendance',
      // Style overrides
      navbar_variant:         colData.navbar_variant         ?? null,
      countdown_variant:      colData.countdown_variant      ?? null,
      overlay_color_override: colData.overlay_color_override ?? null,
    };

    // 5. Fetch published slides ordered by display_order
    const slidesSnap = await db
      .collection('landing_slides')
      .where('collection_id', '==', activeSlug)
      .where('status', '==', 'PUBLISHED')
      .orderBy('display_order', 'asc')
      .get();

    const slides = slidesSnap.docs.map((d) => {
      const s = d.data();
      return {
        id:              d.id,
        title:           s.title            ?? '',
        subtitle:        s.subtitle         ?? '',
        alt_text:        s.alt_text         ?? '',
        url:             s.url              ?? '',
        mobile_url:      s.mobile_url       ?? s.url ?? '',
        thumbnail_url:   s.thumbnail_url    ?? s.url ?? '',
        dominant_color:  s.dominant_color   ?? '#0A0F28',
        duration_ms:     s.duration_ms      ?? colData.default_duration_ms ?? 6000,
        overlay_opacity: s.overlay_opacity  ?? 65,
        overlay_color:   s.overlay_color    ?? '#0A0F28',
        focal_point:     s.focal_point      ?? 'center',
        display_order:   s.display_order    ?? 0,
      };
    });

    const payload = { settings, collection, slides };
    await tryCacheSet(payload);

    return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Landing data fetched.', payload, {
      cached: false,
      dataSource: 'firestore',
      slideCount: slides.length,
    });
  } catch (error: any) {
    console.error('[media-landing] Error:', error);
    return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Failed to fetch landing data', null, {
      error: error.message,
    });
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
async function tryCacheSet(payload: unknown) {
  try {
    const redis = getRedis();
    await redis.set(CACHE_KEY, payload, { ex: CACHE_TTL });
  } catch (err: any) {
    logRedisFailure({ endpoint: 'media-landing', operation: 'set_cache', reason: err.message });
  }
}

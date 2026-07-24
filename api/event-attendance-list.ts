/**
 * api/event-attendance-list.ts
 *
 * Admin-only paginated attendance list with search, sort, filter,
 * server-side metrics, and live analytics for a specific event.
 *
 * POST /api/event-attendance-list
 * Auth: Bearer token — super_admin or coordinator only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ISOLATION: Reads only from `event_attendance` and `events` collections.
 * ZERO reads from attendance_logs, attendance_sessions, or any induction
 * collection.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getRedis } from '../server/redis.js';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { EVENT_ATTENDANCE_CONFIG, RESPONSE_CODES } from '../server/event-attendance.config.js';
import { logRedisFailure } from '../server/event-redis-monitor.js';

// ── Firebase Admin Singleton ──────────────────────────────────────────────────
let firebaseInitialized = false;

try {
  if (!getApps().length) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('[event-attendance-list] Firebase Admin init error:', e.message);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiResponse(res: any, status: number, ok: boolean, code: string, message: string, data: any = null, meta: any = {}) {
  const ts = new Date().toISOString();
  return res.status(status).json({ ok, code, message, data, meta: { ...meta, timestamp: ts }, timestamp: ts });
}

function requestId() {
  return `eal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Fetch analytics from Redis (velocity, first/last, duplicate/rejected counts). Fails silently. */
async function fetchRedisAnalytics(eventId: string): Promise<Record<string, any>> {
  try {
    const redis = getRedis();
    const cfg   = EVENT_ATTENDANCE_CONFIG;
    const now   = Date.now();
    const velocityWindowMs = cfg.velocityWindowMinutes * 60 * 1000;

    const pipeline = redis.pipeline();
    pipeline.get(`ea:first:${eventId}`);
    pipeline.get(`ea:last:${eventId}`);
    pipeline.get(`ea:dup:${eventId}`);
    pipeline.get(`ea:rej:${eventId}`);
    // For velocity: count members added in last N minutes
    pipeline.zcount(`ea:timeline:${eventId}`, now - velocityWindowMs, now);
    // Full timeline for hourly breakdown (sorted set, score = timestamp ms)
    pipeline.zrange(`ea:timeline:${eventId}`, 0, -1, { withScores: true });
    const results = await pipeline.exec();

    const firstRaw  = results[0] as string | null;
    const lastRaw   = results[1] as string | null;
    const dupCount  = parseInt((results[2] as string | null) ?? '0', 10);
    const rejCount  = parseInt((results[3] as string | null) ?? '0', 10);
    const velocityCount = results[4] as number;
    const timelineRaw   = results[5] as any[];

    const parseEntry = (raw: string | null) => {
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    };

    // Velocity: attendees per minute over the window
    const velocity = parseFloat((velocityCount / cfg.velocityWindowMinutes).toFixed(2));

    // Hourly breakdown from timeline sorted set
    const hourlyMap: Record<string, number> = {};
    let totalTimestamps: number[] = [];
    if (Array.isArray(timelineRaw)) {
      // Upstash returns alternating [member, score, member, score...]
      for (let i = 0; i < timelineRaw.length; i += 2) {
        const score = parseFloat(timelineRaw[i + 1]);
        if (!isNaN(score)) {
          totalTimestamps.push(score);
          const hour = new Date(score).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5);
          hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
        }
      }
    }

    // Average interval
    let avgIntervalSec: number | null = null;
    if (totalTimestamps.length >= 2) {
      totalTimestamps.sort((a, b) => a - b);
      const intervals = totalTimestamps.slice(1).map((t, i) => (t - totalTimestamps[i]) / 1000);
      avgIntervalSec = parseFloat((intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1));
    }

    const hourly_breakdown = Object.entries(hourlyMap)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return {
      first_attendee:             parseEntry(firstRaw),
      last_attendee:              parseEntry(lastRaw),
      velocity_per_minute:        velocity,
      avg_checkin_interval_seconds: avgIntervalSec,
      hourly_breakdown,
      duplicate_attempts:         dupCount,
      rejected_attempts:          rejCount,
    };
  } catch (err: any) {
    logRedisFailure({ endpoint: 'event-attendance-list', event_id: eventId, operation: 'fetch_analytics', reason: err.message });
    return {
      first_attendee: null, last_attendee: null,
      velocity_per_minute: 0, avg_checkin_interval_seconds: null,
      hourly_breakdown: [], duplicate_attempts: 0, rejected_attempts: 0,
    };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, RESPONSE_CODES.INVALID_INPUT, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, RESPONSE_CODES.SERVER_ERROR, 'Backend not configured');

  // ── Auth ─────────────────────────────────────────────────────────────────
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

  const reqId = requestId();
  const body  = req.body ?? {};

  // ── Input ─────────────────────────────────────────────────────────────────
  const { event_id, page = 1, pageSize: rawPageSize = EVENT_ATTENDANCE_CONFIG.defaultPageSize,
          search, filter = {}, sortBy = 'created_at', sortOrder = 'desc' } = body;

  if (!event_id || typeof event_id !== 'string') {
    return apiResponse(res, 400, false, RESPONSE_CODES.INVALID_INPUT, 'Missing event_id', null, { requestId: reqId });
  }

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(EVENT_ATTENDANCE_CONFIG.maxPageSize, Math.max(1, parseInt(rawPageSize, 10) || EVENT_ATTENDANCE_CONFIG.defaultPageSize));

  const db = getFirestore();

  // ── Fetch event metadata (for capacity, title, etc.) ─────────────────────
  const eventDoc = await db.collection('events').doc(event_id).get();
  if (!eventDoc.exists) {
    return apiResponse(res, 404, false, RESPONSE_CODES.NOT_FOUND, 'Event not found', null, { requestId: reqId });
  }
  const event = eventDoc.data()!;

  // ── Build Firestore Query ─────────────────────────────────────────────────
  const collection = db.collection('event_attendance');
  let q: FirebaseFirestore.Query = collection.where('event_id', '==', event_id);

  // Structured filters (use Firestore where() — requires composite indexes)
  if (filter.department) q = q.where('department', '==', filter.department);
  if (filter.school)     q = q.where('school', '==', filter.school);
  if (filter.status)     q = q.where('status', '==', filter.status);

  // Enrollment prefix search: Firestore range query (uses Index 2)
  const isEnrollmentSearch = search && /^[A-Z0-9\-]/i.test(search.trim()) && !search.trim().includes(' ');
  if (isEnrollmentSearch) {
    const prefix = search.trim().toUpperCase();
    q = q.where('enrollment_number', '>=', prefix)
         .where('enrollment_number', '<=', prefix + '\uf8ff');
  }

  // Sort
  const validSortFields: Record<string, string> = {
    created_at:        'created_at',
    student_name:      'student_name',
    enrollment_number: 'enrollment_number',
  };
  const sortField = validSortFields[sortBy] ?? 'created_at';
  const sortDir   = sortOrder === 'asc' ? 'asc' : 'desc';
  q = q.orderBy(sortField, sortDir);

  // Cursor pagination
  if (pageNum > 1 && body.cursor) {
    try {
      const cursorDoc = await db.collection('event_attendance').doc(body.cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    } catch { /* ignore bad cursor, start from beginning */ }
  }

  // Fetch pageSize + 1 to detect hasNextPage
  const snap = await q.limit(pageSize + 1).get();
  const hasNextPage = snap.docs.length > pageSize;
  const docs = hasNextPage ? snap.docs.slice(0, pageSize) : snap.docs;

  // Client-side name filter (names aren't prefix-indexable in Firestore)
  let records = docs.map(d => {
    const data = d.data();
    return {
      id:                d.id,
      enrollment_number: data.enrollment_number,
      student_name:      data.student_name,
      department:        data.department,
      school:            data.school,
      status:            data.status,
      verification_method: data.verification_method,
      marked_by:         data.marked_by,
      device_type:       data.device_type,
      browser:           data.browser,
      os:                data.os,
      server_timestamp:  data.server_timestamp?.toDate?.()?.toISOString() ?? null,
      created_at:        data.created_at?.toDate?.()?.toISOString() ?? null,
    };
  });

  // Name search: filter on the loaded page
  if (search && !isEnrollmentSearch) {
    const term = search.trim().toLowerCase();
    records = records.filter(r =>
      r.student_name?.toLowerCase().includes(term) ||
      r.enrollment_number?.toLowerCase().includes(term)
    );
  }

  // ── Total Count (cached in Redis for 10s) ─────────────────────────────────
  let total = 0;
  const countCacheKey = `ea:count:${event_id}:${JSON.stringify(filter)}`;
  try {
    const redis  = getRedis();
    const cached = await redis.get<number>(countCacheKey);
    if (cached !== null) {
      total = cached;
    } else {
      // Build same base query without pagination for count
      let countQ: FirebaseFirestore.Query = db.collection('event_attendance').where('event_id', '==', event_id);
      if (filter.department) countQ = countQ.where('department', '==', filter.department);
      if (filter.school)     countQ = countQ.where('school', '==', filter.school);
      if (filter.status)     countQ = countQ.where('status', '==', filter.status);

      const countSnap = await countQ.count().get();
      total = countSnap.data().count;
      await redis.set(countCacheKey, total, { ex: EVENT_ATTENDANCE_CONFIG.totalCountRedisTtlSec });
    }
  } catch (err: any) {
    // Fallback: count from result set
    logRedisFailure({ endpoint: 'event-attendance-list', event_id, operation: 'total_count_cache', reason: err.message });
    total = records.length + (hasNextPage ? 1 : 0);
  }

  // ── Status Breakdown ──────────────────────────────────────────────────────
  const statusCounts = records.reduce((acc: Record<string, number>, r) => {
    acc[r.status ?? 'present'] = (acc[r.status ?? 'present'] || 0) + 1;
    return acc;
  }, {});

  // ── Redis Analytics ───────────────────────────────────────────────────────
  const analytics = await fetchRedisAnalytics(event_id);

  // ── Capacity Metrics ──────────────────────────────────────────────────────
  const capacity        = event.capacity as number | undefined;
  const attendanceCount = (event.attendance_count as number | undefined) ?? 0;
  const remainingSeats  = capacity !== undefined ? Math.max(0, capacity - attendanceCount) : null;
  const attendancePct   = capacity ? parseFloat(((attendanceCount / capacity) * 100).toFixed(1)) : null;

  const totalPages = Math.ceil(total / pageSize);

  return apiResponse(res, 200, true, RESPONSE_CODES.SUCCESS, 'Records fetched.', records, {
    requestId: reqId,
    pagination: {
      total,
      page:        pageNum,
      pageSize,
      totalPages,
      hasNextPage,
      hasPrevPage: pageNum > 1,
      nextCursor:  hasNextPage ? docs[docs.length - 1]?.id : null,
    },
    metrics: {
      total_attendance:   attendanceCount,
      capacity:           capacity ?? null,
      remaining_seats:    remainingSeats,
      attendance_pct:     attendancePct,
      total_present:      statusCounts['present'] ?? 0,
      total_late:         statusCounts['late'] ?? 0,
      total_manual:       statusCounts['manual'] ?? 0,
      ...analytics,
    },
    event: {
      id:          event_id,
      title:       event.title,
      venue:       event.venue,
      starts_at:   event.starts_at,
      ends_at:     event.ends_at,
      is_active:   event.is_active,
      qr_enabled:  event.qr_enabled ?? true,
    },
  });
}

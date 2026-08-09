/**
 * server/event-planner-engine.ts
 *
 * Generic Event Planner Engine — supports any plannerType beyond Induction:
 *   orientation | workshop | hackathon | bootcamp | convocation
 *
 * Collections (NEW — zero overlap with induction_planners / induction_sessions):
 *   planners           — planner metadata with plannerType discriminator
 *   planner_sessions   — session data (Day, Date, Time, Venue, Speaker…)
 *   planner_days       — day groupings
 *   announcements      — written on publish (existing collection, additive only)
 *
 * Redis cache:
 *   key   : planner:{plannerType}:{plannerId}
 *   TTL   : 300 s (5 min)
 *   busted: on publish via redis.del(key)
 *
 * DO NOT import planner-engine.ts — engines must stay independent.
 */

import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { getRedis } from './redis.js';
import type { EventPlannerParseResult, PlannerSession, PlannerDay } from './event-planner-parser.js';

// ── Constants ──────────────────────────────────────────────────────────────────

export const ALLOWED_PLANNER_TYPES = [
  'orientation',
  'workshop',
  'hackathon',
  'bootcamp',
  'convocation',
] as const;

export type EventPlannerType = (typeof ALLOWED_PLANNER_TYPES)[number];

export type EventPlannerStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'ROLLED_BACK';

// State machine — allowed transitions
const ALLOWED_TRANSITIONS: Record<EventPlannerStatus, EventPlannerStatus[]> = {
  DRAFT:        ['VALIDATED', 'PUBLISHED', 'ARCHIVED'],
  VALIDATED:    ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED:    ['ARCHIVED'],
  ARCHIVED:     ['ROLLED_BACK'],
  ROLLED_BACK:  [],
};

function assertTransition(
  from: EventPlannerStatus,
  to: EventPlannerStatus,
  plannerId: string,
): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Illegal planner state transition for ${plannerId}: ${from} → ${to}. Allowed: ${allowed.join(', ')}`,
    );
  }
}

// ── ID Generation ──────────────────────────────────────────────────────────────

/**
 * Returns the next sequential planner ID for a given type + year.
 * Example: "event_orientation_2026_v3"
 */
export async function nextEventPlannerId(
  db: Firestore,
  plannerType: EventPlannerType,
  year: number,
): Promise<string> {
  const snap = await db
    .collection('planners')
    .where('plannerType', '==', plannerType)
    .where('plannerYear', '==', year)
    .get();

  let maxVersion = 0;
  const prefix = `event_${plannerType}_${year}_v`;

  for (const doc of snap.docs) {
    const match = doc.id.match(/^event_\w+_\d{4}_v(\d+)$/);
    if (match) {
      const v = parseInt(match[1], 10);
      if (v > maxVersion) maxVersion = v;
    }
  }

  return `${prefix}${maxVersion + 1}`;
}

// ── Audit Log ──────────────────────────────────────────────────────────────────

async function writeEventAuditLog(
  db: Firestore,
  log: {
    action: string;
    plannerId: string;
    plannerType: EventPlannerType;
    plannerYear: number;
    performedBy: string;
    performedByName: string;
    ipHash: string;
    userAgent: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const logId = `${log.action.toLowerCase()}_${log.plannerId}_${Date.now()}`;
  await db.collection('planner_audit_logs').doc(logId).set({
    ...log,
    logId,
    timestamp: new Date().toISOString(),
  });
}

// ── Redis cache key ────────────────────────────────────────────────────────────

export function eventScheduleCacheKey(
  plannerType: EventPlannerType,
  plannerId: string,
): string {
  return `planner:${plannerType}:${plannerId}`;
}

// ── Batch-write sessions + days ────────────────────────────────────────────────

async function batchWriteEventData(
  db: Firestore,
  plannerId: string,
  plannerType: EventPlannerType,
  parseResult: EventPlannerParseResult,
  status: EventPlannerStatus,
): Promise<void> {
  const BATCH_LIMIT = 400; // Firestore max 500 ops / batch, leave headroom

  // Sessions
  const sessions = parseResult.sessions;
  for (let i = 0; i < sessions.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = sessions.slice(i, i + BATCH_LIMIT);
    for (const s of chunk) {
      const docId = `${plannerId}_d${s.dayNumber}_${String(s.sequence).padStart(3, '0')}`;
      batch.set(db.collection('planner_sessions').doc(docId), {
        ...s,
        plannerId,
        plannerType,
        status,
        createdAt: new Date().toISOString(),
      });
    }
    await batch.commit();
  }

  // Days
  const batch = db.batch();
  for (const d of parseResult.days) {
    const docId = `${plannerId}_day${d.dayNumber}`;
    batch.set(db.collection('planner_days').doc(docId), {
      ...d,
      plannerId,
      plannerType,
      status,
      createdAt: new Date().toISOString(),
    });
  }
  await batch.commit();
}

// ── Archive planner data ───────────────────────────────────────────────────────

async function archiveEventPlannerData(
  db: Firestore,
  plannerId: string,
): Promise<void> {
  const BATCH_LIMIT = 400;

  const [sessionsSnap, daysSnap] = await Promise.all([
    db.collection('planner_sessions').where('plannerId', '==', plannerId).get(),
    db.collection('planner_days').where('plannerId', '==', plannerId).get(),
  ]);

  const allDocs = [...sessionsSnap.docs, ...daysSnap.docs];
  for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of allDocs.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc.ref, { status: 'ARCHIVED', archivedAt: new Date().toISOString() });
    }
    await batch.commit();
  }
}

// ── Save Draft ─────────────────────────────────────────────────────────────────

/**
 * Persist a parsed event planner as DRAFT.
 * Returns the new plannerId.
 */
export async function saveEventDraft(
  db: Firestore,
  parseResult: EventPlannerParseResult,
  plannerType: EventPlannerType,
  uploadedBy: string,
  uploadedByName: string,
  uploadedAt: string,
  ipHash: string,
  userAgent: string,
): Promise<string> {
  const plannerId = await nextEventPlannerId(db, plannerType, parseResult.plannerYear);

  await db.collection('planners').doc(plannerId).set({
    plannerId,
    plannerType,
    plannerYear:        parseResult.plannerYear,
    status:             'DRAFT' as EventPlannerStatus,
    filename:           parseResult.filename,
    fileChecksum:       parseResult.fileChecksum,
    uploadedBy,
    uploadedByName,
    uploadedAt,
    sessionCount:       parseResult.sessionCount,
    dayCount:           parseResult.dayCount,
    dateRange:          parseResult.dateRange,
    validationErrors:   parseResult.validationErrors.length,
    validationWarnings: parseResult.validationWarnings.length,
    warningDetails:     parseResult.validationWarnings,
    importLog:          null,
    publishedBy:        null,
    publishedAt:        null,
    createdAt:          uploadedAt,
    updatedAt:          uploadedAt,
  });

  await batchWriteEventData(db, plannerId, plannerType, parseResult, 'DRAFT');

  await writeEventAuditLog(db, {
    action:          'UPLOAD',
    plannerId,
    plannerType,
    plannerYear:     parseResult.plannerYear,
    performedBy:     uploadedBy,
    performedByName: uploadedByName,
    ipHash,
    userAgent,
    metadata: {
      sessionCount:    parseResult.sessionCount,
      warningCount:    parseResult.validationWarnings.length,
      errorCount:      parseResult.validationErrors.length,
    },
  });

  return plannerId;
}

// ── Publish ────────────────────────────────────────────────────────────────────

/**
 * Publish a DRAFT/VALIDATED event planner.
 * Archives any previous PUBLISHED planner of the same type.
 * Invalidates Redis cache.
 * Writes an announcement to the announcements collection.
 */
export async function publishEventPlanner(
  db: Firestore,
  plannerId: string,
  publishedBy: string,
  publishedByName: string,
  ipHash: string,
  userAgent: string,
): Promise<void> {
  const plannerRef = db.collection('planners').doc(plannerId);
  const plannerSnap = await plannerRef.get();
  if (!plannerSnap.exists) throw new Error(`Planner ${plannerId} not found`);

  const plannerData = plannerSnap.data()!;
  const currentStatus = plannerData.status as EventPlannerStatus;
  const plannerType = plannerData.plannerType as EventPlannerType;

  if (currentStatus !== 'VALIDATED' && currentStatus !== 'DRAFT') {
    assertTransition(currentStatus, 'PUBLISHED', plannerId);
  }

  if (plannerData.validationErrors > 0) {
    throw new Error(
      `Cannot publish: planner has ${plannerData.validationErrors} blocking validation error(s). Resolve them and re-upload.`,
    );
  }

  // Find and archive current PUBLISHED planner for same type
  const activeSnap = await db
    .collection('planners')
    .where('plannerType', '==', plannerType)
    .where('status', '==', 'PUBLISHED')
    .get();

  const now = new Date().toISOString();

  for (const doc of activeSnap.docs) {
    if (doc.id !== plannerId) {
      await archiveEventPlannerData(db, doc.id);
      await doc.ref.update({ status: 'ARCHIVED', archivedAt: now, updatedAt: now });
    }
  }

  // Activate new planner's sessions + days
  const [sessionsSnap, daysSnap] = await Promise.all([
    db.collection('planner_sessions').where('plannerId', '==', plannerId).get(),
    db.collection('planner_days').where('plannerId', '==', plannerId).get(),
  ]);

  const BATCH_LIMIT = 400;
  const allDocs = [...sessionsSnap.docs, ...daysSnap.docs];
  for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of allDocs.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc.ref, { status: 'ACTIVE', activatedAt: now });
    }
    await batch.commit();
  }

  // Update planner metadata
  await plannerRef.update({
    status:          'PUBLISHED',
    publishedBy,
    publishedByName,
    publishedAt:     now,
    updatedAt:       now,
  });

  // Invalidate Redis cache (fail-open)
  try {
    const redis = getRedis();
    await redis.del(eventScheduleCacheKey(plannerType, plannerId));
    // Also bust any cached key for the old published version
    for (const doc of activeSnap.docs) {
      if (doc.id !== plannerId) {
        await redis.del(eventScheduleCacheKey(plannerType, doc.id));
      }
    }
  } catch (e) {
    console.warn('[event-planner-engine] Redis cache invalidation failed (fail-open):', e);
  }

  // Write announcement (additive to existing collection)
  const plannerTypeLabel = plannerType.charAt(0).toUpperCase() + plannerType.slice(1);
  await db.collection('announcements').add({
    type:        'planner_published',
    plannerType,
    plannerId,
    title:       `📅 ${plannerTypeLabel} Schedule Updated`,
    message:     `The ${plannerTypeLabel} schedule has been published. Tap to view your schedule.`,
    link:        `/my-schedule?type=${plannerType}&day=today`,
    status:      'active',
    audience:    'students',
    createdAt:   now,
    expiresAt:   null,
  });

  await writeEventAuditLog(db, {
    action:          'PUBLISH',
    plannerId,
    plannerType,
    plannerYear:     plannerData.plannerYear,
    performedBy:     publishedBy,
    performedByName: publishedByName,
    ipHash,
    userAgent,
    metadata: { sessionCount: plannerData.sessionCount },
  });
}

// ── Get Published Sessions ─────────────────────────────────────────────────────

/**
 * Returns all ACTIVE sessions for a plannerType.
 * Tries Redis cache first (TTL 5 min), falls back to Firestore.
 */
export async function getPublishedEventSessions(
  db: Firestore,
  plannerType: EventPlannerType,
): Promise<{ plannerId: string; publishedAt: string; sessions: PlannerSession[]; days: PlannerDay[] } | null> {
  // Find active planner
  const plannerSnap = await db
    .collection('planners')
    .where('plannerType', '==', plannerType)
    .where('status', '==', 'PUBLISHED')
    .limit(1)
    .get();

  if (plannerSnap.empty) return null;

  const plannerDoc = plannerSnap.docs[0];
  const plannerData = plannerDoc.data();
  const plannerId = plannerDoc.id;

  // Try Redis cache
  try {
    const redis = getRedis();
    const cacheKey = eventScheduleCacheKey(plannerType, plannerId);
    const cached = await redis.get(cacheKey) as string | null;
    if (cached) {
      return JSON.parse(cached);
    }
  } catch { /* fail-open */ }

  // Firestore fallback
  const [sessionsSnap, daysSnap] = await Promise.all([
    db.collection('planner_sessions')
      .where('plannerId', '==', plannerId)
      .where('status', '==', 'ACTIVE')
      .get(),
    db.collection('planner_days')
      .where('plannerId', '==', plannerId)
      .where('status', '==', 'ACTIVE')
      .get(),
  ]);

  const sessions = sessionsSnap.docs.map(d => d.data() as PlannerSession);
  sessions.sort((a, b) => {
    if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
    return a.sequence - b.sequence;
  });

  const days = daysSnap.docs.map(d => d.data() as PlannerDay);
  days.sort((a, b) => a.dayNumber - b.dayNumber);

  const result = {
    plannerId,
    publishedAt: plannerData.publishedAt,
    plannerTypeName: plannerData.plannerType,
    sessions,
    days,
  };

  // Cache result
  try {
    const redis = getRedis();
    const cacheKey = eventScheduleCacheKey(plannerType, plannerId);
    await redis.set(cacheKey, JSON.stringify(result), { ex: 300 }); // 5 min TTL
  } catch { /* fail-open */ }

  return result;
}

// ── Get Planner Status (admin) ────────────────────────────────────────────────

export async function getEventPlannerStatus(
  db: Firestore,
  plannerType: EventPlannerType,
): Promise<{
  activePlanner: Record<string, unknown> | null;
  history: Record<string, unknown>[];
  draftCount: number;
}> {
  const snap = await db
    .collection('planners')
    .where('plannerType', '==', plannerType)
    .get();

  const all = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  all.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
  
  const limitedAll = all.slice(0, 20);
  const activePlanner = limitedAll.find(p => p.status === 'PUBLISHED') ?? null;
  const history = all.filter((p: any) => p.status !== 'PUBLISHED');
  const draftCount = all.filter((p: any) => p.status === 'DRAFT').length;

  // Attach sessions preview for active planner
  if (activePlanner) {
    const sessionsSnap = await db
      .collection('planner_sessions')
      .where('plannerId', '==', (activePlanner as any).plannerId)
      .where('status', '==', 'ACTIVE')
      .limit(200)
      .get();
    
    const sessions = sessionsSnap.docs.map(d => d.data());
    sessions.sort((a: any, b: any) => {
      if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
      return a.sequence - b.sequence;
    });
    
    (activePlanner as any).sessions = sessions;
  }

  return { activePlanner, history, draftCount };
}

// ── Rollback ───────────────────────────────────────────────────────────────────

export async function rollbackEventPlanner(
  db: Firestore,
  plannerId: string,
  performedBy: string,
  performedByName: string,
  ipHash: string,
  userAgent: string,
): Promise<void> {
  const plannerRef = db.collection('planners').doc(plannerId);
  const plannerSnap = await plannerRef.get();
  if (!plannerSnap.exists) throw new Error(`Planner ${plannerId} not found`);

  const plannerData = plannerSnap.data()!;
  const plannerType = plannerData.plannerType as EventPlannerType;

  if (!['ARCHIVED', 'ROLLED_BACK'].includes(plannerData.status)) {
    throw new Error(`Cannot rollback planner with status ${plannerData.status}`);
  }

  // Archive current PUBLISHED planner first
  const activeSnap = await db
    .collection('planners')
    .where('plannerType', '==', plannerType)
    .where('status', '==', 'PUBLISHED')
    .get();

  const now = new Date().toISOString();

  for (const doc of activeSnap.docs) {
    await archiveEventPlannerData(db, doc.id);
    await doc.ref.update({ status: 'ARCHIVED', archivedAt: now, updatedAt: now });
  }

  // Activate rollback target
  const [sessionsSnap, daysSnap] = await Promise.all([
    db.collection('planner_sessions').where('plannerId', '==', plannerId).get(),
    db.collection('planner_days').where('plannerId', '==', plannerId).get(),
  ]);

  const BATCH_LIMIT = 400;
  const allDocs = [...sessionsSnap.docs, ...daysSnap.docs];
  for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of allDocs.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc.ref, { status: 'ACTIVE', activatedAt: now });
    }
    await batch.commit();
  }

  await plannerRef.update({
    status:         'PUBLISHED',
    publishedBy:    performedBy,
    publishedByName: performedByName,
    publishedAt:    now,
    updatedAt:      now,
    rolledBackAt:   now,
  });

  // Bust cache for all versions of this type
  try {
    const redis = getRedis();
    await redis.del(eventScheduleCacheKey(plannerType, plannerId));
  } catch { /* fail-open */ }

  await writeEventAuditLog(db, {
    action:          'ROLLBACK',
    plannerId,
    plannerType,
    plannerYear:     plannerData.plannerYear,
    performedBy,
    performedByName,
    ipHash,
    userAgent,
  });
}

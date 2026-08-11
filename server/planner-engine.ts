/**
 * Planner Engine — Aarambh 2026
 *
 * INTERNAL SERVER LIBRARY — import only from authenticated API handlers.
 *
 * Responsibilities:
 *   • Generate human-readable planner IDs (planner_2026_v1, v2, …)
 *   • Enforce the planner state machine (DRAFT→VALIDATED→PUBLISHED→ARCHIVED→ROLLED_BACK)
 *   • Acquire / release a publish lock via Firestore transaction
 *   • Batch-write planner data to Firestore in chunks ≤ 499
 *   • Write audit logs for every planner lifecycle action
 *
 * State Machine:
 *   DRAFT ──validate()──► VALIDATED ──publish()──► PUBLISHED
 *     │                                                │
 *   deleteDraft()                              archivePlanner() / newPublish()
 *     │                                                │
 *   [DELETED]                                     ARCHIVED ──rollback()──► ROLLED_BACK
 *                                                    (reactivates the target planner as PUBLISHED)
 */

import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import type {
  PlannerParseResult,
  ParsedPlannerRoomAllocation,
  ParsedSession,
  ParsedVenue,
  PlannerStatus,
} from './planner-parser.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportLog {
  plannerId:           string;
  plannerYear:         number;
  uploadedBy:          string;
  uploadedByName:      string;
  publishedBy:         string;
  publishedByName:     string;
  excelFilename:       string;
  fileChecksum:        string;
  uploadedAt:          string;
  publishedAt:         string;
  parseDurationMs:     number;
  publishDurationMs:   number;
  rowsParsed:          number;
  rowsImported:        number;
  rowsIgnored:         number;
  schoolsImported:     number;
  programmesImported:  number;
  coursesImported:     number;
  roomsImported:       number;
  sessionsImported:    number;
  venuesImported:      number;
  facultyImported:     number;
  validationWarnings:  number;
  validationErrors:    number;
  warningDetails:      any[];
}

export type AuditAction =
  | 'UPLOAD'
  | 'VALIDATE'
  | 'PUBLISH'
  | 'ARCHIVE'
  | 'ROLLBACK'
  | 'DRAFT_DELETE'
  | 'VENUE_OVERRIDE_CREATE'
  | 'VENUE_OVERRIDE_UPDATE'
  | 'VENUE_OVERRIDE_DELETE';

export interface PlannerAuditLog {
  logId:           string;
  action:          AuditAction;
  plannerId:       string;
  plannerYear:     number;
  performedBy:     string;   // uid
  performedByName: string;
  ipHash:          string;
  userAgent:       string;
  durationMs:      number;
  timestamp:       string;
  metadata:        Record<string, any>;
}

// ── Illegal Transitions ───────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<PlannerStatus, PlannerStatus[]> = {
  DRAFT:       ['VALIDATED'],
  VALIDATED:   ['PUBLISHED', 'DRAFT'],   // can re-draft after validation
  PUBLISHED:   ['ARCHIVED'],
  ARCHIVED:    ['ROLLED_BACK'],
  ROLLED_BACK: ['ARCHIVED'],
};

function assertTransition(from: PlannerStatus, to: PlannerStatus, plannerId: string): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Illegal planner state transition for ${plannerId}: ${from} → ${to}. Allowed: ${allowed.join(', ')}`
    );
  }
}

// ── ID Generation ─────────────────────────────────────────────────────────────

/**
 * Returns the next sequential planner ID for the given year.
 * Example: if planner_2026_v1 and planner_2026_v2 exist, returns "planner_2026_v3".
 */
export async function nextPlannerId(db: Firestore, year: number): Promise<string> {
  const snap = await db.collection('induction_planners')
    .where('plannerYear', '==', year)
    .get();

  let maxVersion = 0;
  for (const doc of snap.docs) {
    const match = doc.id.match(/^planner_\d{4}_v(\d+)$/);
    if (match) {
      const v = parseInt(match[1], 10);
      if (v > maxVersion) maxVersion = v;
    }
  }

  return `planner_${year}_v${maxVersion + 1}`;
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export async function writeAuditLog(
  db: Firestore,
  log: Omit<PlannerAuditLog, 'logId' | 'timestamp'>,
): Promise<void> {
  const logId = `${log.action.toLowerCase()}_${log.plannerId}_${Date.now()}`;
  await db.collection('planner_audit_logs').doc(logId).set({
    ...log,
    logId,
    timestamp: new Date().toISOString(),
  });
}

// ── Save Draft ────────────────────────────────────────────────────────────────

/**
 * Persist a parsed planner as DRAFT.
 * Writes the planner metadata + all room/session/venue data with status=DRAFT.
 * Does NOT touch any active planner.
 */
export async function saveDraft(
  db: Firestore,
  parseResult: PlannerParseResult,
  uploadedBy: string,
  uploadedByName: string,
  uploadedAt: string,
  ipHash: string,
  userAgent: string,
): Promise<string> {
  const plannerId = await nextPlannerId(db, parseResult.plannerYear);

  const plannerRef = db.collection('induction_planners').doc(plannerId);
  await plannerRef.set({
    plannerId,
    plannerYear:      parseResult.plannerYear,
    status:           'DRAFT' as PlannerStatus,
    excelFilename:    parseResult.excelFilename,
    fileChecksum:     parseResult.fileChecksum,
    uploadedBy,
    uploadedByName,
    uploadedAt,
    rowsParsed:       parseResult.rowsParsed,
    rowsIgnored:      parseResult.rowsIgnored,
    validationErrors: parseResult.validationErrors.length,
    validationWarnings: parseResult.validationWarnings.length,
    warningDetails:   parseResult.validationWarnings,
    summary:          parseResult.summary,
    importLog:        null,
    publishedBy:      null,
    publishedAt:      null,
    createdAt:        uploadedAt,
    updatedAt:        uploadedAt,
  });

  // Batch-write room allocations, sessions, venues — tagged with plannerId + status=DRAFT
  await batchWriteData(db, plannerId, parseResult, 'DRAFT');

  // Audit
  await writeAuditLog(db, {
    action:         'UPLOAD',
    plannerId,
    plannerYear:    parseResult.plannerYear,
    performedBy:    uploadedBy,
    performedByName: uploadedByName,
    ipHash,
    userAgent,
    durationMs:     0,
    metadata: {
      summary:       parseResult.summary,
      warningCount:  parseResult.validationWarnings.length,
      errorCount:    parseResult.validationErrors.length,
    },
  });

  return plannerId;
}

// ── Mark Validated ────────────────────────────────────────────────────────────

export async function markValidated(
  db: Firestore,
  plannerId: string,
): Promise<void> {
  const plannerRef = db.collection('induction_planners').doc(plannerId);
  const snap = await plannerRef.get();
  if (!snap.exists) throw new Error(`Planner ${plannerId} not found`);

  const current = snap.data()!.status as PlannerStatus;
  assertTransition(current, 'VALIDATED', plannerId);

  await plannerRef.update({ status: 'VALIDATED', updatedAt: new Date().toISOString() });
}

// ── Publish ───────────────────────────────────────────────────────────────────

/**
 * Publish a VALIDATED planner.
 *
 * Transaction 1: acquire publish lock
 * WriteBatches:  archive current PUBLISHED, write all docs as ACTIVE, update planner status
 * Transaction 2: release lock + write ImportLog
 */
export async function publishPlanner(
  db: Firestore,
  plannerId: string,
  publishedBy: string,
  publishedByName: string,
  ipHash: string,
  userAgent: string,
): Promise<ImportLog> {
  const publishStart = Date.now();
  const lockRef = db.collection('induction_platform_config').doc('planner_lock');
  const plannerRef = db.collection('induction_planners').doc(plannerId);

  // ── Transaction 1: Acquire lock ───────────────────────────────────────────
  await db.runTransaction(async (tx) => {
    const lockDoc = await tx.get(lockRef);
    if (lockDoc.exists && lockDoc.data()?.import_lock === true) {
      throw new Error('A planner publish is already in progress. Please wait and try again.');
    }
    tx.set(lockRef, {
      import_lock:  true,
      lockedBy:     publishedBy,
      lockedByName: publishedByName,
      lockedAt:     new Date().toISOString(),
    }, { merge: true });
  });

  let currentActivePlannerId: string | null = null;

  try {
    // Validate planner exists and is in VALIDATED state
    const plannerSnap = await plannerRef.get();
    if (!plannerSnap.exists) throw new Error(`Planner ${plannerId} not found`);
    const plannerData = plannerSnap.data()!;
    const currentStatus = plannerData.status as PlannerStatus;

    // Allow DRAFT → PUBLISHED directly (re-validate guard)
    if (currentStatus !== 'VALIDATED' && currentStatus !== 'DRAFT') {
      assertTransition(currentStatus, 'PUBLISHED', plannerId);
    }

    if (plannerData.validationErrors > 0) {
      throw new Error(
        `Cannot publish: planner has ${plannerData.validationErrors} blocking validation error(s). Resolve them and re-upload.`
      );
    }

    // ── Validate Mappings & Capacities ──────────────────────────────────────
    const allocationsSnap = await db.collection('induction_room_allocations')
      .where('plannerId', '==', plannerId)
      .get();
    
    if (allocationsSnap.empty) {
      throw new Error('Cannot publish: planner has no room allocations.');
    }

    const uniqueRooms = new Map<string, any>();
    
    for (const doc of allocationsSnap.docs) {
      const data = doc.data();
      
      if (!data.roomNumber) {
        throw new Error(`Cannot publish: Missing mapped room for programme "${data.programme}" (Row ${data.rowIndex}).`);
      }
      
      if (!data.capacity || data.capacity <= 0) {
        throw new Error(`Cannot publish: Room "${data.roomNumber}" for programme "${data.programme}" has invalid capacity (${data.capacity}).`);
      }
      
      if (!uniqueRooms.has(data.roomNumber)) {
        uniqueRooms.set(data.roomNumber, {
          roomNumber: data.roomNumber,
          capacity: data.capacity,
          programme: data.programme,
          school: data.schoolCode || data.school,
          plannerId: plannerId,
          status: 'ACTIVE',
          block: data.block || '',
          floor: data.floor || '',
          building: ''
        });
      }
    }

    // ── Seed Runtime Rooms ──────────────────────────────────────────────────
    // We must safely seed rooms without overwriting existing runtime state (occupied, remainingSeats)
    const roomsBatch = db.batch();
    const existingRoomsSnap = await db.collection('rooms').get();
    const existingRoomIds = new Set(existingRoomsSnap.docs.map(d => d.id));
    
    for (const [roomNo, roomData] of uniqueRooms.entries()) {
      if (!existingRoomIds.has(roomNo)) {
        // Room does not exist in runtime collection; seed it safely.
        const roomRef = db.collection('rooms').doc(roomNo);
        roomsBatch.set(roomRef, {
          ...roomData,
          occupied: 0,
          remainingSeats: roomData.capacity,
        });
      }
    }
    await roomsBatch.commit();

    // ── Find current PUBLISHED planner to archive ─────────────────────────
    const activeSnap = await db.collection('induction_planners')
      .where('status', '==', 'PUBLISHED')
      .get();

    for (const doc of activeSnap.docs) {
      if (doc.id !== plannerId) {
        currentActivePlannerId = doc.id;
      }
    }

    // ── WriteBatch: Archive previous, activate new ─────────────────────────
    const now = new Date().toISOString();

    // Archive previous planner's data docs
    if (currentActivePlannerId) {
      await archivePlannerData(db, currentActivePlannerId);
    }

    // Update planner status docs
    const metaBatch = db.batch();
    if (currentActivePlannerId) {
      const prevRef = db.collection('induction_planners').doc(currentActivePlannerId);
      metaBatch.update(prevRef, { status: 'ARCHIVED', archivedAt: now, updatedAt: now });
    }
    metaBatch.update(plannerRef, {
      status:     'PUBLISHED',
      publishedBy,
      publishedByName,
      publishedAt: now,
      updatedAt:  now,
    });
    await metaBatch.commit();

    // ── Transaction 2: Release lock + write ImportLog ─────────────────────
    const publishDurationMs = Date.now() - publishStart;
    const importLog: ImportLog = {
      plannerId,
      plannerYear:         plannerData.plannerYear,
      uploadedBy:          plannerData.uploadedBy,
      uploadedByName:      plannerData.uploadedByName,
      publishedBy,
      publishedByName,
      excelFilename:       plannerData.excelFilename,
      fileChecksum:        plannerData.fileChecksum,
      uploadedAt:          plannerData.uploadedAt,
      publishedAt:         now,
      parseDurationMs:     0,
      publishDurationMs,
      rowsParsed:          plannerData.rowsParsed,
      rowsImported:        plannerData.rowsParsed - plannerData.rowsIgnored,
      rowsIgnored:         plannerData.rowsIgnored,
      schoolsImported:     plannerData.summary?.schoolCount    ?? 0,
      programmesImported:  plannerData.summary?.programmeCount ?? 0,
      coursesImported:     plannerData.summary?.courseCount    ?? 0,
      roomsImported:       plannerData.summary?.roomCount      ?? 0,
      sessionsImported:    plannerData.summary?.sessionCount   ?? 0,
      venuesImported:      plannerData.summary?.venueCount     ?? 0,
      facultyImported:     plannerData.summary?.facultyCount   ?? 0,
      validationWarnings:  plannerData.validationWarnings,
      validationErrors:    plannerData.validationErrors,
      warningDetails:      plannerData.warningDetails ?? [],
    };

    await db.runTransaction(async (tx) => {
      tx.set(lockRef, { import_lock: false, unlockedAt: now }, { merge: true });
      tx.update(plannerRef, { importLog, updatedAt: now });
    });

    // Audit
    await writeAuditLog(db, {
      action:         'PUBLISH',
      plannerId,
      plannerYear:    plannerData.plannerYear,
      performedBy:    publishedBy,
      performedByName: publishedByName,
      ipHash,
      userAgent,
      durationMs:     publishDurationMs,
      metadata: { archivedPreviousPlanner: currentActivePlannerId, importLog },
    });

    return importLog;

  } catch (err) {
    // Release lock even on failure so admins aren't permanently locked out
    await lockRef.set({ import_lock: false, errorUnlockedAt: new Date().toISOString() }, { merge: true })
      .catch(e => console.error('[planner-engine] Failed to release lock on error:', e));
    throw err;
  }
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archivePlanner(
  db: Firestore,
  plannerId: string,
  archivedBy: string,
  archivedByName: string,
  ipHash: string,
  userAgent: string,
): Promise<void> {
  const plannerRef = db.collection('induction_planners').doc(plannerId);
  const snap = await plannerRef.get();
  if (!snap.exists) throw new Error(`Planner ${plannerId} not found`);

  const current = snap.data()!.status as PlannerStatus;
  assertTransition(current, 'ARCHIVED', plannerId);

  const now = new Date().toISOString();
  await plannerRef.update({ status: 'ARCHIVED', archivedAt: now, updatedAt: now });
  await archivePlannerData(db, plannerId);

  await writeAuditLog(db, {
    action: 'ARCHIVE', plannerId, plannerYear: snap.data()!.plannerYear,
    performedBy: archivedBy, performedByName: archivedByName,
    ipHash, userAgent, durationMs: 0, metadata: {},
  });
}

// ── Rollback ──────────────────────────────────────────────────────────────────

/**
 * Roll back to a previously archived planner.
 * Archives the current PUBLISHED planner, sets the target to PUBLISHED.
 */
export async function rollbackToPlanner(
  db: Firestore,
  targetPlannerId: string,
  rolledBackBy: string,
  rolledBackByName: string,
  ipHash: string,
  userAgent: string,
): Promise<void> {
  const targetRef = db.collection('induction_planners').doc(targetPlannerId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new Error(`Target planner ${targetPlannerId} not found`);

  const targetStatus = targetSnap.data()!.status as PlannerStatus;
  if (targetStatus !== 'ARCHIVED' && targetStatus !== 'ROLLED_BACK') {
    throw new Error(`Can only rollback to ARCHIVED planners. "${targetPlannerId}" is ${targetStatus}`);
  }

  const now = new Date().toISOString();

  // Archive current PUBLISHED
  const activeSnap = await db.collection('induction_planners')
    .where('status', '==', 'PUBLISHED').get();

  const metaBatch = db.batch();
  for (const doc of activeSnap.docs) {
    if (doc.id !== targetPlannerId) {
      metaBatch.update(doc.ref, { status: 'ARCHIVED', archivedAt: now, updatedAt: now });
    }
  }

  // Activate target
  metaBatch.update(targetRef, {
    status:         'ROLLED_BACK',
    rolledBackBy,
    rolledBackByName,
    rolledBackAt:   now,
    updatedAt:      now,
  });

  await metaBatch.commit();

  await writeAuditLog(db, {
    action: 'ROLLBACK', plannerId: targetPlannerId,
    plannerYear: targetSnap.data()!.plannerYear,
    performedBy: rolledBackBy, performedByName: rolledBackByName,
    ipHash, userAgent, durationMs: 0,
    metadata: { previousActivePlanners: activeSnap.docs.map(d => d.id) },
  });
}

// ── Delete Draft ──────────────────────────────────────────────────────────────

export async function deleteDraft(
  db: Firestore,
  plannerId: string,
  deletedBy: string,
  deletedByName: string,
  ipHash: string,
  userAgent: string,
): Promise<void> {
  const plannerRef = db.collection('induction_planners').doc(plannerId);
  const snap = await plannerRef.get();
  if (!snap.exists) throw new Error(`Planner ${plannerId} not found`);

  const status = snap.data()!.status as PlannerStatus;
  if (status !== 'DRAFT' && status !== 'VALIDATED') {
    throw new Error(`Can only delete DRAFT or VALIDATED planners. "${plannerId}" is ${status}`);
  }

  // Delete all data docs for this planner
  await deleteAllPlannerData(db, plannerId);
  await plannerRef.delete();

  await writeAuditLog(db, {
    action: 'DRAFT_DELETE', plannerId, plannerYear: snap.data()!.plannerYear,
    performedBy: deletedBy, performedByName: deletedByName,
    ipHash, userAgent, durationMs: 0, metadata: {},
  });
}

// ── Internal Batch Helpers ────────────────────────────────────────────────────

const BATCH_LIMIT = 499;

async function commitBatches(db: Firestore, writes: Array<(b: WriteBatch) => void>): Promise<void> {
  const chunks: Array<Array<(b: WriteBatch) => void>> = [];
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    chunks.push(writes.slice(i, i + BATCH_LIMIT));
  }
  for (const chunk of chunks) {
    const b = db.batch();
    for (const w of chunk) w(b);
    await b.commit();
  }
}

/**
 * Safely sanitize a string for use as a Firestore document ID.
 * Firestore document IDs cannot contain slashes '/' or spaces, and must not be empty.
 */
export function sanitizeDocId(str: string): string {
  return str
    .replace(/[/\\|()[\]#$?:,;'"\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 1500);
}

async function batchWriteData(
  db: Firestore,
  plannerId: string,
  parseResult: PlannerParseResult,
  _status: string,
): Promise<void> {
  const writes: Array<(b: WriteBatch) => void> = [];

  // Room Allocations
  for (const r of parseResult.roomAllocations) {
    const docId = sanitizeDocId(`${plannerId}_${r.mappingKey}_r${r.rowIndex}`);
    const ref = db.collection('induction_room_allocations').doc(docId);
    writes.push(b => b.set(ref, { ...r, plannerId, createdAt: new Date().toISOString() }));
  }

  // Sessions
  for (const s of parseResult.sessions) {
    const docId = sanitizeDocId(`${plannerId}_d${s.dayNumber}_${s.scope}_${s.rowIndex}`);
    const ref = db.collection('induction_sessions').doc(docId);
    writes.push(b => b.set(ref, { ...s, plannerId, createdAt: new Date().toISOString() }));
  }

  // Venues
  for (const v of parseResult.venues) {
    const docId = sanitizeDocId(`${plannerId}_${v.name.toLowerCase()}`);
    const ref = db.collection('induction_venues').doc(docId);
    writes.push(b => b.set(ref, { ...v, plannerId, createdAt: new Date().toISOString() }));
  }

  // Faculty (derived from sessions)
  const facultySet = new Set<string>();
  for (const s of parseResult.sessions) {
    if (s.facultyCoordinator && !facultySet.has(s.facultyCoordinator)) {
      facultySet.add(s.facultyCoordinator);
      const docId = sanitizeDocId(`${plannerId}_${s.facultyCoordinator.toLowerCase()}`);
      const ref = db.collection('induction_faculty_coordinators').doc(docId);
      writes.push(b => b.set(ref, {
        name: s.facultyCoordinator, plannerId, createdAt: new Date().toISOString(),
      }));
    }
  }

  await commitBatches(db, writes);
}

async function archivePlannerData(db: Firestore, plannerId: string): Promise<void> {
  // Data docs stay in Firestore (they reference plannerId so they're naturally isolated)
  // We don't need to move them — queries always filter by plannerId of the PUBLISHED planner
  // Archiving just changes the planner metadata status
}

async function deleteAllPlannerData(db: Firestore, plannerId: string): Promise<void> {
  const collections = [
    'induction_room_allocations',
    'induction_sessions',
    'induction_venues',
    'induction_faculty_coordinators',
  ];

  for (const col of collections) {
    const snap = await db.collection(col).where('plannerId', '==', plannerId).get();
    if (snap.empty) continue;
    const writes: Array<(b: WriteBatch) => void> = snap.docs.map(d => (b: WriteBatch) => b.delete(d.ref));
    await commitBatches(db, writes);
  }
}

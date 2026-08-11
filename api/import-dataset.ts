import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, DocumentReference, DocumentData } from 'firebase-admin/firestore';

let firebaseInitialized = false;
let firebaseInitError = '';

try {
  if (!getApps().length) {
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL ||
      !process.env.FIREBASE_PRIVATE_KEY
    ) {
      throw new Error('Missing Firebase Admin credentials.');
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  firebaseInitialized = true;
} catch (e: any) {
  console.error('[import-dataset] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

function apiResponse(res: any, status: number, ok: boolean, message: string, data: any = null) {
  return res.status(status).json({ ok, message, data, timestamp: new Date().toISOString() });
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractValue(row: any, possibleKeys: string[]): string {
  for (const key of Object.keys(row)) {
    const norm = normalizeKey(key);
    if (possibleKeys.includes(norm)) {
      const val = row[key];
      if (val === null || val === undefined) return '';
      return String(val).trim();
    }
  }
  return '';
}

// ── Resolve collection names from dataset_scope ──────────────────────────────
function resolveCollections(dataset_scope: string) {
  if (dataset_scope === 'induction') {
    return {
      datasetCollection: 'induction_datasets',
      participantCollection: 'induction_participants',
    };
  }
  return {
    datasetCollection: 'event_datasets',
    participantCollection: 'event_participants',
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, `Firebase init error: ${firebaseInitError}`);

  try {
    const { dataset_id, action, rows, batch_time_ms, admin_id = 'system' } = req.body;

    if (!dataset_id || !action) {
      return apiResponse(res, 400, false, 'Missing dataset_id or action.');
    }

    const db = getFirestore();

    // ── Resolve dataset document (determine type from stored record) ──────────
    // We try event_datasets first, then induction_datasets.
    let datasetRef: DocumentReference<DocumentData>;
    let dataset: any;
    let dataset_scope: 'event' | 'induction';

    const eventDatasetRef = db.collection('event_datasets').doc(dataset_id);
    const eventDatasetDoc = await eventDatasetRef.get();

    if (eventDatasetDoc.exists) {
      datasetRef = eventDatasetRef;
      dataset = eventDatasetDoc.data()!;
      dataset_scope = 'event';
    } else {
      const inductionDatasetRef = db.collection('induction_datasets').doc(dataset_id);
      const inductionDatasetDoc = await inductionDatasetRef.get();
      if (!inductionDatasetDoc.exists) {
        return apiResponse(res, 404, false, 'Dataset not found.');
      }
      datasetRef = inductionDatasetRef;
      dataset = inductionDatasetDoc.data()!;
      dataset_scope = 'induction';
    }

    const { datasetCollection, participantCollection } = resolveCollections(dataset_scope);

    // ── Resolve parent ref for lock management ───────────────────────────────
    // Event: lock lives on the event document
    // Induction: lock lives on induction_platform_config/settings
    let parentRef: DocumentReference<DocumentData>;
    if (dataset_scope === 'event') {
      parentRef = db.collection('events').doc(dataset.scope_id || dataset.event_id);
    } else {
      parentRef = db.collection('induction_platform_config').doc('settings');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: START
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'start') {
      if (['READY', 'ACTIVE', 'ARCHIVED'].includes(dataset.status)) {
        return apiResponse(res, 200, true, `Dataset is already ${dataset.status}.`, { status: dataset.status });
      }

      await db.runTransaction(async (tx) => {
        const parentSnap = await tx.get(parentRef);
        
        const now = new Date();
        const expires_at = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

        const lockObj = {
          dataset_id,
          locked_by: admin_id,
          locked_at: FieldValue.serverTimestamp(),
          expires_at: Timestamp.fromDate(expires_at),
          operation: 'IMPORT'
        };

        if (dataset_scope === 'event') {
          if (!parentSnap.exists) throw new Error('event_not_found');
          const evtData = parentSnap.data()!;
          if (evtData.dataset_lock && evtData.dataset_lock.expires_at?.toDate() > now) {
            throw new Error('import_in_progress');
          }
          tx.update(parentRef, { dataset_lock: lockObj });
        } else {
          const configData = parentSnap.exists ? parentSnap.data()! : {};
          if (configData.dataset_lock && configData.dataset_lock.expires_at?.toDate() > now) {
            throw new Error('import_in_progress');
          }
          if (parentSnap.exists) {
            tx.update(parentRef, { dataset_lock: lockObj });
          } else {
            tx.set(parentRef, { dataset_lock: lockObj, active_dataset_id: null, updated_at: FieldValue.serverTimestamp() });
          }
        }

        tx.update(datasetRef, {
          status: 'IMPORTING',
          'statistics.rows.inserted': 0,
          'statistics.rows.updated': 0,
          'statistics.rows.skipped': 0,
          'statistics.rows.conflicts': 0,
        });
      });

      return apiResponse(res, 200, true, 'Import started and lock acquired.');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: CHUNK
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'chunk') {
      if (!Array.isArray(rows) || rows.length === 0) {
        return apiResponse(res, 400, false, 'No rows provided in chunk.');
      }
      if (rows.length > 500) {
        return apiResponse(res, 400, false, 'Batch size exceeds Firestore limit of 500.');
      }

      const batch = db.batch();
      let insertedCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let failCount = 0;
      let conflictCount = 0;
      let firestoreWrites = 0;
      let firestoreReads = 0;
      const conflictLogs: any[] = [];
      const parsedRows: any[] = [];
      const participantRefs: any[] = [];

      for (const row of rows) {
        const isBlank = Object.values(row as any).every((v) => !v || String(v).trim() === '');
        if (isBlank) continue;

        const appNumber = extractValue(row, [
          'applicationnumber', 'applicationno', 'enrollmentnumber',
          'enrollmentno', 'appno', 'krmuappno', 'krmuid',
        ]).toUpperCase();
        const studentName = extractValue(row, ['studentname', 'name', 'registeredname', 'fullname', 'candidatename']);
        const email       = extractValue(row, ['email', 'registeredemail', 'emailid', 'emailaddress']);
        const mobile      = extractValue(row, ['mobile', 'phone', 'registeredmobile', 'contact', 'mobileno']);
        const school      = extractValue(row, ['school', 'schoolname', 'institute']);
        const course      = extractValue(row, ['course', 'coursepreference', 'coursename']);
        const program     = extractValue(row, ['program', 'programpreference', 'programme', 'programname']);

        const admissionStatusRaw = extractValue(row, ['admissionstatus', 'status', 'studentstatus']);
        let admissionStatus = 'ACTIVE';
        if (admissionStatusRaw) {
          const s = admissionStatusRaw.toUpperCase();
          if (['ACTIVE', 'WITHDRAWN', 'DEFERRED', 'REJECTED', 'CANCELLED'].includes(s)) {
            admissionStatus = s;
          }
        }

        if (!appNumber || !studentName) { failCount++; continue; }

        let docId = appNumber;
        if (dataset_scope === 'event') {
          const eventId = dataset.scope_id || dataset.event_id;
          docId = `${eventId}_${appNumber}`;
        }
        
        const ref = db.collection(participantCollection).doc(docId);
        participantRefs.push(ref);
        parsedRows.push({ docId, appNumber, studentName, email, mobile, school, course, program, admissionStatus, ref });
      }

      const existingDocsMap = new Map<string, any>();
      if (participantRefs.length > 0) {
        try {
          // Efficient bulk-read of up to 500 documents
          const snaps = await db.getAll(...participantRefs);
          firestoreReads += snaps.length;
          for (const snap of snaps) {
            if (snap.exists) {
              existingDocsMap.set(snap.id, snap.data());
            }
          }
        } catch (error) {
          console.error("[import-dataset] Bulk read failed", error);
        }
      }
      // batch was already initialized at the start of chunk action
      for (const parsed of parsedRows) {
        const existing = existingDocsMap.get(parsed.docId);

        if (existing) {
          // Conflict check for registered induction users
          if (dataset_scope === 'induction' && existing.registration_status === 'REGISTERED' && existing.email && parsed.email && existing.email !== parsed.email) {
            conflictCount++;
            conflictLogs.push({
              severity: 'HIGH',
              reason: 'Email mismatch — student is already registered',
              old_dataset: existing.dataset_id,
              new_dataset: dataset_id,
              application_number: parsed.appNumber,
              timestamp: FieldValue.serverTimestamp(),
              resolved: false,
              resolved_by: null,
              resolved_at: null,
              resolution_note: null,
              resolution_time: null,
              imported_email: parsed.email,
              stored_email: existing.email,
              student_name: parsed.studentName,
            });
            continue;
          }

          let hasChanges = false;
          const updates: any = {};
          
          const fields = [
            { key: 'student_name', val: parsed.studentName },
            { key: 'school', val: parsed.school },
            { key: 'course', val: parsed.course },
            { key: 'program', val: parsed.program },
            { key: 'admission_status', val: parsed.admissionStatus }
          ];

          for (const f of fields) {
            if (existing[f.key] !== f.val) {
              updates[f.key] = f.val;
              hasChanges = true;
            }
          }

          // Email/Mobile overwrite policy
          if (!(dataset_scope === 'induction' && existing.registration_status === 'REGISTERED')) {
            if (existing.email !== parsed.email) { updates.email = parsed.email; hasChanges = true; }
            if (existing.mobile !== parsed.mobile) { updates.mobile = parsed.mobile; hasChanges = true; }
          }

          if (hasChanges) {
            updates.dataset_id = dataset_id;
            updates.last_updated_at = FieldValue.serverTimestamp();
            batch.update(parsed.ref, updates);
            updatedCount++;
            firestoreWrites++;
          } else {
            unchangedCount++;
          }
        } else {
          // New participant
          const newDoc: any = {
            dataset_id,
            dataset_scope,
            application_number: parsed.appNumber,
            student_name: parsed.studentName,
            email: parsed.email,
            mobile: parsed.mobile,
            school: parsed.school,
            course: parsed.course,
            program: parsed.program,
            admission_status: parsed.admissionStatus,
            attendance_status: 'pending',
            attendance_time: null,
            created_at: FieldValue.serverTimestamp(),
            last_updated_at: FieldValue.serverTimestamp(),
          };
          
          if (dataset_scope === 'event') {
            newDoc.scope_id = dataset.scope_id || dataset.event_id;
          } else {
            newDoc.created_from = 'induction_dataset';
            newDoc.registration_status = 'PENDING';
          }
          
          batch.set(parsed.ref, newDoc);
          insertedCount++;
          firestoreWrites++;
        }
      }

      if (firestoreWrites > 0 || conflictLogs.length > 0) {
        if (conflictLogs.length > 0) {
          for (const log of conflictLogs) {
            const logRef = db.collection('conflict_logs').doc();
            batch.set(logRef, log);
            firestoreWrites++;
          }
        }
        await batch.commit();
      }

      // Update progress counters
      const updates: any = {};
      if (insertedCount > 0) updates['statistics.rows.inserted'] = FieldValue.increment(insertedCount);
      if (updatedCount > 0) updates['statistics.rows.updated'] = FieldValue.increment(updatedCount);
      if (unchangedCount > 0) updates['statistics.rows.unchanged'] = FieldValue.increment(unchangedCount);
      if (failCount > 0) updates['statistics.rows.skipped'] = FieldValue.increment(failCount);
      if (conflictCount > 0) {
        updates['statistics.rows.conflicts'] = FieldValue.increment(conflictCount);
        updates['statistics.rows.skipped'] = FieldValue.increment(conflictCount);
      }
      if (firestoreReads > 0) updates['statistics.performance.firestore_reads'] = FieldValue.increment(firestoreReads);
      if (firestoreWrites > 0) updates['statistics.performance.firestore_writes'] = FieldValue.increment(firestoreWrites);
      
      if (typeof batch_time_ms === 'number' && batch_time_ms > 0) {
        const prevAvg = dataset.statistics?.performance?.average_batch_ms || batch_time_ms;
        updates['statistics.performance.average_batch_ms'] = Math.round((prevAvg + batch_time_ms) / 2);
      }

      await datasetRef.update(updates);

      return apiResponse(res, 200, true, 'Chunk imported successfully.', { 
        insertedCount, updatedCount, unchangedCount, failCount, conflictCount, firestoreReads, firestoreWrites 
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: FINISH
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'finish') {
      await db.runTransaction(async (tx) => {
        const parentSnap = await tx.get(parentRef);

        if (dataset_scope === 'event') {
          if (parentSnap.exists) {
            const currentLock = parentSnap.data()?.dataset_lock;
            if (currentLock && currentLock.locked_by === admin_id) {
              tx.update(parentRef, { dataset_lock: null });
            }
          }
        } else {
          if (parentSnap.exists) {
            const currentLock = parentSnap.data()?.dataset_lock;
            if (currentLock && currentLock.locked_by === admin_id) {
              tx.update(parentRef, { dataset_lock: null, updated_at: FieldValue.serverTimestamp() });
            }
          }
        }

        const statsUpdates: any = {
          status: 'READY',
          completed_at: FieldValue.serverTimestamp(),
        };
        // We'll update the duration if provided
        if (req.body.import_duration_ms) {
          statsUpdates['statistics.performance.processing_ms'] = req.body.import_duration_ms;
        }

        tx.update(datasetRef, statsUpdates);
      });

      return apiResponse(res, 200, true, 'Import finished. Lock released and status set to READY.');
    }

    return apiResponse(res, 400, false, 'Invalid action. Must be "start", "chunk", or "finish".');
  } catch (error: any) {
    console.error('[import-dataset]', error);

    if (error.message === 'import_in_progress') {
      return apiResponse(res, 409, false, 'A dataset import is already in progress. Please wait until it completes.');
    }
    if (error.message === 'event_not_found') {
      return apiResponse(res, 404, false, 'Associated event not found.');
    }

    return apiResponse(res, 500, false, 'Internal server error processing import.');
  }
}

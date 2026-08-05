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
      let failCount = 0;
      let conflictCount = 0;
      const conflictLogs: any[] = [];

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

        if (dataset_scope === 'event') {
          // ── Event: simple upsert, doc ID = {scope_id}_{APP_NUMBER} ──
          const eventId = dataset.scope_id || dataset.event_id;
          const docId = `${eventId}_${appNumber}`;
          const participantRef = db.collection(participantCollection).doc(docId);

          batch.set(participantRef, {
            dataset_id,
            dataset_scope: 'event',
            scope_id: eventId,
            application_number: appNumber,
            student_name: studentName,
            email,
            mobile,
            school,
            course,
            program,
            admission_status: admissionStatus,
            attendance_status: 'pending',
            attendance_time: null,
            created_at: FieldValue.serverTimestamp(),
            last_updated_at: FieldValue.serverTimestamp(),
          }, { merge: true });

          updatedCount++; // Using updatedCount for event batch sets
        } else {
          // ── Induction: conflict-aware upsert, doc ID = {APP_NUMBER} ────────
          // We must read first to apply the overwrite policy.
          // Note: reads inside a batch write are not possible; we use batch for
          // the writes after doing the read outside. For induction imports, we
          // accept this N-read overhead as the data integrity guarantee is worth it.
          try {
            const participantRef = db.collection(participantCollection).doc(appNumber);
            const existingSnap = await participantRef.get();

            if (existingSnap.exists) {
              const existing = existingSnap.data()!;

              if (existing.registration_status === 'REGISTERED' && existing.email && existing.email !== email) {
                // REGISTERED student with a different email → conflict: skip row
                conflictCount++;
                conflictLogs.push({
                  severity: 'HIGH',
                  reason: 'Email mismatch — student is already registered',
                  old_dataset: existing.dataset_id,
                  new_dataset: dataset_id,
                  application_number: appNumber,
                  timestamp: FieldValue.serverTimestamp(),
                  resolved: false,
                  resolved_by: null,
                  resolved_at: null,
                  resolution_note: null,
                  resolution_time: null,
                  imported_email: email,
                  stored_email: existing.email,
                  student_name: studentName,
                });
                continue;
              }

              if (existing.registration_status === 'REGISTERED') {
                // REGISTERED, same email → update non-PII fields only
                batch.update(participantRef, {
                  student_name: studentName,
                  school,
                  course,
                  program,
                  dataset_id,  // point to latest dataset
                  last_updated_at: FieldValue.serverTimestamp(),
                });
              } else {
                // PENDING → latest wins, full overwrite
                batch.set(participantRef, {
                  dataset_id,
                  dataset_scope: 'induction',
                  application_number: appNumber,
                  student_name: studentName,
                  email,
                  mobile,
                  school,
                  course,
                  program,
                  admission_status: admissionStatus,
                  attendance_status: 'pending',
                  attendance_time: null,
                  registration_status: 'PENDING',
                  created_at: existing.created_at || FieldValue.serverTimestamp(),
                  last_updated_at: FieldValue.serverTimestamp(),
                }, { merge: true });
              }
              updatedCount++;
            } else {
              // New participant
              batch.set(participantRef, {
                dataset_id,
                dataset_scope: 'induction',
                created_from: 'induction_dataset',
                application_number: appNumber,
                student_name: studentName,
                email,
                mobile,
                school,
                course,
                program,
                admission_status: admissionStatus,
                attendance_status: 'pending',
                attendance_time: null,
                registration_status: 'PENDING',
                created_at: FieldValue.serverTimestamp(),
                last_updated_at: FieldValue.serverTimestamp(),
              });
              insertedCount++;
            }
          } catch {
            failCount++;
          }
        }
      }

      await batch.commit();

      // Write conflict logs if any
      if (conflictLogs.length > 0) {
        const logBatch = db.batch();
        for (const log of conflictLogs) {
          const logRef = db.collection('conflict_logs').doc();
          logBatch.set(logRef, log);
        }
        await logBatch.commit();
      }

      // Update progress counters
      const updates: any = {};
      if (insertedCount > 0) updates['statistics.rows.inserted'] = FieldValue.increment(insertedCount);
      if (updatedCount > 0) updates['statistics.rows.updated'] = FieldValue.increment(updatedCount);
      if (failCount > 0) updates['statistics.rows.skipped'] = FieldValue.increment(failCount);
      if (conflictCount > 0) {
        updates['statistics.rows.conflicts'] = FieldValue.increment(conflictCount);
        updates['statistics.rows.skipped'] = FieldValue.increment(conflictCount);
      }
      if (typeof batch_time_ms === 'number' && batch_time_ms > 0) {
        const prevAvg = dataset.statistics?.performance?.average_batch_ms || batch_time_ms;
        updates['statistics.performance.average_batch_ms'] = Math.round((prevAvg + batch_time_ms) / 2);
      }

      await datasetRef.update(updates);

      return apiResponse(res, 200, true, 'Chunk imported successfully.', { insertedCount, updatedCount, failCount, conflictCount });
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

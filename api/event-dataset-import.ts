import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
  console.error('[event-dataset-import] Firebase Admin init error:', e.message);
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, `Firebase init error: ${firebaseInitError}`);

  try {
    const { dataset_id, action, rows, batch_time_ms } = req.body;

    if (!dataset_id || !action) {
      return apiResponse(res, 400, false, 'Missing dataset_id or action.');
    }

    const db = getFirestore();
    const datasetRef = db.collection('event_datasets').doc(dataset_id);
    const datasetDoc = await datasetRef.get();

    if (!datasetDoc.exists) {
      return apiResponse(res, 404, false, 'Dataset not found.');
    }
    
    const dataset = datasetDoc.data()!;
    const eventId = dataset.event_id;
    const eventRef = db.collection('events').doc(eventId);

    // ACTION: START
    if (action === 'start') {
      if (['READY', 'ACTIVE', 'ARCHIVED'].includes(dataset.status)) {
        return apiResponse(res, 200, true, `Dataset is already ${dataset.status}.`, { status: dataset.status });
      }

      await db.runTransaction(async (tx) => {
        const evt = await tx.get(eventRef);
        if (!evt.exists) throw new Error('Event not found');
        
        const evtData = evt.data()!;
        if (evtData.import_lock) {
          if (dataset.status !== 'IMPORTING') {
            throw new Error('A dataset import is already in progress for this event.');
          }
        }
        
        tx.update(eventRef, { import_lock: true });
        tx.update(datasetRef, { 
          status: 'IMPORTING',
          imported_rows: 0,
          failed_rows: 0
        });
      });

      return apiResponse(res, 200, true, 'Import started and lock acquired.');
    }

    // ACTION: CHUNK
    if (action === 'chunk') {
      if (!Array.isArray(rows) || rows.length === 0) {
        return apiResponse(res, 400, false, 'No rows provided in chunk.');
      }
      
      // Limit to Firestore batch max
      if (rows.length > 500) {
        return apiResponse(res, 400, false, 'Batch size exceeds Firestore limit of 500.');
      }

      const batch = db.batch();
      let validCount = 0;
      let failCount = 0;

      for (const row of rows) {
        const isBlank = Object.values(row as any).every((v) => !v || String(v).trim() === '');
        if (isBlank) continue;

        const appNumber = extractValue(row, ['applicationnumber', 'applicationno', 'enrollmentnumber', 'enrollmentno', 'appno']).toUpperCase();
        const studentName = extractValue(row, ['studentname', 'name', 'registeredname', 'fullname']);
        const email = extractValue(row, ['email', 'registeredemail', 'emailid']);
        const mobile = extractValue(row, ['mobile', 'phone', 'registeredmobile', 'contact']);
        const school = extractValue(row, ['school']);
        const course = extractValue(row, ['course', 'coursepreference']);
        const program = extractValue(row, ['program', 'programpreference', 'programme']);

        if (!appNumber || !studentName) {
          failCount++;
          continue;
        }

        const docId = `${eventId}_${appNumber}`;
        const participantRef = db.collection('event_participants').doc(docId);

        batch.set(participantRef, {
          dataset_id,
          event_id: eventId,
          application_number: appNumber,
          student_name: studentName,
          email,
          mobile,
          school,
          course,
          program,
          attendance_status: 'pending',
          attendance_time: null,
          created_at: FieldValue.serverTimestamp(),
          last_updated_at: FieldValue.serverTimestamp()
        }, { merge: true }); // Merge allows idempotency if retried

        validCount++;
      }

      await batch.commit();

      // Update progress
      const updates: any = {
        imported_rows: FieldValue.increment(validCount),
        failed_rows: FieldValue.increment(failCount)
      };

      if (typeof batch_time_ms === 'number' && batch_time_ms > 0) {
        const prevAvg = dataset.average_batch_time || batch_time_ms;
        updates.average_batch_time = Math.round((prevAvg + batch_time_ms) / 2);
      }

      await datasetRef.update(updates);

      return apiResponse(res, 200, true, 'Chunk imported successfully.', { validCount, failCount });
    }

    // ACTION: FINISH
    if (action === 'finish') {
      await db.runTransaction(async (tx) => {
        const evt = await tx.get(eventRef);
        if (evt.exists) {
          tx.update(eventRef, { import_lock: false });
        }
        
        tx.update(datasetRef, { 
          status: 'READY',
          completed_at: FieldValue.serverTimestamp(),
          import_duration: req.body.import_duration_ms || null
        });
      });

      return apiResponse(res, 200, true, 'Import finished. Lock released and status set to READY.');
    }

    return apiResponse(res, 400, false, 'Invalid action.');
  } catch (error: any) {
    console.error('[event-dataset-import]', error);
    
    if (error.message === 'A dataset import is already in progress for this event.') {
      return apiResponse(res, 409, false, error.message);
    }
    
    return apiResponse(res, 500, false, 'Internal server error processing import.');
  }
}

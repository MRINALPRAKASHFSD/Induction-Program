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
  console.error('[event-dataset-delete] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

function apiResponse(res: any, status: number, ok: boolean, message: string, data: any = null) {
  return res.status(status).json({ ok, message, data, timestamp: new Date().toISOString() });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, `Firebase init error: ${firebaseInitError}`);

  try {
    const { dataset_id, event_id, deleted_by } = req.body;

    if (!dataset_id || !event_id) {
      return apiResponse(res, 400, false, 'Missing dataset_id or event_id.');
    }

    const db = getFirestore();
    const datasetRef = db.collection('event_datasets').doc(dataset_id);
    const eventRef = db.collection('events').doc(event_id);

    // Verify dataset exists
    const datasetDoc = await datasetRef.get();
    if (!datasetDoc.exists) {
      return apiResponse(res, 404, false, 'Dataset not found.');
    }

    const dataset = datasetDoc.data()!;
    
    // Verify event exists
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      return apiResponse(res, 404, false, 'Event not found.');
    }
    const eventData = eventDoc.data()!;

    // Block deletion while upload is running
    if (dataset.status === 'IMPORTING' || eventData.import_lock) {
      return apiResponse(res, 409, false, 'Dataset is currently importing. Please wait until the upload completes.');
    }

    // Delete participants
    const participantsRef = db.collection('event_participants');
    const q = participantsRef
      .where('event_id', '==', event_id)
      .where('dataset_id', '==', dataset_id);
    
    const snapshot = await q.get();
    let participantsDeleted = 0;

    if (!snapshot.empty) {
      const batches = [];
      let currentBatch = db.batch();
      let count = 0;

      for (const docSnap of snapshot.docs) {
        currentBatch.delete(docSnap.ref);
        count++;
        participantsDeleted++;
        if (count === 500) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          count = 0;
        }
      }

      if (count > 0) {
        batches.push(currentBatch);
      }
      
      for (const batch of batches) {
        await batch.commit();
      }
    }

    // Delete dataset, clear active_dataset_id, log audit
    const activeDatasetCleared = eventData.active_dataset_id === dataset_id;
    
    await db.runTransaction(async (tx) => {
      const txEventDoc = await tx.get(eventRef);
      if (txEventDoc.exists) {
        const txEventData = txEventDoc.data()!;
        if (txEventData.active_dataset_id === dataset_id) {
          tx.update(eventRef, { active_dataset_id: FieldValue.delete() });
        }
      }
      
      tx.delete(datasetRef);

      const logRef = db.collection('admin_logs').doc();
      tx.set(logRef, {
        action: "delete_dataset",
        admin_uid: deleted_by || "unknown",
        dataset_id: dataset_id,
        event_id: event_id,
        participants_deleted: participantsDeleted,
        timestamp: FieldValue.serverTimestamp()
      });
    });

    return apiResponse(res, 200, true, 'Dataset deleted permanently.', {
      participants_deleted: participantsDeleted,
      dataset_deleted: true,
      active_dataset_cleared: activeDatasetCleared
    });
  } catch (error: any) {
    console.error('[event-dataset-delete]', error);
    return apiResponse(res, 500, false, `Internal server error during deletion: ${error.message}`);
  }
}

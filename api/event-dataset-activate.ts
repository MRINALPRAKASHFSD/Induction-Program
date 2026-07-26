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
  console.error('[event-dataset-activate] Firebase Admin init error:', e.message);
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
    const { dataset_id, activated_by } = req.body;

    if (!dataset_id) {
      return apiResponse(res, 400, false, 'Missing dataset_id.');
    }

    const db = getFirestore();
    const datasetRef = db.collection('event_datasets').doc(dataset_id);

    await db.runTransaction(async (tx) => {
      const datasetDoc = await tx.get(datasetRef);
      if (!datasetDoc.exists) {
        throw new Error('dataset_not_found');
      }

      const dataset = datasetDoc.data()!;
      if (dataset.status !== 'READY' && dataset.status !== 'ARCHIVED') {
        throw new Error('invalid_status');
      }

      const eventId = dataset.event_id;
      const eventRef = db.collection('events').doc(eventId);
      const eventDoc = await tx.get(eventRef);

      if (!eventDoc.exists) {
        throw new Error('event_not_found');
      }

      const eventData = eventDoc.data()!;
      if (eventData.archived || eventData.status === 'deleted') {
        throw new Error('event_deleted');
      }

      const oldActiveDatasetId = eventData.active_dataset_id;

      // Mark old dataset as ARCHIVED
      if (oldActiveDatasetId && oldActiveDatasetId !== dataset_id) {
        const oldDatasetRef = db.collection('event_datasets').doc(oldActiveDatasetId);
        tx.update(oldDatasetRef, {
          status: 'ARCHIVED',
          active: false,
          archived_at: FieldValue.serverTimestamp(),
          archived_by: activated_by || 'unknown'
        });
      }

      // Mark new dataset as ACTIVE
      tx.update(datasetRef, {
        status: 'ACTIVE',
        active: true,
        activated_at: FieldValue.serverTimestamp(),
        activated_by: activated_by || 'unknown'
      });

      // Update Event
      tx.update(eventRef, {
        active_dataset_id: dataset_id
      });
    });

    return apiResponse(res, 200, true, 'Dataset activated successfully.');
  } catch (error: any) {
    console.error('[event-dataset-activate]', error);
    
    if (error.message === 'dataset_not_found') return apiResponse(res, 404, false, 'Dataset not found.');
    if (error.message === 'invalid_status') return apiResponse(res, 400, false, 'Only READY or ARCHIVED datasets can be activated.');
    if (error.message === 'event_not_found') return apiResponse(res, 404, false, 'Associated event not found.');
    if (error.message === 'event_deleted') return apiResponse(res, 400, false, 'Cannot activate dataset for an archived or deleted event.');
    
    return apiResponse(res, 500, false, 'Internal server error during activation.');
  }
}

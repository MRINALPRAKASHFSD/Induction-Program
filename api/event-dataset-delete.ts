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
    const { dataset_id, deleted_by } = req.body;

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
      if (dataset.status === 'ACTIVE' || dataset.active) {
        throw new Error('cannot_delete_active');
      }

      if (dataset.status === 'DELETED') {
        return; // Idempotent
      }

      tx.update(datasetRef, {
        status: 'DELETED',
        archived_at: FieldValue.serverTimestamp(),
        archived_by: deleted_by || 'unknown'
      });
    });

    return apiResponse(res, 200, true, 'Dataset soft-deleted successfully.');
  } catch (error: any) {
    console.error('[event-dataset-delete]', error);
    
    if (error.message === 'dataset_not_found') return apiResponse(res, 404, false, 'Dataset not found.');
    if (error.message === 'cannot_delete_active') return apiResponse(res, 400, false, 'Cannot delete an active dataset. Activate another one first.');
    
    return apiResponse(res, 500, false, 'Internal server error during deletion.');
  }
}

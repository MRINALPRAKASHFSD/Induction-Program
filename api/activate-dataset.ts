import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, DocumentReference, DocumentData } from 'firebase-admin/firestore';

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
  console.error('[activate-dataset] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

function apiResponse(res: any, status: number, ok: boolean, message: string, data: any = null) {
  return res.status(status).json({ ok, message, data, timestamp: new Date().toISOString() });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, `Firebase init error: ${firebaseInitError}`);

  try {
    const { dataset_id, activated_by } = req.body;

    if (!dataset_id) {
      return apiResponse(res, 400, false, 'Missing dataset_id.');
    }

    const db = getFirestore();

    // ── Resolve dataset (check both collections) ─────────────────────────────
    let datasetRef: DocumentReference<DocumentData>;
    let dataset_scope: 'event' | 'induction';

    const eventDatasetRef = db.collection('event_datasets').doc(dataset_id);
    const eventDatasetDoc = await eventDatasetRef.get();

    if (eventDatasetDoc.exists) {
      datasetRef = eventDatasetRef;
      dataset_scope = 'event';
    } else {
      const inductionDatasetRef = db.collection('induction_datasets').doc(dataset_id);
      const inductionDatasetDoc = await inductionDatasetRef.get();
      if (!inductionDatasetDoc.exists) {
        return apiResponse(res, 404, false, 'Dataset not found.');
      }
      datasetRef = inductionDatasetRef;
      dataset_scope = 'induction';
    }

    await db.runTransaction(async (tx) => {
      const datasetDoc = await tx.get(datasetRef);
      if (!datasetDoc.exists) throw new Error('dataset_not_found');

      const dataset = datasetDoc.data()!;

      // ── Guard: only READY or ARCHIVED may be activated ─────────────────────
      if (dataset.status !== 'READY' && dataset.status !== 'ARCHIVED') {
        throw new Error('invalid_status');
      }

      if (dataset_scope === 'event') {
        // ── Orientation: activation is scoped to the event ─────────────────
        const eventRef = db.collection('events').doc(dataset.scope_id || dataset.event_id);
        const eventDoc = await tx.get(eventRef);

        if (!eventDoc.exists) throw new Error('event_not_found');
        const eventData = eventDoc.data()!;
        if (eventData.archived || eventData.status === 'deleted') throw new Error('event_deleted');

        const now = new Date();
        if (eventData.dataset_lock && eventData.dataset_lock.expires_at?.toDate() > now) {
          throw new Error('dataset_locked');
        }

        const oldActiveDatasetId = eventData.active_dataset_id;

        // Archive the previously active dataset
        if (oldActiveDatasetId && oldActiveDatasetId !== dataset_id) {
          const oldDatasetRef = db.collection('event_datasets').doc(oldActiveDatasetId);
          tx.update(oldDatasetRef, {
            status: 'ARCHIVED',
            active: false,
            archived_at: FieldValue.serverTimestamp(),
            archived_by: activated_by || 'unknown',
          });
        }

        // Activate new dataset
        tx.update(datasetRef, {
          status: 'ACTIVE',
          active: true,
          activated_at: FieldValue.serverTimestamp(),
          activated_by: activated_by || 'unknown',
        });

        // Update event pointer
        tx.update(eventRef, { active_dataset_id: dataset_id });
      } else {
        // ── Induction: activation is platform-level ────────────────────────
        const configRef = db.collection('induction_platform_config').doc('settings');
        const configSnap = await tx.get(configRef);

        const configData = configSnap.exists ? configSnap.data()! : {};
        const now = new Date();
        if (configData.dataset_lock && configData.dataset_lock.expires_at?.toDate() > now) {
          throw new Error('dataset_locked');
        }

        const oldActiveDatasetId = configData.active_dataset_id || null;

        // Archive the previously active induction dataset
        if (oldActiveDatasetId && oldActiveDatasetId !== dataset_id) {
          const oldDatasetRef = db.collection('induction_datasets').doc(oldActiveDatasetId);
          tx.update(oldDatasetRef, {
            status: 'ARCHIVED',
            active: false,
            archived_at: FieldValue.serverTimestamp(),
            archived_by: activated_by || 'unknown',
          });
        }

        // Activate new dataset
        tx.update(datasetRef, {
          status: 'ACTIVE',
          active: true,
          activated_at: FieldValue.serverTimestamp(),
          activated_by: activated_by || 'unknown',
        });

        // Update platform config pointer
        if (configSnap.exists) {
          tx.update(configRef, { active_dataset_id: dataset_id, updated_at: FieldValue.serverTimestamp() });
        } else {
          tx.set(configRef, { active_dataset_id: dataset_id, import_lock: false, updated_at: FieldValue.serverTimestamp() });
        }
      }
    });

    return apiResponse(res, 200, true, 'Dataset activated successfully.', { dataset_scope });
  } catch (error: any) {
    console.error('[activate-dataset]', error);

    if (error.message === 'dataset_not_found') return apiResponse(res, 404, false, 'Dataset not found.');
    if (error.message === 'invalid_status') return apiResponse(res, 400, false, 'Only READY or ARCHIVED datasets can be activated.');
    if (error.message === 'event_not_found') return apiResponse(res, 404, false, 'Associated event not found.');
    if (error.message === 'event_deleted') return apiResponse(res, 400, false, 'Cannot activate dataset for an archived or deleted event.');
    if (error.message === 'dataset_locked') return apiResponse(res, 409, false, 'Another operation is currently locking datasets for this module. Please try again later.');

    return apiResponse(res, 500, false, 'Internal server error during activation.');
  }
}

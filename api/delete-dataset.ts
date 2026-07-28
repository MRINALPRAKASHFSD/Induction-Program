import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

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
  console.error('[delete-dataset] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

function apiResponse(res: any, status: number, ok: boolean, message: string, data: any = null) {
  return res.status(status).json({ ok, message, data, timestamp: new Date().toISOString() });
}

const PARTICIPANT_BATCH_SIZE = 250;

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, `Firebase init error: ${firebaseInitError}`);

  try {
    const { dataset_id, deleted_by, purge_reason } = req.body;
    const admin_id = deleted_by || 'system';
    const reason = purge_reason || 'Admin Action';

    if (!dataset_id) {
      return apiResponse(res, 400, false, 'Missing dataset_id.');
    }

    const db = getFirestore();
    const startTime = Date.now();

    // ── Resolve dataset ──────────────────────────────────────────────────────
    let datasetRef: any;
    let dataset: any;
    let dataset_scope: 'event' | 'induction';
    let participantCollection: string;

    const eventDatasetRef = db.collection('event_datasets').doc(dataset_id);
    const eventDatasetDoc = await eventDatasetRef.get();

    if (eventDatasetDoc.exists) {
      datasetRef = eventDatasetRef;
      dataset = eventDatasetDoc.data()!;
      dataset_scope = 'event';
      participantCollection = 'event_participants';
    } else {
      const inductionDatasetRef = db.collection('induction_datasets').doc(dataset_id);
      const inductionDatasetDoc = await inductionDatasetRef.get();
      if (!inductionDatasetDoc.exists) {
        return apiResponse(res, 404, false, 'Dataset not found.');
      }
      datasetRef = inductionDatasetRef;
      dataset = inductionDatasetDoc.data()!;
      dataset_scope = 'induction';
      participantCollection = 'induction_participants';
    }



    // ── Acquire Lock ─────────────────────────────────────────────────────────
    let parentRef: any;
    if (dataset_scope === 'event') {
      parentRef = db.collection('events').doc(dataset.scope_id || dataset.event_id);
    } else {
      parentRef = db.collection('induction_platform_config').doc('settings');
    }

    await db.runTransaction(async (tx) => {
      const parentSnap = await tx.get(parentRef);
      const now = new Date();
      const expires_at = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins lock for deletion

      const lockObj = {
        dataset_id,
        locked_by: admin_id,
        locked_at: FieldValue.serverTimestamp(),
        expires_at: Timestamp.fromDate(expires_at),
        operation: 'PURGE'
      };

      if (dataset_scope === 'event') {
        if (!parentSnap.exists) throw new Error('event_not_found');
        const evtData = parentSnap.data()!;
        if (evtData.dataset_lock && evtData.dataset_lock.expires_at?.toDate() > now && evtData.dataset_lock.locked_by !== admin_id) {
          throw new Error('dataset_locked');
        }
        tx.update(parentRef, { dataset_lock: lockObj });
      } else {
        const configData = parentSnap.exists ? parentSnap.data()! : {};
        if (configData.dataset_lock && configData.dataset_lock.expires_at?.toDate() > now && configData.dataset_lock.locked_by !== admin_id) {
          throw new Error('dataset_locked');
        }
        if (parentSnap.exists) {
          tx.update(parentRef, { dataset_lock: lockObj });
        } else {
          tx.set(parentRef, { dataset_lock: lockObj, active_dataset_id: null, updated_at: FieldValue.serverTimestamp() });
        }
      }
    });

    // ── Process Participants in Batches ──────────────────────────────────────
    let preserved_count = 0;
    let removed_count = 0;
    let keepProcessing = true;
    let lastDoc: any = null;

    while (keepProcessing) {
      let query = db.collection(participantCollection)
        .where('dataset_id', '==', dataset_id)
        .limit(PARTICIPANT_BATCH_SIZE);
        
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const querySnap = await query.get();

      if (querySnap.empty) {
        keepProcessing = false;
        break;
      }

      lastDoc = querySnap.docs[querySnap.docs.length - 1];
      const batch = db.batch();
      
      for (const doc of querySnap.docs) {
        const pData = doc.data();

        if (dataset_scope === 'induction' && pData.registration_status === 'REGISTERED') {
          // Preserve registered induction participants
          batch.update(doc.ref, {
            source_dataset_status: 'ARCHIVED',
            dataset_version: dataset.parser_version || 'v1',
            last_updated_at: FieldValue.serverTimestamp()
          });
          preserved_count++;
        } else {
          // Remove pending/event participants
          batch.delete(doc.ref);
          removed_count++;
        }
      }

      await batch.commit();
    }

    // ── Finalize Dataset ─────────────────────────────────────────────────────
    const purgeDuration = Date.now() - startTime;
    await datasetRef.update({
      status: 'ARCHIVED',
      active: false,
      purged_at: FieldValue.serverTimestamp(),
      purged_by: admin_id,
      purge_reason: reason,
      purge_duration_ms: purgeDuration,
      preserved_count,
      removed_count,
    });

    // Clear active dataset pointer if necessary
    if (dataset_scope === 'induction') {
      const configSnap = await parentRef.get();
      if (configSnap.exists && configSnap.data()!.active_dataset_id === dataset_id) {
        await parentRef.update({ active_dataset_id: null, updated_at: FieldValue.serverTimestamp() });
      }
    } else {
      const eventSnap = await parentRef.get();
      if (eventSnap.exists && eventSnap.data()!.active_dataset_id === dataset_id) {
        await parentRef.update({ active_dataset_id: null });
      }
    }

    // ── Release Lock ─────────────────────────────────────────────────────────
    await db.runTransaction(async (tx) => {
      const parentSnap = await tx.get(parentRef);
      if (parentSnap.exists) {
        const currentLock = parentSnap.data()?.dataset_lock;
        if (currentLock && currentLock.locked_by === admin_id) {
          if (dataset_scope === 'event') {
            tx.update(parentRef, { dataset_lock: null });
          } else {
            tx.update(parentRef, { dataset_lock: null, updated_at: FieldValue.serverTimestamp() });
          }
        }
      }
    });

    // ── Single Audit Log ─────────────────────────────────────────────────────
    await db.collection('admin_logs').add({
      action: 'purge_dataset',
      dataset_id,
      dataset_scope,
      dataset_name: dataset.dataset_name || dataset.filename,
      purged_by: admin_id,
      purged_at: FieldValue.serverTimestamp(),
      purge_duration_ms: purgeDuration,
      preserved_count,
      removed_count,
      message: `Dataset Purged. ${removed_count} records removed. ${preserved_count} preserved.`,
      reason
    });

    // ── Structured Response ──────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      dataset_id,
      dataset_status: 'ARCHIVED',
      preserved_count,
      removed_count,
      active_pointer_cleared: true,
      message: 'Dataset purged successfully.'
    });

  } catch (error: any) {
    console.error('[delete-dataset]', error);
    if (error.message === 'dataset_locked') {
      return apiResponse(res, 409, false, 'Another operation is currently locking this dataset. Please try again later.');
    }
    if (error.message === 'event_not_found') {
      return apiResponse(res, 404, false, 'Associated event not found.');
    }
    return apiResponse(res, 500, false, 'Internal server error during deletion.');
  }
}

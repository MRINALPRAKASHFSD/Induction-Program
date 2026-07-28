import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import * as XLSX from 'xlsx';

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
  console.error('[upload-dataset] Firebase Admin init error:', e.message);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiResponse(res, 405, false, 'Method Not Allowed');
  if (!firebaseInitialized) return apiResponse(res, 500, false, `Firebase init error: ${firebaseInitError}`);

  try {
    const {
      dataset_scope,
      scope_id,
      schema_version = '1.0',
      uploaded_source = 'CSV',
      dataset_origin = { system: 'Manual', source: 'Manual Upload', batch: 'unknown', uploaded_by: 'Admin', academic_session: new Date().getFullYear().toString() + '-' + (new Date().getFullYear() + 1).toString().slice(-2) },
      parent_dataset_id = null,
      derived_from_checksum = null,
      filename,
      file_size,
      mime_type,
      storage_path,
      download_url,
      file_base64,
      uploaded_by,
      created_by_name,
    } = req.body;

    // ── Validate dataset_scope ───────────────────────────────────────────────
    if (!dataset_scope || !['event', 'induction'].includes(dataset_scope)) {
      return apiResponse(res, 400, false, 'Invalid or missing dataset_scope. Must be "event" or "induction".');
    }
    if (!filename) {
      return apiResponse(res, 400, false, 'Missing required field: filename.');
    }
    if (!file_base64 && !download_url) {
      return apiResponse(res, 400, false, 'Missing file content (file_base64 or download_url required).');
    }
    if (dataset_scope === 'event' && !scope_id) {
      return apiResponse(res, 400, false, 'scope_id is required for event datasets.');
    }
    const validSources = ['ERP', 'CRM', 'CSV', 'XLSX', 'MANUAL', 'API'];
    if (!validSources.includes(uploaded_source)) {
      return apiResponse(res, 400, false, 'Invalid uploaded_source.');
    }

    const db = getFirestore();
    const datasetCollection = dataset_scope === 'event' ? 'event_datasets' : 'induction_datasets';
    const oppositeCollection = dataset_scope === 'event' ? 'induction_datasets' : 'event_datasets';

    // ── Validate the parent event for event datasets ─────────────────────────
    if (dataset_scope === 'event') {
      const eventRef = db.collection('events').doc(scope_id);
      const eventDoc = await eventRef.get();
      if (!eventDoc.exists) {
        return apiResponse(res, 404, false, 'Event not found.');
      }
      const eventData = eventDoc.data()!;
      if (eventData.archived || eventData.status === 'deleted') {
        return apiResponse(res, 400, false, 'Cannot upload dataset to an archived or deleted event.');
      }
    }

    // ── 1. Get file buffer (prefer base64, fallback to download_url) ─────────
    let buffer: Buffer;
    if (file_base64) {
      try {
        buffer = Buffer.from(file_base64, 'base64');
      } catch {
        return apiResponse(res, 400, false, 'Invalid base64 file content.');
      }
    } else {
      const fileRes = await fetch(download_url);
      if (!fileRes.ok) {
        return apiResponse(res, 500, false, `Failed to download file: HTTP ${fileRes.status}.`);
      }
      const arrayBuffer = await fileRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    if (buffer.length === 0) {
      return apiResponse(res, 400, false, 'File content is empty.');
    }

    // ── 2. Compute checksum ──────────────────────────────────────────────────
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // ── 3. Same-module duplicate check ───────────────────────────────────────
    let dupeSnap: any;
    if (dataset_scope === 'event') {
      dupeSnap = await db.collection(datasetCollection)
        .where('scope_id', '==', scope_id)
        .where('checksum', '==', checksum)
        .get();
    } else {
      dupeSnap = await db.collection(datasetCollection)
        .where('checksum', '==', checksum)
        .get();
    }
    const nonDeleted = dupeSnap.docs.filter((d: any) => d.data().status !== 'DELETED');
    if (nonDeleted.length > 0) {
      return apiResponse(res, 409, false,
        'This exact file has already been uploaded for this module (checksum match). Upload a different file or delete the existing dataset first.');
    }

    // ── 4. Cross-module informational check (source_checksum) ─────────────
    let cross_module_warning: any = null;
    try {
      const crossSnap = await db.collection(oppositeCollection)
        .where('source_checksum', '==', checksum)
        .get();
      const crossMatches = crossSnap.docs.filter((d: any) => d.data().status !== 'DELETED');
      if (crossMatches.length > 0) {
        const cm = crossMatches[0].data();
        const oppositeLabel = dataset_scope === 'event' ? 'Induction' : 'Event';
        cross_module_warning = {
          module: oppositeLabel,
          used_at: cm.uploaded_at,
          dataset_name: cm.dataset_name,
        };
      }
    } catch {
      // Cross-module check is informational — never block upload on its failure
    }

    // ── 5. Parse with XLSX ──────────────────────────────────────────────────
    let workbook: any;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      return apiResponse(res, 400, false, 'Failed to parse file. Ensure it is a valid CSV or Excel file.');
    }

    const sheetName = workbook.SheetNames[0];
    const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    // ── 6. Validate & count rows ────────────────────────────────────────────
    let total_rows = rawRows.length;
    let valid_rows = 0;
    let invalid_rows = 0;
    let duplicate_rows = 0;
    let blank_rows = 0;

    const seenAppNumbers = new Set<string>();

    for (const row of rawRows) {
      const isBlank = Object.values(row as any).every((v) => !v || String(v).trim() === '');
      if (isBlank) { blank_rows++; continue; }

      const appNumber = extractValue(row, ['applicationnumber', 'applicationno', 'enrollmentnumber', 'enrollmentno', 'appno', 'krmuappno', 'krmuid']);
      const studentName = extractValue(row, ['studentname', 'name', 'registeredname', 'fullname', 'candidatename']);

      if (!appNumber || !studentName) { invalid_rows++; continue; }

      if (seenAppNumbers.has(appNumber.toUpperCase())) { duplicate_rows++; continue; }

      seenAppNumbers.add(appNumber.toUpperCase());
      valid_rows++;
    }

    if (valid_rows === 0) {
      return apiResponse(res, 400, false,
        'No valid rows found. Ensure the file contains "Application Number" and "Name" columns.');
    }

    // Compute header hash from the first row
    const firstRowHeaders = Object.keys(rawRows[0] || {}).sort().join('|');
    const header_hash = crypto.createHash('sha256').update(firstRowHeaders).digest('hex');
    const schema_hash = crypto.createHash('sha256').update(String(schema_version)).digest('hex');

    const dataset_fingerprint = {
      checksum,
      header_hash,
      schema_hash,
      record_count: total_rows
    };

    // ── 7. Determine next version number ────────────────────────────────────
    let versionsSnap: any;
    if (dataset_scope === 'event') {
      versionsSnap = await db.collection(datasetCollection).where('scope_id', '==', scope_id).get();
    } else {
      versionsSnap = await db.collection(datasetCollection).get();
    }
    let nextVersion = 1;
    if (!versionsSnap.empty) {
      const maxVersion = Math.max(...versionsSnap.docs.map((d: any) => d.data().version || 0));
      nextVersion = maxVersion + 1;
    }

    // ── 8. Write PREVIEW dataset document ───────────────────────────────────
    const datasetRef = db.collection(datasetCollection).doc();

    const datasetData: Record<string, any> = {
      id:               datasetRef.id,
      version:          nextVersion,
      dataset_name:     `Dataset v${nextVersion} - ${filename}`,
      dataset_scope,                         
      schema_version,
      parser_version: '1.0.0',
      uploaded_source,
      dataset_origin,
      parent_dataset_id,
      derived_from_checksum: derived_from_checksum || checksum,
      filename,
      file_size:        file_size || buffer.length,
      mime_type:        mime_type || 'application/octet-stream',
      storage_path:     storage_path || '',
      download_url:     download_url || '',
      status:           'PREVIEW',
      statistics: {
        rows: {
          total: total_rows,
          valid: valid_rows,
          invalid: invalid_rows,
          inserted: 0,
          updated: 0,
          skipped: 0,
          conflicts: 0
        },
        performance: {
          processing_ms: 0,
          average_batch_ms: 0
        }
      },
      checksum,
      dataset_fingerprint,
      source_checksum:  checksum,
      uploaded_by:      uploaded_by || 'unknown',
      created_by_name:  created_by_name || 'Admin',
      uploaded_at:      FieldValue.serverTimestamp(),
      completed_at:     null,
      activated_at:     null,
      activated_by:     null,
      archived_at:      null,
      archived_by:      null,
      active:           false,
    };

    if (dataset_scope === 'event') {
      datasetData.scope_id = scope_id;
    }

    await datasetRef.set(datasetData);

    return apiResponse(res, 200, true, 'Dataset uploaded and validated successfully.', {
      ...datasetData,
      cross_module_warning,
    });
  } catch (error: any) {
    console.error('[upload-dataset] UNHANDLED ERROR:', error.message, error.stack);
    return apiResponse(res, 500, false, `Internal server error: ${error.message}`);
  }
}

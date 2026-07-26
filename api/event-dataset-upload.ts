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
  console.error('[event-dataset-upload] Firebase Admin init error:', e.message);
  firebaseInitError = e.message;
}

function apiResponse(res: any, status: number, ok: boolean, message: string, data: any = null) {
  return res.status(status).json({ ok, message, data, timestamp: new Date().toISOString() });
}

// Normalize column headers to handle variations
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
      event_id,
      filename,
      file_size,
      mime_type,
      storage_path,
      download_url,
      file_base64,   // NEW: raw file bytes as base64
      uploaded_by,
      created_by_name
    } = req.body;

    if (!event_id || !filename) {
      return apiResponse(res, 400, false, 'Missing required fields (event_id, filename).');
    }

    if (!file_base64 && !download_url) {
      return apiResponse(res, 400, false, 'Missing file content (file_base64 or download_url required).');
    }

    const db = getFirestore();
    const eventRef = db.collection('events').doc(event_id);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      return apiResponse(res, 404, false, 'Event not found.');
    }
    const eventData = eventDoc.data()!;
    if (eventData.archived || eventData.status === 'deleted') {
      return apiResponse(res, 400, false, 'Cannot upload dataset to an archived or deleted event.');
    }

    // 1. Get file buffer — prefer base64 sent directly, fallback to download_url
    let buffer: Buffer;

    if (file_base64) {
      // Primary path: base64 encoded file sent directly in the request body
      try {
        buffer = Buffer.from(file_base64, 'base64');
      } catch (e: any) {
        return apiResponse(res, 400, false, 'Invalid base64 file content.');
      }
    } else {
      // Fallback path: download from URL
      console.log('[event-dataset-upload] Falling back to download_url');
      const fileRes = await fetch(download_url);
      if (!fileRes.ok) {
        return apiResponse(res, 500, false, `Failed to download file from storage: HTTP ${fileRes.status}. Use file_base64 instead.`);
      }
      const arrayBuffer = await fileRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    if (buffer.length === 0) {
      return apiResponse(res, 400, false, 'File content is empty.');
    }

    // 2. Compute checksum and verify duplicates
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check for duplicate (same file already uploaded for this event)
    const existingQuery = await db.collection('event_datasets')
      .where('event_id', '==', event_id)
      .where('checksum', '==', checksum)
      .get();

    const nonDeleted = existingQuery.docs.filter(d => d.data().status !== 'DELETED');
    if (nonDeleted.length > 0) {
      return apiResponse(res, 409, false, 'Exact same file has already been uploaded for this event (checksum match).');
    }

    // 3. Parse with XLSX
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (e: any) {
      return apiResponse(res, 400, false, 'Failed to parse file. Ensure it is a valid CSV or Excel file.');
    }

    const sheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    // 4. Validate & Normalize
    let total_rows = rawRows.length;
    let valid_rows = 0;
    let invalid_rows = 0;
    let duplicate_rows = 0;
    let blank_rows = 0;

    const seenAppNumbers = new Set<string>();

    for (const row of rawRows) {
      const isBlank = Object.values(row as any).every((v) => !v || String(v).trim() === '');
      if (isBlank) {
        blank_rows++;
        continue;
      }

      const appNumber = extractValue(row, ['applicationnumber', 'applicationno', 'enrollmentnumber', 'enrollmentno', 'appno']);
      const studentName = extractValue(row, ['studentname', 'name', 'registeredname', 'fullname']);

      if (!appNumber || !studentName) {
        invalid_rows++;
        continue;
      }

      if (seenAppNumbers.has(appNumber.toUpperCase())) {
        duplicate_rows++;
        continue;
      }

      seenAppNumbers.add(appNumber.toUpperCase());
      valid_rows++;
    }

    if (valid_rows === 0) {
      return apiResponse(res, 400, false, 'No valid rows found. Ensure the file contains "Application Number" and "Name" columns.');
    }

    // 5. Get next version number — no orderBy to avoid composite index dependency
    const versionsQuery = await db.collection('event_datasets')
      .where('event_id', '==', event_id)
      .get();

    let nextVersion = 1;
    if (!versionsQuery.empty) {
      const maxVersion = Math.max(...versionsQuery.docs.map(d => d.data().version || 0));
      nextVersion = maxVersion + 1;
    }

    // 6. Create event_datasets document (PREVIEW state)
    const datasetRef = db.collection('event_datasets').doc();

    const datasetData = {
      id: datasetRef.id,
      event_id,
      version: nextVersion,
      dataset_name: `Dataset v${nextVersion} - ${filename}`,
      filename,
      file_size: file_size || buffer.length,
      mime_type: mime_type || 'application/octet-stream',
      storage_path: storage_path || '',
      download_url: download_url || '',
      status: 'PREVIEW',
      total_rows,
      valid_rows,
      invalid_rows,
      duplicate_rows,
      blank_rows,
      imported_rows: 0,
      failed_rows: 0,
      checksum,
      uploaded_by: uploaded_by || 'unknown',
      created_by_name: created_by_name || 'Admin',
      uploaded_at: FieldValue.serverTimestamp(),
      completed_at: null,
      import_duration: null,
      average_batch_time: null,
      activated_at: null,
      activated_by: null,
      archived_at: null,
      archived_by: null,
      active: false
    };

    await datasetRef.set(datasetData);

    return apiResponse(res, 200, true, 'Dataset uploaded and validated successfully.', datasetData);
  } catch (error: any) {
    console.error('[event-dataset-upload] UNHANDLED ERROR:', error.message, error.stack);
    return apiResponse(res, 500, false, `Internal server error: ${error.message}`);
  }
}

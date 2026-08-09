/**
 * POST /api/event-planner-upload?type=orientation
 *
 * Admin-only. Accepts .xlsx or .csv schedule upload, parses it, saves as DRAFT.
 * Supports: orientation | workshop | hackathon | bootcamp | convocation
 *
 * Auth: Firebase Bearer token (admin)
 * Body: multipart/form-data — field "planner" — .xlsx or .csv file
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';
import { parseEventPlannerBuffer } from '../server/event-planner-parser.js';
import { saveEventDraft, ALLOWED_PLANNER_TYPES, type EventPlannerType } from '../server/event-planner-engine.js';
import crypto from 'crypto';

try {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }
} catch (e) { console.error('[event-planner-upload] Firebase init error:', e); }

async function validateAdmin(req: any): Promise<{ uid: string; name: string } | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return decoded.uid ? { uid: decoded.uid, name: decoded.name || decoded.email || decoded.uid } : null;
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const admin = await validateAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  // Validate plannerType
  const plannerType = (req.query?.type || req.query?.plannerType || '') as string;
  if (!ALLOWED_PLANNER_TYPES.includes(plannerType as EventPlannerType)) {
    return res.status(400).json({
      ok: false,
      error: `Missing or invalid ?type param. Allowed: ${ALLOWED_PLANNER_TYPES.join(', ')}`,
    });
  }

  const ip = ((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown') as string)
    .split(',')[0].trim();
  const ipHash    = crypto.createHash('sha256').update(ip).digest('hex');
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    // ── Read multipart body (identical pattern to planner-upload.ts) ──────────
    let fileBuffer: Buffer | null = null;
    let filename = 'schedule.xlsx';

    let rawBuffer: Buffer | null = null;

    if (Buffer.isBuffer(req.body)) {
      rawBuffer = req.body;
    } else if (req.body?.file) {
      const f = req.body.file;
      fileBuffer = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
      filename   = f.name || filename;
    } else {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end',  resolve);
        req.on('error', reject);
      });
      rawBuffer = Buffer.concat(chunks);
    }

    if (rawBuffer) {
      const ctRaw = req.headers['content-type'] || req.headers['Content-Type'] || '';
      const contentType = Array.isArray(ctRaw) ? ctRaw[0] : String(ctRaw);
      if (contentType.toLowerCase().includes('multipart')) {
        const extracted = extractFileFromMultipart(rawBuffer, contentType, filename);
        fileBuffer = extracted.file;
        filename   = extracted.filename;
      } else {
        fileBuffer = rawBuffer;
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ ok: false, error: 'No file received. Send a .xlsx or .csv file.' });
    }

    const lowerName = filename.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
      return res.status(400).json({ ok: false, error: 'Only .xlsx and .csv files are accepted.' });
    }

    // ── Parse ─────────────────────────────────────────────────────────────────
    const parseStart = Date.now();
    const parseResult = parseEventPlannerBuffer(fileBuffer, filename);
    const parseDurationMs = Date.now() - parseStart;

    // ── Save DRAFT ────────────────────────────────────────────────────────────
    const db = getFirestore();
    const uploadedAt = new Date().toISOString();

    const plannerId = await saveEventDraft(
      db, parseResult, plannerType as EventPlannerType,
      admin.uid, admin.name, uploadedAt, ipHash, userAgent,
    );

    return res.status(200).json({
      ok: true,
      plannerId,
      plannerType,
      status: 'DRAFT',
      parseDurationMs,
      filename,
      fileChecksum:       parseResult.fileChecksum,
      sessionCount:       parseResult.sessionCount,
      dayCount:           parseResult.dayCount,
      dateRange:          parseResult.dateRange,
      plannerYear:        parseResult.plannerYear,
      validationErrors:   parseResult.validationErrors,
      validationWarnings: parseResult.validationWarnings,
      hasBlockingErrors:  parseResult.validationErrors.length > 0,
      preview: {
        sessions: parseResult.sessions.slice(0, 50),
        days:     parseResult.days,
      },
    });

  } catch (err: any) {
    console.error('[event-planner-upload]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

// ── Multipart extractor (verbatim pattern from planner-upload.ts) ─────────────
function extractFileFromMultipart(
  raw: Buffer,
  contentType: string,
  defaultFilename = 'schedule.xlsx',
): { file: Buffer; filename: string } {
  let filename = defaultFilename;
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!boundaryMatch) return { file: raw, filename };
  const boundary = (boundaryMatch[1] || boundaryMatch[2]).trim();
  if (!boundary) return { file: raw, filename };

  const boundaryBuf = Buffer.from('--' + boundary);
  const start = raw.indexOf(boundaryBuf);
  if (start === -1) return { file: raw, filename };

  let headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'), start);
  let headerLen = 4;
  if (headerEnd === -1) { headerEnd = raw.indexOf(Buffer.from('\n\n'), start); headerLen = 2; }
  if (headerEnd === -1) return { file: raw, filename };

  const headerText = raw.toString('utf8', start, headerEnd);
  const fnMatch = headerText.match(/filename=(?:"([^"]+)"|([^\s;]+))/i);
  if (fnMatch) filename = (fnMatch[1] || fnMatch[2]).trim();

  const dataStart = headerEnd + headerLen;
  let dataEnd = raw.indexOf(Buffer.from('\r\n--' + boundary), dataStart);
  if (dataEnd === -1) dataEnd = raw.indexOf(Buffer.from('\n--' + boundary), dataStart);
  if (dataEnd === -1) dataEnd = raw.length;

  return { file: raw.slice(dataStart, dataEnd), filename };
}

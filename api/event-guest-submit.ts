/**
 * POST /api/event-guest-submit
 *
 * Student-facing (authenticated). Upsert guest headcount for an event.
 * Fully idempotent: second submit updates doc instead of creating duplicate.
 *
 * Doc key: {event_id}_{student_id}   (event-first for easy grouping queries)
 *
 * Body:
 *   event_id         — event document ID (orientation-2026, etc.)
 *   student_id       — enrollment_no
 *   application_number
 *   orientation_id   — plannerId (FK to planners collection)
 *   attendance_record_id — "{sessionId}_{enrollmentNo}" from attendance-mark response
 *   headcount        — 0–99 (0 = came alone)
 *   relationships    — string[] of ENUM values ([] if skipped)
 *   device_timestamp — ISO string
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';

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
} catch (e) { console.error('[event-guest-submit] Firebase init error:', e); }

const VALID_RELATIONSHIPS = ['PARENT', 'SIBLING', 'GUARDIAN', 'RELATIVE', 'FRIEND', 'OTHER'] as const;

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  // Auth
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  let decodedUid: string;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    decodedUid = decoded.uid;
  } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }

  const {
    event_id,
    student_id,
    application_number,
    orientation_id,
    attendance_record_id,
    headcount,
    relationships,
    device_timestamp,
    department_id,
    programme,
    school,
  } = req.body ?? {};

  // Validate required fields
  if (!event_id || typeof event_id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing event_id' });
  }
  if (!student_id || typeof student_id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing student_id' });
  }
  const hc = parseInt(String(headcount ?? '0'), 10);
  if (isNaN(hc) || hc < 0 || hc > 99) {
    return res.status(400).json({ ok: false, error: 'headcount must be 0–99' });
  }

  // Validate relationships (optional — empty array is valid)
  const rels: string[] = Array.isArray(relationships) ? relationships : [];
  const invalidRels = rels.filter(r => !VALID_RELATIONSHIPS.includes(r as any));
  if (invalidRels.length > 0) {
    return res.status(400).json({
      ok: false,
      error: `Invalid relationship values: ${invalidRels.join(', ')}. Allowed: ${VALID_RELATIONSHIPS.join(', ')}`,
    });
  }

  try {
    const db = getFirestore();
    // Event-first key ensures queries by event_id can use collection scans efficiently
    const docId = `${event_id}_${student_id}`;
    const docRef = db.collection('event_guest_counts').doc(docId);
    const existing = await docRef.get();
    const now = new Date().toISOString();

    if (existing.exists) {
      // Update only mutable fields; preserve submitted_at from first write
      await docRef.set({
        headcount:            hc,
        relationships:        rels,
        last_updated_at:      now,
        device_timestamp:     device_timestamp || now,
        attendance_record_id: attendance_record_id || existing.data()?.attendance_record_id || null,
      }, { merge: true });
    } else {
      await docRef.set({
        event_id,
        student_id,
        application_number:   application_number || null,
        orientation_id:       orientation_id     || null,
        attendance_record_id: attendance_record_id || null,
        submitted_by:         decodedUid,
        headcount:            hc,
        relationships:        rels,
        submitted_at:         now,
        last_updated_at:      now,
        device_timestamp:     device_timestamp || now,
        // Analytics grouping fields (denormalized)
        department_id:  department_id  || null,
        programme:      programme      || null,
        school:         school         || null,
      });
    }

    return res.status(200).json({
      ok: true,
      docId,
      isUpdate: existing.exists,
      headcount: hc,
      relationships: rels,
      message: existing.exists ? 'Guest details updated.' : 'Guest details saved.',
    });

  } catch (err: any) {
    console.error('[event-guest-submit]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

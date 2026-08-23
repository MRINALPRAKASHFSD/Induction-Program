/**
 * GET /api/student-full-schedule
 *
 * Returns the complete precomputed induction schedule for the authenticated student.
 * Reads ONLY from induction_student_schedule — no fuzzy matching, no runtime inference.
 *
 * Response:
 * {
 *   ok: true,
 *   plannerId: "planner_2026_v29",
 *   roomNumber: "D119",
 *   days: [
 *     {
 *       date: "2026-08-24",
 *       dayNumber: 1,
 *       sessions: [
 *         { startTime, endTime, sessionName, venue, sessionType, date, day }
 *       ]
 *     }
 *   ]
 * }
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
} catch (e) {
  console.error('[student-full-schedule] Firebase init error:', e);
}

const PLANNER_ID      = 'planner_2026_v29';
const INDUCTION_START = '2026-08-24';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const token = extractBearerToken(req.headers.authorization);
  if (!token)  return res.status(401).json({ ok: false, error: 'Unauthorized' });

  let studentUid: string;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    studentUid = decoded.uid;
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }

  try {
    const db = getFirestore();

    // ── Step 1: Verify active planner ────────────────────────────────────────
    const plannerSnap = await db
      .collection('induction_planners')
      .where('status', 'in', ['PUBLISHED', 'ROLLED_BACK'])
      .limit(1)
      .get();

    if (plannerSnap.empty) {
      return res.status(200).json({
        ok:            true,
        plannerActive: false,
        days:          [],
        message:       'Induction planner not published yet.',
      });
    }

    const plannerId = plannerSnap.docs[0].data().plannerId || PLANNER_ID;

    // ── Step 2: Resolve student ID from auth UID ──────────────────────────────
    const uidsToTry = [studentUid];
    if (studentUid.startsWith('email:')) {
      uidsToTry.push(studentUid.replace('email:', ''));
    } else {
      uidsToTry.push(`email:${studentUid}`);
    }

    const studentSnap = await db
      .collection('students')
      .where('auth_uid', 'in', uidsToTry)
      .limit(1)
      .get();

    if (studentSnap.empty) {
      return res.status(200).json({
        ok:            true,
        plannerActive: true,
        plannerId,
        days:          [],
        roomNumber:    null,
        message:       'Student record not found.',
      });
    }

    const studentId = studentSnap.docs[0].id;

    // ── Step 3: Fetch precomputed schedule (single doc) ───────────────────────
    const scheduleDoc = await db
      .collection('induction_student_schedule')
      .doc(`${plannerId}_${studentId}`)
      .get();

    if (!scheduleDoc.exists) {
      // Fallback: query by studentId field (in case doc ID format differs)
      const scheduleQuery = await db
        .collection('induction_student_schedule')
        .where('studentId', '==', studentId)
        .where('plannerId', '==', plannerId)
        .limit(1)
        .get();

      if (!scheduleQuery.empty) {
        const data = scheduleQuery.docs[0].data();
        // Filter days to start from INDUCTION_START
        const days = (data.days || []).filter((d: any) => d.date >= INDUCTION_START);
        return res.status(200).json({
          ok:            true,
          plannerActive: true,
          plannerId,
          roomNumber:    data.roomNumber || null,
          days,
        });
      }

      return res.status(200).json({
        ok:            true,
        plannerActive: true,
        plannerId,
        roomNumber:    null,
        days:          [],
        message:       'Schedule not yet generated. Please contact administration.',
      });
    }

    const data = scheduleDoc.data()!;
    // Filter: only return days from INDUCTION_START onwards
    const days = (data.days || []).filter((d: any) => d.date >= INDUCTION_START);

    return res.status(200).json({
      ok:            true,
      plannerActive: true,
      plannerId,
      roomNumber:    data.roomNumber || null,
      days,
    });

  } catch (err: any) {
    console.error('[student-full-schedule]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

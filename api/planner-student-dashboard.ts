/**
 * GET /api/planner-student-dashboard
 *
 * Authenticated student endpoint.
 * Returns ONLY precomputed data from:
 *   - induction_student_room_allocations  (room)
 *   - induction_student_schedule          (sessions by date)
 *   - induction_planners                  (active planner metadata)
 *
 * NO fuzzy matching. NO runtime inference. NO token matching.
 * All data was precomputed by generate-final-room-allocation.ts migration.
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
  console.error('[planner-student-dashboard] Firebase init error:', e);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function nowIST(): { date: string; timeMinutes: number; isoNow: string } {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year  = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  const day   = String(ist.getDate()).padStart(2, '0');
  return {
    date:        `${year}-${month}-${day}`,
    timeMinutes: ist.getHours() * 60 + ist.getMinutes(),
    isoNow:      now.toISOString(),
  };
}

function timeToMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── Handler ───────────────────────────────────────────────────────────────────
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

    // ── Step 1: Get active planner ─────────────────────────────────────────
    const activePlannerSnap = await db
      .collection('induction_planners')
      .where('status', 'in', ['PUBLISHED', 'ROLLED_BACK'])
      .limit(1)
      .get();

    if (activePlannerSnap.empty) {
      return res.status(200).json({
        ok:           true,
        plannerActive: false,
        message:      'Induction planner has not been published yet.',
      });
    }

    const activePlanner = activePlannerSnap.docs[0].data();
    const plannerId     = activePlanner.plannerId;
    const { date: today, timeMinutes, isoNow } = nowIST();

    // ── Step 2: Look up student ────────────────────────────────────────────
    // Auth UID can have 'email:' prefix from registration quirk — try both
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
      // Return planner-active but no student data yet
      return res.status(200).json({
        ok:            true,
        plannerActive: true,
        plannerId,
        plannerYear:   activePlanner.plannerYear,
        generatedAt:   isoNow,
        roomStatus:    'NOT_ALLOCATED',
        message:       'Student record not found. Please contact administration.',
        room:          null,
        today:         { date: today, sessions: [] },
        nextSession:   null,
        scheduleSummary: [],
      });
    }

    const student   = studentSnap.docs[0].data();
    const studentId = studentSnap.docs[0].id;

    // ── Step 3: Fetch precomputed room allocation ──────────────────────────
    const allocDoc = await db
      .collection('induction_student_room_allocations')
      .doc(`${plannerId}_${studentId}`)
      .get();

    let roomAllocation: any  = null;
    let roomStatus           = 'NOT_ALLOCATED';

    if (allocDoc.exists) {
      roomAllocation = allocDoc.data();
      roomStatus     = 'ALLOCATED';
    } else {
      // Fallback query in case doc ID format differs
      const allocQuery = await db
        .collection('induction_student_room_allocations')
        .where('studentId', '==', studentId)
        .where('plannerId', '==', plannerId)
        .limit(1)
        .get();

      if (!allocQuery.empty) {
        roomAllocation = allocQuery.docs[0].data();
        roomStatus     = 'ALLOCATED';
      }
    }

    // ── Step 4: Fetch precomputed schedule ─────────────────────────────────
    // Fetch all date documents for this student
    const scheduleSnap = await db
      .collection('induction_student_schedule')
      .where('studentId', '==', studentId)
      .where('plannerId', '==', plannerId)
      .get();

    // Flatten all sessions across all dates
    interface FlatSession {
      date:        string;
      day:         number;
      startTime:   string;
      endTime:     string;
      sessionName: string;
      venue:       string;
      sessionType: string;
    }
    const allSessions: FlatSession[] = [];
    for (const doc of scheduleSnap.docs) {
      const d = doc.data();
      for (const s of (d.sessions || [])) {
        allSessions.push({ date: d.date, ...s });
      }
    }

    // Sort by date then startTime
    allSessions.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return timeToMin(a.startTime) - timeToMin(b.startTime);
    });

    // ── Step 5: Today's sessions ───────────────────────────────────────────
    const todaySessions = allSessions.filter(s => s.date === today);

    // ── Step 6: Next upcoming session ─────────────────────────────────────
    let nextSession: any = null;
    for (const s of allSessions) {
      if (s.date > today)  { nextSession = s; break; }
      if (s.date === today && timeToMin(s.startTime) > timeMinutes) { nextSession = s; break; }
    }

    // ── Step 7: Schedule summary (day-level counts) ────────────────────────
    const dayMap = new Map<string, { day: number; date: string; sessions: number }>();
    for (const s of allSessions) {
      if (!dayMap.has(s.date)) {
        dayMap.set(s.date, { day: s.day || 0, date: s.date, sessions: 0 });
      }
      dayMap.get(s.date)!.sessions++;
    }
    const scheduleSummary = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return res.status(200).json({
      ok:            true,
      plannerActive: true,
      plannerId,
      plannerYear:   activePlanner.plannerYear,
      generatedAt:   isoNow,
      roomStatus,
      message:       roomStatus === 'NOT_ALLOCATED'
        ? 'Your room is being allocated. Please contact administration if this persists.'
        : '',
      room: roomAllocation ? {
        roomNumber:       roomAllocation.roomNumber,
        block:            roomAllocation.block,
        floor:            roomAllocation.floor,
        capacity:         roomAllocation.capacity,
        programme:        roomAllocation.programme,
        section:          roomAllocation.section,
        allocationMethod: roomAllocation.allocationMethod,
      } : null,
      today: {
        date:     today,
        sessions: todaySessions,
      },
      nextSession,
      scheduleSummary,
    });

  } catch (err: any) {
    console.error('[planner-student-dashboard]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

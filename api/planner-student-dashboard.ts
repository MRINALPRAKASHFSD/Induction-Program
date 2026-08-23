/**
 * GET /api/planner-student-dashboard
 *
 * Authenticated student endpoint. Returns the LIGHTWEIGHT planner dashboard:
 *   - plannerActive flag
 *   - Induction room
 *   - Today's sessions (full detail — 1 day only)
 *   - Next upcoming session (today or next day)
 *   - Documentation day info
 *   - scheduleSummary[] — day + sessionCount only (not full sessions)
 *
 * mappingKey is computed HERE on demand: "{schoolCode}|{course}|{programme}"
 * It is NEVER stored on the student document.
 *
 * Full five-day schedule is served on-demand by /api/planner-day-schedule
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

// ── Cache ─────────────────────────────────────────────────────────────────────
// In-process cache keyed by plannerId — resets on cold start
const PLANNER_CACHE = new Map<string, { sessions: any[]; rooms: any[]; ts: number }>();
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes

async function getCachedPlannerData(db: any, plannerId: string) {
  const cached = PLANNER_CACHE.get(plannerId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached;

  const [sessionSnap, roomSnap] = await Promise.all([
    db.collection('induction_sessions').where('plannerId', '==', plannerId).get(),
    db.collection('induction_room_allocations').where('plannerId', '==', plannerId).get(),
  ]);

  const data = {
    sessions: sessionSnap.docs.map((d: any) => d.data()),
    rooms:    roomSnap.docs.map((d: any) => d.data()),
    ts:       Date.now(),
  };
  PLANNER_CACHE.set(plannerId, data);
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMappingKey(schoolCode: string, course: string, programme: string): string {
  return `${schoolCode.toLowerCase().trim()}|${course.toLowerCase().trim()}|${programme.toLowerCase().trim()}`;
}

function nowIST(): { date: string; timeMinutes: number; isoNow: string } {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = ist.toISOString().slice(0, 10);
  const timeMinutes = ist.getHours() * 60 + ist.getMinutes();
  return { date, timeMinutes, isoNow: now.toISOString() };
}

function timeToMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

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
    const activePlannerSnap = await db.collection('induction_planners')
      .where('status', 'in', ['PUBLISHED', 'ROLLED_BACK'])
      .limit(1)
      .get();

    if (activePlannerSnap.empty) {
      return res.status(200).json({
        ok: true,
        plannerActive: false,
        message: 'Induction planner has not been published yet.',
      });
    }

    const activePlanner = activePlannerSnap.docs[0].data();
    const plannerId     = activePlanner.plannerId;

    // ── Step 2: Get student record (enrollment + course + branch) ──────────
    // Student is identified by auth_uid, which might be 'email:xxx' or just 'xxx' due to a bug in registration
    const uidsToTry = [studentUid];
    if (studentUid.startsWith('email:')) {
      uidsToTry.push(studentUid.replace('email:', ''));
    } else {
      uidsToTry.push(`email:${studentUid}`);
    }

    const studentSnap = await db.collection('students')
      .where('auth_uid', 'in', uidsToTry)
      .limit(1)
      .get();

    let enrollmentNo = 'ADMIN';
    let schoolCode   = '';
    let course       = '';
    let programme    = '';

    if (!studentSnap.empty) {
      const student  = studentSnap.docs[0].data();
      enrollmentNo   = student.enrollment_no || student.enrollmentNo || studentSnap.docs[0].id;
      schoolCode     = (student.department_id || '').toLowerCase().trim();
      course         = (student.course || '').toLowerCase().trim();
      programme      = (student.branch || student.programme || '').toLowerCase().trim();
    }

    // ── Step 3: Compute mappingKey on-demand — NEVER stored ────────────────
    const mappingKey = buildMappingKey(schoolCode, course, programme);

    // ── Step 4: Load cached planner data ──────────────────────────────────
    const { sessions, rooms } = await getCachedPlannerData(db, plannerId);

    // ── Step 5: Find induction room (with fallback to school-wide room) ────
    let roomAllocation = rooms.find((r: any) => r.mappingKey === mappingKey);

    if (!roomAllocation && schoolCode) {
      const schoolRooms = rooms.filter((r: any) => r.schoolCode === schoolCode);
      if (schoolRooms.length > 0) {
        // Try exact programme or course match first
        roomAllocation = schoolRooms.find((r: any) => r.programme && (r.programme === programme || r.programme === course));
        
        // Try partial programme match
        if (!roomAllocation) {
          roomAllocation = schoolRooms.find((r: any) => r.programme && (
            (programme && (r.programme.includes(programme) || programme.includes(r.programme))) ||
            (course && (r.programme.includes(course) || course.includes(r.programme)))
          ));
        }
        
        // Fallback to school-wide room (empty programme)
        if (!roomAllocation) {
          roomAllocation = schoolRooms.find((r: any) => !r.programme || r.programme === '');
        }
        
        // Ultimate fallback: First room in that school
        if (!roomAllocation) {
          roomAllocation = schoolRooms[0];
        }
      }
    }

    // ── Step 6: Filter sessions relevant to this student (or all if admin) ─
    const relevantSessions = (!schoolCode && !course && !programme)
      ? sessions
      : sessions.filter((s: any) => {
          if (!s) return false;
          const sScope = (s.scope || '').toLowerCase().trim();
          const sKey   = (s.scopeKey || '').toLowerCase().trim();

          // 1. Universal or ALL
          if (
            sScope === 'universal' || 
            !sKey || 
            sKey.includes('all schools') ||
            sKey.includes('general session') ||
            /^(all|universal|all\s*schools?|general|mandatory|any|-|na|n\/a)$/i.test(sKey)
          ) {
            return true;
          }

          // 2. Exact match or Token-based robust word-boundary matching
          const targetText = ` ${schoolCode} ${course} ${programme} `;
          if (sKey.length >= 2 && targetText.includes(sKey)) return true;

          const tokens = sKey.split(/[,/|;&]/).map((t: string) => t.trim()).filter(Boolean);

          for (const token of tokens) {
            if (token.length < 2) continue;
            // Exact part match
            if (token === schoolCode || token === course || token === programme) return true;
            
            // Bounded match in target string (handles spaces, parentheses, slashes securely)
            const escapedToken = token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`(^|\\s|\\W)${escapedToken}(\\s|\\W|$)`, 'i');
            if (regex.test(targetText)) return true;
          }

          return false;
        });

    // Sort by date then startTime
    relevantSessions.sort((a: any, b: any) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return timeToMin(a.startTime) - timeToMin(b.startTime);
    });

    // ── Step 7: Today's sessions ───────────────────────────────────────────
    const { date: today, timeMinutes, isoNow } = nowIST();
    const todaySessions = relevantSessions.filter((s: any) => s.date === today);

    // ── Step 8: Next session ───────────────────────────────────────────────
    let nextSession: any = null;
    for (const s of relevantSessions) {
      const sDate = s.date;
      const sMin  = timeToMin(s.startTime);
      if (sDate > today) { nextSession = s; break; }
      if (sDate === today && sMin > timeMinutes) { nextSession = s; break; }
    }

    // ── Step 9: Documentation day ──────────────────────────────────────────
    const documentationDay = relevantSessions.find((s: any) => s.isDocumentationDay) || null;

    // ── Step 10: Schedule summary (just counts per day, no full session data)
    const dayMap = new Map<number, { day: number; date: string; sessions: number }>();
    for (const s of relevantSessions) {
      const key = s.dayNumber;
      if (!dayMap.has(key)) {
        dayMap.set(key, { day: s.dayNumber, date: s.date, sessions: 0 });
      }
      dayMap.get(key)!.sessions++;
    }
    const scheduleSummary = Array.from(dayMap.values()).sort((a, b) => a.day - b.day);

    return res.status(200).json({
      ok: true,
      plannerActive:   true,
      plannerId,
      plannerYear:     activePlanner.plannerYear,
      generatedAt:     isoNow,
      // Student context used (not returned to client in detail)
      mappingKey:      undefined,  // intentionally omitted
      room:            roomAllocation ? {
        roomNumber:  roomAllocation.roomNumber,
        block:       roomAllocation.block,
        floor:       roomAllocation.floor,
        building:    roomAllocation.building || '',
        capacity:    roomAllocation.capacity,
        school:      roomAllocation.school,
        programme:   roomAllocation.programme,
        course:      roomAllocation.course,
      } : null,
      today: {
        date:     today,
        sessions: todaySessions,
      },
      nextSession,
      documentationDay,
      scheduleSummary,
    });

  } catch (err: any) {
    console.error('[planner-student-dashboard]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

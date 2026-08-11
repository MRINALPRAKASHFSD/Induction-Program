/**
 * GET /api/planner-day-schedule?day=1
 *
 * Authenticated student endpoint. Returns full session list for a specific day.
 * Called only when the student taps a day tab in the Schedule screen.
 *
 * Query params:
 *   day=1..5  (required) — induction day number
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
  console.error('[planner-day-schedule] Firebase init error:', e);
}

// ── Per-day cache ──────────────────────────────────────────────────────────────
// Key: `{plannerId}:{dayNumber}` → all sessions for that day
const DAY_CACHE = new Map<string, { sessions: any[]; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function buildMappingKey(schoolCode: string, course: string, programme: string): string {
  return `${schoolCode.toLowerCase().trim()}|${course.toLowerCase().trim()}|${programme.toLowerCase().trim()}`;
}

function timeToMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

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

  const dayParam = parseInt(String(req.query?.day ?? ''), 10);
  if (isNaN(dayParam) || dayParam < 1 || dayParam > 10) {
    return res.status(400).json({ ok: false, error: 'Query param "day" must be a number (1–10)' });
  }

  try {
    const db = getFirestore();

    // Get active planner
    const activePlannerSnap = await db.collection('induction_planners')
      .where('status', 'in', ['PUBLISHED', 'ROLLED_BACK'])
      .limit(1)
      .get();

    if (activePlannerSnap.empty) {
      return res.status(200).json({ ok: true, plannerActive: false, sessions: [] });
    }

    const plannerId = activePlannerSnap.docs[0].data().plannerId;
    const cacheKey  = `${plannerId}:${dayParam}`;

    // Get student (optional - admins/faculty can view full schedule)
    // Get student (optional - admins/faculty can view full schedule)
    let schoolCode = (String(req.query?.dept || '')).toLowerCase().trim();
    let course     = (String(req.query?.course || '')).toLowerCase().trim();
    let programme  = (String(req.query?.prog || '')).toLowerCase().trim();

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

    if (!studentSnap.empty) {
      const student = studentSnap.docs[0].data();
      if (!schoolCode) schoolCode = (student.department_id || student.school_code || '').toLowerCase().trim();
      if (!course)     course     = (student.course || '').toLowerCase().trim();
      if (!programme)  programme  = (student.branch || student.programme || '').toLowerCase().trim();
    }

    // Get all sessions for this day (cached)
    let daySessions: any[];
    const cached = DAY_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      daySessions = cached.sessions;
    } else {
      const snap = await db.collection('induction_sessions')
        .where('plannerId', '==', plannerId)
        .where('dayNumber', '==', dayParam)
        .get();
      daySessions = snap.docs.map(d => d.data());
      DAY_CACHE.set(cacheKey, { sessions: daySessions, ts: Date.now() });
    }

    // Filter to this student's scope (or all if master view, admin, or unassigned)
    const isMaster = req.query?.master === '1' || req.query?.master === 'true';
    const relevantSessions = (isMaster || (!schoolCode && !course && !programme))
      ? daySessions
      : daySessions.filter((s: any) => {
          if (!s) return false;
          const sScope = (s.scope || '').toLowerCase().trim();
          const sKey   = (s.scopeKey || '').toLowerCase().trim();

          // 1. Universal or ALL
          if (sScope === 'universal' || !sKey || /^(all|universal|all\s*schools?|general|mandatory|any|-|na|n\/a)$/i.test(sKey)) {
            return true;
          }

          // 2. Tokenize comma/slash-separated scopeKeys e.g. "SOET, SOLS" or "B.Tech CSE / BCA"
          const tokens = sKey.split(/[,/|;&]/).map((t: string) => t.trim()).filter(Boolean);

          // 3. Match against schoolCode, programme, or course (direct, tokens, or prefix/suffix/word matching)
          const isMatch = (target: string) => {
            if (!target) return false;
            if (sKey === target || target === sKey) return true;
            for (const token of tokens) {
              if (token === target) return true;
              if (token.length >= 3 && (
                target.startsWith(token) ||
                target.endsWith(token) ||
                target.includes(`-${token}`) ||
                target.includes(` ${token}`) ||
                target.includes(`${token} `) ||
                token.startsWith(target) ||
                token.endsWith(target)
              )) {
                return true;
              }
            }
            return false;
          };

          if (isMatch(schoolCode) || isMatch(programme) || isMatch(course)) return true;

          return false;
        });


    // Sort by startTime
    relevantSessions.sort((a: any, b: any) => timeToMin(a.startTime) - timeToMin(b.startTime));

    return res.status(200).json({
      ok: true,
      plannerActive: true,
      plannerId,
      day:      dayParam,
      sessions: relevantSessions,
    });

  } catch (err: any) {
    console.error('[planner-day-schedule]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

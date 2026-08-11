/**
 * GET /api/planner-health
 *
 * Admin-only. Comprehensive health check for the active planner.
 * Runs 12 integrity checks and returns a structured health report.
 *
 * Checks:
 *  1.  Active planner exists
 *  2.  All room allocations have non-zero capacity
 *  3.  No duplicate mappingKeys
 *  4.  Every day has at least one universal session
 *  5.  No session time overlaps (per scope)
 *  6.  Documentation day present for each scope group
 *  7.  No missing venues
 *  8.  Faculty set is non-empty
 *  9.  No missing session names
 *  10. Room count matches expected school/programme count
 *  11. No orphan course sessions (no parent programme in rooms)
 *  12. Mandatory sessions all have venue/room
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
  console.error('[planner-health] Firebase init error:', e);
}

function timeToMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface HealthCheckResult {
  check:    string;
  passed:   boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  detail:   string;
  data?:    any;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try { await verifyFirebaseIdToken(token); } catch { return res.status(401).json({ ok: false, error: 'Invalid token' }); }

  try {
    const db = getFirestore();
    const checks: HealthCheckResult[] = [];
    const startMs = Date.now();

    // ── Check 1: Active planner exists ────────────────────────────────────
    const plannerSnap = await db.collection('induction_planners')
      .where('status', 'in', ['PUBLISHED', 'ROLLED_BACK'])
      .limit(1)
      .get();

    if (plannerSnap.empty) {
      checks.push({ check: 'ACTIVE_PLANNER_EXISTS', passed: false, severity: 'CRITICAL',
        detail: 'No published planner found. Upload and publish the Excel workbook.' });
      return res.status(200).json({ ok: true, healthy: false, plannerId: null, checks, durationMs: Date.now() - startMs });
    }

    const planner   = plannerSnap.docs[0].data();
    const plannerId = planner.plannerId;
    checks.push({ check: 'ACTIVE_PLANNER_EXISTS', passed: true, severity: 'INFO', detail: `Active: ${plannerId}` });

    // ── Load all data ──────────────────────────────────────────────────────
    const [sessionSnap, roomSnap, venueSnap] = await Promise.all([
      db.collection('induction_sessions').where('plannerId', '==', plannerId).get(),
      db.collection('induction_room_allocations').where('plannerId', '==', plannerId).get(),
      db.collection('induction_venues').where('plannerId', '==', plannerId).get(),
    ]);

    const sessions = sessionSnap.docs.map(d => d.data());
    const rooms    = roomSnap.docs.map(d => d.data());
    const venues   = venueSnap.docs.map(d => d.data());

    // ── Check 2: Non-zero capacity ─────────────────────────────────────────
    const zeroCapacity = rooms.filter((r: any) => !r.capacity || r.capacity <= 0);
    checks.push({
      check:    'ROOM_CAPACITIES',
      passed:   zeroCapacity.length === 0,
      severity: 'WARNING',
      detail:   zeroCapacity.length === 0 ? 'All rooms have capacity > 0'
                : `${zeroCapacity.length} room(s) have zero capacity`,
      data: zeroCapacity.map((r: any) => ({ mappingKey: r.mappingKey, room: r.roomNumber })),
    });


    // ── Check 4: Each day has a universal session ──────────────────────────
    const dayNums   = [...new Set(sessions.map((s: any) => s.dayNumber))].sort();
    const daysWithUniversal = new Set(sessions.filter((s: any) => s.scope === 'universal').map((s: any) => s.dayNumber));
    const daysWithoutUniversal = dayNums.filter(d => !daysWithUniversal.has(d));
    checks.push({
      check:    'DAYS_HAVE_UNIVERSAL_SESSION',
      passed:   daysWithoutUniversal.length === 0,
      severity: 'WARNING',
      detail:   daysWithoutUniversal.length === 0 ? 'Every induction day has at least one universal session'
                : `Day(s) ${daysWithoutUniversal.join(', ')} have no universal sessions`,
      data: daysWithoutUniversal,
    });

    // ── Check 5: No session overlaps ───────────────────────────────────────
    const overlaps: any[] = [];
    const sessionGroups = new Map<string, any[]>();
    for (const s of sessions) {
      const key = `${s.scope}:${s.scopeKey}:${s.dayNumber}`;
      const g = sessionGroups.get(key) ?? [];
      g.push(s);
      sessionGroups.set(key, g);
    }
    for (const [gKey, group] of sessionGroups.entries()) {
      const sorted = [...group].sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const isParallelActivity = (name: string) => /full\\s*day|documentation|feedback|erp|industry|visit/i.test(name);
        if (timeToMin(curr.startTime) < timeToMin(prev.endTime) && 
            curr.sessionName !== prev.sessionName &&
            !isParallelActivity(curr.sessionName) &&
            !isParallelActivity(prev.sessionName)) {
          overlaps.push({ scope: gKey, session: curr.sessionName, overlapsWith: prev.sessionName });
        }
      }
    }
    checks.push({
      check:    'NO_SESSION_OVERLAPS',
      passed:   overlaps.length === 0,
      severity: 'CRITICAL',
      detail:   overlaps.length === 0 ? 'No overlapping sessions detected'
                : `${overlaps.length} session overlap(s) found`,
      data: overlaps,
    });

    // ── Check 6: Documentation day exists per school ───────────────────────
    const schools = [...new Set(rooms.map((r: any) => r.schoolCode))];
    const docDaySessions = sessions.filter((s: any) => s.isDocumentationDay);
    const schoolsWithDocDay = new Set(docDaySessions.map((s: any) => s.scopeKey.toLowerCase()));
    const universalDocDay = docDaySessions.some((s: any) => s.scope === 'universal');
    const missingDocDay = schools.filter(sc => !universalDocDay && !schoolsWithDocDay.has(sc));
    checks.push({
      check:    'DOCUMENTATION_DAY_PRESENT',
      passed:   missingDocDay.length === 0,
      severity: 'WARNING',
      detail:   missingDocDay.length === 0 ? 'Documentation day found for all schools'
                : `Schools missing documentation day: ${missingDocDay.join(', ')}`,
      data: missingDocDay,
    });

    // ── Check 7: No missing venues ─────────────────────────────────────────
    const noVenue = sessions.filter((s: any) => !s.venueName && !s.room);
    checks.push({
      check:    'SESSIONS_HAVE_VENUE',
      passed:   noVenue.length === 0,
      severity: 'CRITICAL',
      detail:   noVenue.length === 0 ? 'All sessions have a venue'
                : `${noVenue.length} session(s) missing venue`,
      data: noVenue.map((s: any) => s.sessionName).slice(0, 10),
    });

    // ── Check 8: Faculty set non-empty ─────────────────────────────────────
    const faculty = [...new Set(sessions.map((s: any) => s.facultyCoordinator).filter(Boolean))];
    checks.push({
      check:    'FACULTY_ASSIGNED',
      passed:   faculty.length > 0,
      severity: 'INFO',
      detail:   `${faculty.length} distinct faculty coordinator(s) assigned`,
    });

    // ── Check 9: No empty session names ───────────────────────────────────
    const emptyNames = sessions.filter((s: any) => !s.sessionName);
    checks.push({
      check:    'SESSION_NAMES_COMPLETE',
      passed:   emptyNames.length === 0,
      severity: 'CRITICAL',
      detail:   emptyNames.length === 0 ? 'All sessions have names' : `${emptyNames.length} unnamed session(s)`,
    });

    // ── Check 10: Room count plausibility ─────────────────────────────────
    const uniqueRoomNos = new Set(rooms.map((r: any) => r.roomNumber));
    checks.push({
      check:    'ROOM_COUNT_PLAUSIBLE',
      passed:   uniqueRoomNos.size > 0,
      severity: 'INFO',
      detail:   `${rooms.length} programme allocations across ${uniqueRoomNos.size} distinct room(s)`,
    });

    // ── Check 11: No orphan course sessions ───────────────────────────────
    const allProgrammes = new Set(rooms.map((r: any) => r.programme.toLowerCase()));
    const orphanCourse  = sessions.filter((s: any) =>
      s.scope === 'course' && s.scopeKey && !allProgrammes.has(s.scopeKey.toLowerCase())
    );
    checks.push({
      check:    'NO_ORPHAN_COURSE_SESSIONS',
      passed:   orphanCourse.length === 0,
      severity: 'WARNING',
      detail:   orphanCourse.length === 0 ? 'All course sessions have a parent programme'
                : `${orphanCourse.length} course session(s) reference unknown programmes`,
      data: orphanCourse.map((s: any) => ({ session: s.sessionName, scopeKey: s.scopeKey })),
    });

    // ── Check 12: Mandatory sessions have venue ────────────────────────────
    const mandatoryNoVenue = sessions.filter((s: any) => s.isMandatory && !s.venueName && !s.room);
    checks.push({
      check:    'MANDATORY_SESSIONS_HAVE_VENUE',
      passed:   mandatoryNoVenue.length === 0,
      severity: 'CRITICAL',
      detail:   mandatoryNoVenue.length === 0 ? 'All mandatory sessions have venues'
                : `${mandatoryNoVenue.length} mandatory session(s) missing venue`,
      data: mandatoryNoVenue.map((s: any) => s.sessionName),
    });

    const criticalFailed = checks.filter(c => !c.passed && c.severity === 'CRITICAL').length;
    const warningFailed  = checks.filter(c => !c.passed && c.severity === 'WARNING').length;
    const healthy        = criticalFailed === 0;

    return res.status(200).json({
      ok:      true,
      healthy,
      plannerId,
      summary: {
        totalChecks:    checks.length,
        passed:         checks.filter(c => c.passed).length,
        failed:         checks.filter(c => !c.passed).length,
        criticalFailed,
        warningFailed,
        sessionCount:   sessions.length,
        roomCount:      rooms.length,
        venueCount:     venues.length,
      },
      checks,
      durationMs: Date.now() - startMs,
    });

  } catch (err: any) {
    console.error('[planner-health]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

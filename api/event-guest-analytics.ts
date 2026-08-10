/**
 * GET /api/event-guest-analytics?event_id=X
 *
 * Admin-only. Aggregates event_guest_counts for the given event_id.
 * Returns full footfall metrics including:
 *   - Total students with guest records, total guests, total footfall
 *   - Expected vs actual variance
 *   - Avg / max guests, students alone
 *   - Department, programme, school breakdowns
 *   - Relationship breakdown
 *   - Peak arrival hour
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
} catch (e) { console.error('[event-guest-analytics] Firebase init error:', e); }

async function validateAdmin(req: any): Promise<{ uid: string } | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return decoded.uid ? { uid: decoded.uid } : null;
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const admin = await validateAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const event_id = req.query?.event_id as string;
  if (!event_id) {
    return res.status(400).json({ ok: false, error: 'Missing ?event_id param' });
  }

  let expectedFootfall = parseInt(req.query?.expected_footfall as string || '0', 10) || null;

  try {
    const db = getFirestore();
    
    let resolvedEventId = event_id;
    let snap = await db
      .collection('event_guest_counts')
      .where('event_id', '==', resolvedEventId)
      .get();

    // If no documents found, try resolving the event ID by searching events collection
    if (snap.empty) {
      const searchStr = event_id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const eventsSnap = await db.collection('events').orderBy('created_at', 'desc').get();
      const match = eventsSnap.docs.find(d => {
        const titleStr = (d.data().title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        // Loose match: either the title contains the search string, or vice-versa
        return titleStr.includes(searchStr) || searchStr.includes(titleStr.replace('aarambh', ''));
      });
      
      if (match) {
        resolvedEventId = match.id;
        expectedFootfall = expectedFootfall || match.data().capacity || null;
        
        // Re-query with the resolved event ID
        snap = await db
          .collection('event_guest_counts')
          .where('event_id', '==', resolvedEventId)
          .get();
      }
    } else {
       // Get capacity directly if exact match works
       const eventSnap = await db.collection('events').doc(resolvedEventId).get();
       if (eventSnap.exists) {
         expectedFootfall = expectedFootfall || eventSnap.data()?.capacity || null;
       }
    }

    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    if (docs.length === 0) {
      return res.status(200).json({
        ok: true,
        event_id,
        studentsCheckedIn: 0,
        studentsWithGuests: 0,
        studentsAlone: 0,
        totalGuestCount: 0,
        totalFootfall: 0,
        averageGuestsPerStudent: 0,
        maxGuestsInOneRecord: 0,
        todayFootfall: 0,
        expectedFootfall,
        expectedVsActual: null,
        relationshipBreakdown: {},
        departmentWise: [],
        programmeWise: [],
        schoolWise: [],
        peakArrivalHour: null,
      });
    }

    // ── Core metrics ───────────────────────────────────────────────────────────
    const studentsCheckedIn = docs.length;
    const studentsWithGuests = docs.filter((d: any) => d.headcount > 0).length;
    const studentsAlone = docs.filter((d: any) => d.headcount === 0).length;
    const totalGuestCount = docs.reduce((sum: number, d: any) => sum + (d.headcount || 0), 0);
    const totalFootfall = studentsCheckedIn + totalGuestCount;
    const averageGuestsPerStudent = studentsCheckedIn > 0
      ? Math.round((totalGuestCount / studentsCheckedIn) * 100) / 100
      : 0;
    const maxGuestsInOneRecord = docs.reduce((max: number, d: any) => Math.max(max, d.headcount || 0), 0);

    // Today's footfall (submitted_at today)
    const today = new Date().toISOString().slice(0, 10);
    const todayDocs = docs.filter((d: any) => (d.submitted_at || '').startsWith(today));
    const todayGuestCount = todayDocs.reduce((sum: number, d: any) => sum + (d.headcount || 0), 0);
    const todayFootfall = todayDocs.length + todayGuestCount;

    // Expected vs Actual
    const expectedVsActual = expectedFootfall !== null
      ? {
          registered: expectedFootfall,
          guestsCheckedIn: totalGuestCount,
          actualFootfall: totalFootfall,
          variance: totalFootfall - expectedFootfall,
          coveragePercent: Math.round((studentsCheckedIn / expectedFootfall) * 100),
        }
      : null;

    // ── Relationship breakdown ─────────────────────────────────────────────────
    const relationshipBreakdown: Record<string, number> = {};
    for (const d of docs) {
      if (Array.isArray(d.relationships)) {
        for (const r of d.relationships) {
          relationshipBreakdown[r] = (relationshipBreakdown[r] || 0) + 1;
        }
      }
    }

    // ── Department-wise ────────────────────────────────────────────────────────
    const deptMap = new Map<string, { studentCount: number; guestCount: number }>();
    for (const d of docs) {
      const dept = d.department_id || 'Unknown';
      if (!deptMap.has(dept)) deptMap.set(dept, { studentCount: 0, guestCount: 0 });
      deptMap.get(dept)!.studentCount++;
      deptMap.get(dept)!.guestCount += d.headcount || 0;
    }
    const departmentWise = Array.from(deptMap.entries())
      .map(([dept, info]) => ({
        dept,
        studentCount: info.studentCount,
        guestCount: info.guestCount,
        footfall: info.studentCount + info.guestCount,
      }))
      .sort((a, b) => b.footfall - a.footfall);

    // ── Programme-wise ─────────────────────────────────────────────────────────
    const progMap = new Map<string, { studentCount: number; guestCount: number }>();
    for (const d of docs) {
      const prog = d.programme || 'Unknown';
      if (!progMap.has(prog)) progMap.set(prog, { studentCount: 0, guestCount: 0 });
      progMap.get(prog)!.studentCount++;
      progMap.get(prog)!.guestCount += d.headcount || 0;
    }
    const programmeWise = Array.from(progMap.entries())
      .map(([programme, info]) => ({
        programme,
        studentCount: info.studentCount,
        guestCount: info.guestCount,
        footfall: info.studentCount + info.guestCount,
      }))
      .sort((a, b) => b.footfall - a.footfall);

    // ── School-wise ────────────────────────────────────────────────────────────
    const schoolMap = new Map<string, { studentCount: number; guestCount: number }>();
    for (const d of docs) {
      const s = d.school || 'Unknown';
      if (!schoolMap.has(s)) schoolMap.set(s, { studentCount: 0, guestCount: 0 });
      schoolMap.get(s)!.studentCount++;
      schoolMap.get(s)!.guestCount += d.headcount || 0;
    }
    const schoolWise = Array.from(schoolMap.entries())
      .map(([school, info]) => ({
        school,
        studentCount: info.studentCount,
        guestCount: info.guestCount,
        footfall: info.studentCount + info.guestCount,
      }))
      .sort((a, b) => b.footfall - a.footfall);

    // ── Peak arrival hour ──────────────────────────────────────────────────────
    const hourMap = new Map<number, number>();
    for (const d of docs) {
      if (d.submitted_at) {
        const hour = new Date(d.submitted_at).getHours();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      }
    }
    const peakArrivalHour = hourMap.size > 0
      ? Array.from(hourMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null;

    return res.status(200).json({
      ok: true,
      event_id,
      studentsCheckedIn,
      studentsWithGuests,
      studentsAlone,
      totalGuestCount,
      totalFootfall,
      averageGuestsPerStudent,
      maxGuestsInOneRecord,
      todayFootfall,
      expectedFootfall,
      expectedVsActual,
      relationshipBreakdown,
      departmentWise,
      programmeWise,
      schoolWise,
      peakArrivalHour,
      lastRefreshedAt: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error('[event-guest-analytics]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}

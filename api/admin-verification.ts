/**
 * GET /api/admin-verification
 *
 * Admin-only endpoint.
 * Returns aggregated verification metrics:
 *  - Total students
 *  - Allocated (with room in induction_student_room_allocations)
 *  - Pending Review
 *  - Schedules generated
 *  - Room occupancy table
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
  console.error('[admin-verification] Firebase init error:', e);
}

const PLANNER_ID = 'planner_2026_v29';
const CACHE: { ts: number; data: any } | null = null;
const CACHE_TTL = 30_000; // 30 seconds

const cache: { ts: number; data: any } = { ts: 0, data: null };

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const decoded = await verifyFirebaseIdToken(token);
    // Check admin claim
    if (!decoded.admin && !decoded.email?.endsWith('@siu.edu.in') && !decoded.email?.endsWith('@symbiosis.ac.in')) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }

  // Serve from cache if fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return res.status(200).json({ ok: true, cached: true, ...cache.data });
  }

  try {
    const db = getFirestore();

    // Fetch in parallel
    const [studentsSnap, allocSnap, schedSnap] = await Promise.all([
      db.collection('students').get(),
      db.collection('induction_student_room_allocations').where('plannerId', '==', PLANNER_ID).get(),
      db.collection('induction_student_schedule').where('plannerId', '==', PLANNER_ID).get(),
    ]);

    const totalStudents = studentsSnap.size;
    const totalAllocs   = allocSnap.size;
    const totalSchedules = schedSnap.size;

    // Allocation breakdown
    const allocDocs = allocSnap.docs.map(d => d.data());
    const allocated       = allocDocs.filter(d => d.allocationStatus === 'ALLOCATED').length;
    const pendingReview   = allocDocs.filter(d => d.allocationStatus === 'PENDING_REVIEW').length;

    // Room occupancy
    const roomOccupancy: Record<string, { assigned: number; method?: string }> = {};
    for (const d of allocDocs) {
      if (d.roomNumber && d.allocationStatus === 'ALLOCATED') {
        if (!roomOccupancy[d.roomNumber]) {
          roomOccupancy[d.roomNumber] = { assigned: 0, method: d.allocationMethod };
        }
        roomOccupancy[d.roomNumber].assigned++;
      }
    }
    const roomRows = Object.entries(roomOccupancy)
      .map(([room, { assigned }]) => ({ room, assigned }))
      .sort((a, b) => a.room.localeCompare(b.room));

    // Pending review list (first 50)
    const pendingList = allocDocs
      .filter(d => d.allocationStatus === 'PENDING_REVIEW')
      .slice(0, 50)
      .map(d => ({ studentId: d.studentId, reason: d.reason }));

    const data = {
      plannerId: PLANNER_ID,
      totalStudents,
      allocated,
      pendingReview,
      unallocated: Math.max(0, totalStudents - allocated - pendingReview),
      schedulesGenerated: totalSchedules,
      allocationRate: totalStudents > 0 ? `${Math.round((allocated / totalStudents) * 100)}%` : '0%',
      scheduleRate:   totalStudents > 0 ? `${Math.round((totalSchedules / totalStudents) * 100)}%` : '0%',
      roomOccupancy: roomRows,
      pendingReviewList: pendingList,
      asOf: new Date().toISOString(),
    };

    cache.ts   = Date.now();
    cache.data = data;

    return res.status(200).json({ ok: true, cached: false, ...data });
  } catch (err: any) {
    console.error('[admin-verification]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
}

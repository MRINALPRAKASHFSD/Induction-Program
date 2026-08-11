/**
 * Admin Room Reallocation API
 * POST /api/reallocate-student
 *
 * Manual override to reassign a student to a different room.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';

try {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Missing Firebase Admin env vars.');
    }
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
} catch (e) {
  console.error('Firebase Admin init error:', e);
}

async function validateAdmin(req: any): Promise<boolean> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return false;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return !!decoded.uid;
  } catch (err) {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const isAdmin = await validateAdmin(req);
  if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  const { enrollment_no, new_room_number, reason = 'admin_override', performed_by = 'admin' } = req.body;
  if (!enrollment_no || !new_room_number) {
    return res.status(400).json({ error: 'Missing enrollment_no or new_room_number' });
  }

  const db = getFirestore();
  const now = new Date().toISOString();

  const studentRef = db.collection('students').doc(enrollment_no.toUpperCase().trim());
  const newRoomRef = db.collection('rooms').doc(new_room_number.toUpperCase().trim());

  try {
    const result = await db.runTransaction(async (t) => {
      const [studentSnap, newRoomSnap] = await Promise.all([
        t.get(studentRef),
        t.get(newRoomRef),
      ]);

      if (!studentSnap.exists) throw new Error('Student not found');
      if (!newRoomSnap.exists) throw new Error('Target room not found');

      const student = studentSnap.data()!;
      const newRoom = newRoomSnap.data()!;

      if (newRoom.status !== 'ACTIVE') throw new Error('Target room is not ACTIVE');
      if ((newRoom.remainingSeats ?? 0) <= 0) throw new Error('Target room is at full capacity');

      const oldRoomNumber = student.roomNumber || student.room_no || null;
      const oldAllocationStatus = student.allocationStatus || (student.roomAssignment?.allocationStatus);

      // Release old room
      if (oldRoomNumber && (oldAllocationStatus === 'ALLOCATED' || oldAllocationStatus === 'allocated')) {
        const oldRoomRef = db.collection('rooms').doc(oldRoomNumber);
        const oldRoomSnap = await t.get(oldRoomRef);
        if (oldRoomSnap.exists) {
          const old = oldRoomSnap.data()!;
          t.update(oldRoomRef, {
            occupancy:      Math.max(0, (old.occupancy ?? 1) - 1),
            remainingSeats: (old.remainingSeats ?? 0) + 1,
            updatedAt:      now,
          });
        }
      }

      // Occupy new room
      t.update(newRoomRef, {
        occupancy:      (newRoom.occupancy ?? 0) + 1,
        remainingSeats: (newRoom.remainingSeats ?? 0) - 1,
        updatedAt:      now,
      });

      const newAssignment = {
        roomNumber:       newRoom.roomNumber,
        roomId:           newRoom.roomNumber,
        plannerId:        null, // Admin override, planner is detached
        block:            newRoom.block || null,
        school:           newRoom.school,
        capacity:         newRoom.capacity,
        allocatedAt:      now,
        allocationStatus: 'ALLOCATED' as const,
      };

      // Update student
      t.update(studentRef, {
        roomNumber:       newAssignment.roomNumber,
        roomId:           newAssignment.roomId,
        plannerId:        newAssignment.plannerId,
        block:            newAssignment.block,
        capacity:         newAssignment.capacity,
        allocatedAt:      newAssignment.allocatedAt,
        allocationStatus: newAssignment.allocationStatus,
        room_no:          newRoom.roomNumber,
        updatedAt:        now,
      });

      // Audit trail
      const auditRef = db.collection('room_allocations').doc();
      t.set(auditRef, {
        studentUid:       enrollment_no.toUpperCase().trim(),
        room:             newRoom.roomNumber,
        programme:        student.branch_id || student.program || '',
        planner:          null,
        allocatedBy:      performed_by,
        allocatedAt:      now,
        // Legacy fields for backward compat
        enrollment_no:    enrollment_no.toUpperCase().trim(),
        student_name:     student.full_name,
        department_id:    student.department_id,
        old_room_number:  oldRoomNumber,
        room_number:      newRoom.roomNumber,
        block:            newRoom.block,
        action:           'reassigned',
        reason,
        performed_by,
        allocated_at:     now,
      });

      return { ok: true, newAssignment };
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[reallocate-student]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

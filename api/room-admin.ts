/**
 * Admin Room Management API
 * POST /api/room-admin
 *
 * Actions (set in body):
 *   "seed"        — Populate the Firestore `rooms` collection from ROOM_MASTER_DATA.
 *                   Safe to re-run (skips existing rooms unless force=true).
 *   "recalculate" — Emergency recovery: scan all students and allocate rooms for any
 *                   with allocationStatus: 'pending'. Replaces the old "Allocate Rooms" button.
 *   "reassign"    — Admin override: move a student to a different room atomically.
 *   "block"       — Set a room's status to BLOCKED or MAINTENANCE.
 *   "activate"    — Restore a room's status to ACTIVE.
 *   "reset"       — (Super Admin) Clear ALL room assignments. Requires confirmation.
 *
 * Authentication: Admin Bearer token validated against Firestore admin_sessions.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { allocateRoom } from '../server/room-allocation.js';
import { verifyFirebaseIdToken, extractBearerToken } from '../server/verify-id-token.js';

// ── Firebase Admin Init ────────────────────────────────────────────────────────
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
  console.error('Firebase Admin init error (room-admin):', e);
}

// ── Auth helper ────────────────────────────────────────────────────────────────
async function validateAdmin(req: any): Promise<boolean> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return false;
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return !!decoded.uid;
  } catch (err) {
    console.error('Admin token validation failed:', err);
    return false;
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const isAdmin = await validateAdmin(req);
  if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  const { action, ...payload } = req.body || {};
  const db = getFirestore();
  const now = new Date().toISOString();

  try {
    // ── SEED ────────────────────────────────────────────────────────────────
    if (action === 'seed') {
      return res.status(400).json({ error: 'Seeding is now performed automatically when a Planner is published.' });
    }

    // ── RECALCULATE (Emergency Recovery) ────────────────────────────────────
    if (action === 'recalculate') {
      // Find all students without a confirmed room allocation
      const pendingSnap = await db.collection('students')
        .where('roomAssignment.allocationStatus', '==', 'pending')
        .get();

      let allocated = 0;
      let stillPending = 0;

      for (const studentDoc of pendingSnap.docs) {
        const student = studentDoc.data();
        if (!student.department_id) { stillPending++; continue; }

        try {
          const result = await db.runTransaction(async (t) => {
            const roomAssignment = await allocateRoom(
              db, t, student.department_id, student.course || '', student.branch_id || student.program || '', studentDoc.id,
            );
            t.update(studentDoc.ref, {
              roomNumber: roomAssignment.roomNumber,
              roomId: roomAssignment.roomId,
              plannerId: roomAssignment.plannerId,
              allocatedAt: roomAssignment.allocatedAt,
              allocationStatus: roomAssignment.allocationStatus,
              block: roomAssignment.block,
              capacity: roomAssignment.capacity,
              room_no:   roomAssignment.roomNumber ?? FieldValue.delete(),
              updatedAt: now,
            });
            if (roomAssignment.allocationStatus === 'ALLOCATED') {
              const auditRef = db.collection('room_allocations').doc();
              t.set(auditRef, {
                studentUid:     studentDoc.id,
                room:           roomAssignment.roomNumber,
                programme:      student.branch_id || student.program || '',
                planner:        roomAssignment.plannerId,
                allocatedBy:    'admin',
                allocatedAt:    now,
                // Legacy fields
                enrollment_no:  studentDoc.id,
                student_name:   student.full_name,
                department_id:  student.department_id,
                room_number:    roomAssignment.roomNumber,
                block:          roomAssignment.block,
                action:         'allocated',
                reason:         'admin_recalculate',
                performed_by:   'admin',
                allocated_at:   now,
              });
            }
            return roomAssignment;
          });
          if (result.allocationStatus === 'ALLOCATED') allocated++;
          else stillPending++;
        } catch (e) {
          console.error('Recalculate error for', studentDoc.id, e);
          stillPending++;
        }
      }

      return res.json({ ok: true, processed: pendingSnap.size, allocated, stillPending });
    }

    // ── REASSIGN (Admin Override with full audit trail) ──────────────────────
    if (action === 'reassign') {
      const { enrollment_no, new_room_number, reason = 'admin_override', performed_by = 'admin' } = payload;
      if (!enrollment_no || !new_room_number) {
        return res.status(400).json({ error: 'Missing enrollment_no or new_room_number' });
      }

      const studentRef = db.collection('students').doc(enrollment_no.toUpperCase().trim());
      const newRoomRef = db.collection('rooms').doc(new_room_number.toUpperCase().trim());

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

        const oldAssignment = student.roomAssignment;

        // Release old room
        if (oldAssignment?.roomNumber && oldAssignment.allocationStatus === 'allocated') {
          const oldRoomRef = db.collection('rooms').doc(oldAssignment.roomNumber);
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
          enrollment_no:    enrollment_no.toUpperCase().trim(),
          student_name:     student.full_name,
          department_id:    student.department_id,
          old_room_number:  oldAssignment?.roomNumber ?? null,
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
    }

    // ── BLOCK / MAINTENANCE ──────────────────────────────────────────────────
    if (action === 'block') {
      const { room_number, status = 'BLOCKED', reason = '' } = payload;
      if (!room_number) return res.status(400).json({ error: 'Missing room_number' });
      await db.collection('rooms').doc(room_number.toUpperCase()).update({
        status, blockReason: reason, updatedAt: now,
      });
      return res.json({ ok: true });
    }

    // ── ACTIVATE ─────────────────────────────────────────────────────────────
    if (action === 'activate') {
      const { room_number } = payload;
      if (!room_number) return res.status(400).json({ error: 'Missing room_number' });
      await db.collection('rooms').doc(room_number.toUpperCase()).update({
        status: 'ACTIVE', blockReason: null, updatedAt: now,
      });
      return res.json({ ok: true });
    }

    // ── CREATE ROOM ──────────────────────────────────────────────────────────
    if (action === 'create_room') {
      const { roomNumber, block, school, schoolCode, capacity, roomType, equipmentType, allocationOrder, status = 'ACTIVE' } = payload;
      if (!roomNumber || !school || !capacity) return res.status(400).json({ error: 'Missing required fields' });
      
      const ref = db.collection('rooms').doc(roomNumber.toUpperCase().trim());
      const snap = await ref.get();
      if (snap.exists) return res.status(400).json({ error: 'Room already exists' });
      
      const newRoom = {
        roomNumber: roomNumber.toUpperCase().trim(),
        block: block || '',
        school: school.toLowerCase().trim(),
        schoolCode: (schoolCode || school).toUpperCase().trim(),
        capacity: Number(capacity),
        occupancy: 0,
        remainingSeats: Number(capacity),
        status,
        roomType: roomType || 'classroom',
        equipmentType: equipmentType || '',
        allocationOrder: Number(allocationOrder) || 99,
        createdAt: now,
        updatedAt: now,
      };
      
      await ref.set(newRoom);
      return res.json({ ok: true, room: newRoom });
    }

    // ── UPDATE ROOM ──────────────────────────────────────────────────────────
    if (action === 'update_room') {
      const { originalRoomNumber, ...updates } = payload;
      if (!originalRoomNumber) return res.status(400).json({ error: 'Missing originalRoomNumber' });
      
      const ref = db.collection('rooms').doc(originalRoomNumber.toUpperCase().trim());
      const result = await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) throw new Error('Room not found');
        
        const oldRoom = snap.data()!;
        let newOccupancy = oldRoom.occupancy ?? 0;
        let newRemainingSeats = oldRoom.remainingSeats ?? oldRoom.capacity;
        
        // If capacity changes, adjust remaining seats
        if (updates.capacity !== undefined && updates.capacity !== oldRoom.capacity) {
          const capDiff = Number(updates.capacity) - oldRoom.capacity;
          newRemainingSeats = Math.max(0, newRemainingSeats + capDiff);
        }
        
        const updatedData = {
          ...oldRoom,
          ...updates,
          capacity: updates.capacity !== undefined ? Number(updates.capacity) : oldRoom.capacity,
          allocationOrder: updates.allocationOrder !== undefined ? Number(updates.allocationOrder) : oldRoom.allocationOrder,
          remainingSeats: newRemainingSeats,
          updatedAt: now,
        };
        
        // If room number changes, we need to create a new doc and delete the old one
        if (updates.roomNumber && updates.roomNumber.toUpperCase().trim() !== originalRoomNumber.toUpperCase().trim()) {
          const newRef = db.collection('rooms').doc(updates.roomNumber.toUpperCase().trim());
          const newSnap = await t.get(newRef);
          if (newSnap.exists) throw new Error('New room number already exists');
          
          updatedData.roomNumber = updates.roomNumber.toUpperCase().trim();
          t.set(newRef, updatedData);
          t.delete(ref);
        } else {
          t.update(ref, updatedData);
        }
        return { ok: true, room: updatedData };
      });
      return res.json(result);
    }

    // ── DELETE ROOM ──────────────────────────────────────────────────────────
    if (action === 'delete_room') {
      const { room_number } = payload;
      if (!room_number) return res.status(400).json({ error: 'Missing room_number' });
      
      const ref = db.collection('rooms').doc(room_number.toUpperCase().trim());
      const result = await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) throw new Error('Room not found');
        
        const room = snap.data()!;
        if ((room.occupancy ?? 0) > 0) {
          throw new Error('Cannot delete room with existing occupancy. Reassign students first.');
        }
        
        t.delete(ref);
        return { ok: true };
      });
      return res.json(result);
    }

    // ── RESET (Super Admin, requires confirmation token) ─────────────────────
    if (action === 'reset') {
      const { confirm } = payload;
      if (confirm !== 'CONFIRM_RESET_ALL_ROOMS') {
        return res.status(400).json({
          error: 'Missing confirmation. Send confirm: "CONFIRM_RESET_ALL_ROOMS"',
        });
      }

      // Reset all room occupancy counters
      const roomsSnap = await db.collection('rooms').get();
      const batch = db.batch();
      for (const doc of roomsSnap.docs) {
        const room = doc.data();
        batch.update(doc.ref, {
          occupancy:      0,
          remainingSeats: room.capacity,
          updatedAt:      now,
        });
      }
      await batch.commit();

      // Clear all student room assignments
      const studentsSnap = await db.collection('students').get();
      const studentBatch = db.batch();
      for (const doc of studentsSnap.docs) {
        studentBatch.update(doc.ref, {
          roomNumber: null,
          roomId: null,
          plannerId: null,
          block: null,
          capacity: null,
          allocatedAt: now,
          allocationStatus: 'PENDING',
          room_no: FieldValue.delete(),
          roomAssignment: FieldValue.delete(), // clear old legacy field if present
          updatedAt: now,
        });
      }
      await studentBatch.commit();

      // Audit
      await db.collection('room_allocations').add({
        action: 'reset_all', reason: 'admin_reset', performed_by: 'super_admin',
        allocated_at: now, enrollment_no: 'ALL', student_name: 'ALL',
      });

      return res.json({ ok: true, roomsReset: roomsSnap.size, studentsCleared: studentsSnap.size });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err: any) {
    console.error('[room-admin]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

/**
 * Room Allocation Engine — Aarambh 2026
 *
 * INTERNAL SERVER LIBRARY — never expose this as a public API endpoint.
 * Import this module only from API handlers that already enforce authentication.
 *
 * Algorithm: Sequential Fill with Firestore Transaction Safety
 *   1. Query the `rooms` collection filtered by school + ACTIVE status,
 *      ordered by allocationOrder (fills rooms one-by-one, in sequence).
 *   2. Find the first room with remainingSeats > 0 (O(1) in steady-state).
 *   3. Atomically decrement remainingSeats and increment occupancy.
 *   4. Return assignment details. Never throws — degrades to 'pending' on error.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomAssignment {
  roomNumber: string | null;
  block: string | null;
  school: string;
  schoolCode: string;
  capacity: number | null;
  allocatedAt: string;
  allocationStatus: 'allocated' | 'pending';
}

export interface RoomMasterEntry {
  roomNumber: string;
  block: string;
  school: string;       // lowercase, matches department_id on Student (e.g. "soet")
  schoolCode: string;   // uppercase display code (e.g. "SOET")
  capacity: number;
  roomType: string;
  equipmentType: string;
  allocationOrder: number; // sequential fill order within each school
}

// ── Allocation Engine ─────────────────────────────────────────────────────────

/**
 * Allocate a room inside an existing Firestore transaction.
 *
 * @param db            Firebase Admin Firestore instance
 * @param transaction   The running Firestore transaction
 * @param departmentId  Lowercase school ID (e.g. "soet") from the student document
 * @param enrollmentNo  For logging only — does not affect allocation logic
 * @returns             RoomAssignment with status 'allocated' | 'pending'
 */
export async function allocateRoom(
  db: Firestore,
  transaction: Transaction,
  departmentId: string,
  enrollmentNo: string,
): Promise<RoomAssignment> {
  const now = new Date().toISOString();
  const schoolCode = departmentId.toUpperCase();

  try {
    // Fetch rooms for this school ordered by allocationOrder.
    // Batch of 10 handles bursts where the leading room just hit capacity.
    // In steady-state only 1 room read is needed.
    const snap = await transaction.get(
      db.collection('rooms')
        .where('school', '==', departmentId)
        .where('status', '==', 'ACTIVE')
        .orderBy('allocationOrder', 'asc')
        .limit(10),
    );

    for (const roomDoc of snap.docs) {
      const room = roomDoc.data();
      // Use pre-computed remainingSeats; fall back to capacity - occupancy
      const remaining: number =
        room.remainingSeats ?? (room.capacity - (room.occupancy ?? 0));

      if (remaining > 0) {
        // ── Atomic seat reservation ───────────────────────────────────────
        transaction.update(roomDoc.ref, {
          occupancy:      (room.occupancy ?? 0) + 1,
          remainingSeats: remaining - 1,
          updatedAt:      now,
        });

        return {
          roomNumber:       room.roomNumber as string,
          block:            room.block as string,
          school:           departmentId,
          schoolCode:       (room.schoolCode as string) ?? schoolCode,
          capacity:         room.capacity as number,
          allocatedAt:      now,
          allocationStatus: 'allocated',
        };
      }
    }

    // All fetched rooms were full → pending
    return makePending(departmentId, schoolCode, now);
  } catch (err) {
    // Never block registration — log and degrade gracefully
    console.error(`[room-allocation] Error for ${enrollmentNo} (${departmentId}):`, err);
    return makePending(departmentId, schoolCode, now);
  }
}

function makePending(
  departmentId: string,
  schoolCode: string,
  now: string,
): RoomAssignment {
  return {
    roomNumber:       null,
    block:            null,
    school:           departmentId,
    schoolCode,
    capacity:         null,
    allocatedAt:      now,
    allocationStatus: 'pending',
  };
}

// ── Canonical Room Master Data ────────────────────────────────────────────────
// Source of truth: Room Allocation Master Sheet — Aarambh 2026
// allocationOrder is 1-indexed, sequential within each school for fill order.

export const ROOM_MASTER_DATA: RoomMasterEntry[] = [
  // ── SOLS — A Block, 2nd floor ────────────────────────────────────────────
  { roomNumber: 'A201', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 80,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 1  },
  { roomNumber: 'A202', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 2  },
  { roomNumber: 'A203', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 3  },
  { roomNumber: 'A204', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 60,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 4  },
  { roomNumber: 'A205', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 60,  roomType: 'classroom', equipmentType: 'Projector',   allocationOrder: 5  },
  { roomNumber: 'A206', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 6  },
  { roomNumber: 'A208', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 80,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 7  },
  { roomNumber: 'A209', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 80,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 8  },
  { roomNumber: 'A210', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 9  },
  { roomNumber: 'A211', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 10 },
  { roomNumber: 'A214', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 48,  roomType: 'classroom', equipmentType: '',            allocationOrder: 11 },
  { roomNumber: 'A215', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 80,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 12 },
  { roomNumber: 'A216', block: 'A', school: 'sols', schoolCode: 'SOLS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 13 },

  // ── SMAS — A Block + B Block + C Block ──────────────────────────────────
  { roomNumber: 'A213', block: 'A', school: 'smas', schoolCode: 'SMAS', capacity: 110, roomType: 'classroom', equipmentType: 'Laptop Recharge', allocationOrder: 1 },
  { roomNumber: 'B115', block: 'B', school: 'smas', schoolCode: 'SMAS', capacity: 48,  roomType: 'classroom', equipmentType: 'Projector',        allocationOrder: 2 },
  { roomNumber: 'B116', block: 'B', school: 'smas', schoolCode: 'SMAS', capacity: 48,  roomType: 'classroom', equipmentType: 'Projector',        allocationOrder: 3 },
  { roomNumber: 'B118', block: 'B', school: 'smas', schoolCode: 'SMAS', capacity: 48,  roomType: 'classroom', equipmentType: 'Projector',        allocationOrder: 4 },
  { roomNumber: 'B120', block: 'B', school: 'smas', schoolCode: 'SMAS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel',      allocationOrder: 5 },
  { roomNumber: 'B121', block: 'B', school: 'smas', schoolCode: 'SMAS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel',      allocationOrder: 6 },
  { roomNumber: 'B122', block: 'B', school: 'smas', schoolCode: 'SMAS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel',      allocationOrder: 7 },
  { roomNumber: 'B123', block: 'B', school: 'smas', schoolCode: 'SMAS', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel',      allocationOrder: 8 },
  { roomNumber: 'C301', block: 'C', school: 'smas', schoolCode: 'SMAS', capacity: 64,  roomType: 'classroom', equipmentType: 'Projector',        allocationOrder: 9 },

  // ── SOED — A Block, 3rd floor ────────────────────────────────────────────
  { roomNumber: 'A301', block: 'A', school: 'soed', schoolCode: 'SOED', capacity: 80, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 1 },
  { roomNumber: 'A302', block: 'A', school: 'soed', schoolCode: 'SOED', capacity: 60, roomType: 'classroom', equipmentType: 'Projector',   allocationOrder: 2 },

  // ── SOLA — A Block, 3rd floor ────────────────────────────────────────────
  { roomNumber: 'A303', block: 'A', school: 'sola', schoolCode: 'SOLA', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 1 },
  { roomNumber: 'A304', block: 'A', school: 'sola', schoolCode: 'SOLA', capacity: 60, roomType: 'classroom', equipmentType: 'Projector',   allocationOrder: 2 },
  { roomNumber: 'A305', block: 'A', school: 'sola', schoolCode: 'SOLA', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 3 },

  // ── SBAS — B Block, ground floor ─────────────────────────────────────────
  { roomNumber: 'B010', block: 'B', school: 'sbas', schoolCode: 'SBAS', capacity: 60, roomType: 'classroom', equipmentType: 'Projector',   allocationOrder: 1 },
  { roomNumber: 'B011', block: 'B', school: 'sbas', schoolCode: 'SBAS', capacity: 48, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 2 },
  { roomNumber: 'B012', block: 'B', school: 'sbas', schoolCode: 'SBAS', capacity: 48, roomType: 'classroom', equipmentType: 'Projector',   allocationOrder: 3 },
  { roomNumber: 'B013', block: 'B', school: 'sbas', schoolCode: 'SBAS', capacity: 48, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 4 },
  { roomNumber: 'B014', block: 'B', school: 'sbas', schoolCode: 'SBAS', capacity: 48, roomType: 'classroom', equipmentType: '',            allocationOrder: 5 },
  { roomNumber: 'B016', block: 'B', school: 'sbas', schoolCode: 'SBAS', capacity: 48, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 6 },

  // ── SPRS — B Block, 3rd floor ────────────────────────────────────────────
  { roomNumber: 'B312', block: 'B', school: 'sprs', schoolCode: 'SPRS', capacity: 48, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 1 },

  // ── SEMC (SEMCE) — C Block, 1st floor ────────────────────────────────────
  // Note: department_id in the registration form is "semc"; master sheet labels it SEMCE.
  { roomNumber: 'C104', block: 'C', school: 'semc', schoolCode: 'SEMCE', capacity: 64, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 1 },
  { roomNumber: 'C106', block: 'C', school: 'semc', schoolCode: 'SEMCE', capacity: 64, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 2 },

  // ── SOAD — C Block, Design Studios ──────────────────────────────────────
  { roomNumber: 'C201', block: 'C', school: 'soad', schoolCode: 'SOAD', capacity: 110, roomType: 'design_studio', equipmentType: 'Design Studio V',  allocationOrder: 1 },
  { roomNumber: 'C213', block: 'C', school: 'soad', schoolCode: 'SOAD', capacity: 110, roomType: 'design_studio', equipmentType: 'Design Studio II', allocationOrder: 2 },

  // ── SOMC — C Block ───────────────────────────────────────────────────────
  { roomNumber: 'C319', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 110, roomType: 'classroom', equipmentType: 'Laptop Recharge', allocationOrder: 1 },
  { roomNumber: 'C406', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 64,  roomType: 'classroom', equipmentType: 'Smart Panel',     allocationOrder: 2 },
  { roomNumber: 'C407', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 64,  roomType: 'classroom', equipmentType: 'Smart Panel',     allocationOrder: 3 },
  { roomNumber: 'C408', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 64,  roomType: 'classroom', equipmentType: 'Smart Panel',     allocationOrder: 4 },
  { roomNumber: 'C410', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 64,  roomType: 'classroom', equipmentType: 'Smart Panel',     allocationOrder: 5 },
  { roomNumber: 'C411', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 48,  roomType: 'classroom', equipmentType: 'Smart Panel',     allocationOrder: 6 },
  { roomNumber: 'C415', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 110, roomType: 'classroom', equipmentType: 'Laptop Recharge', allocationOrder: 7 },
  { roomNumber: 'C416', block: 'C', school: 'somc', schoolCode: 'SOMC', capacity: 110, roomType: 'classroom', equipmentType: 'Laptop Recharge', allocationOrder: 8 },

  // ── SOET — D Block ───────────────────────────────────────────────────────
  { roomNumber: 'D003', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 1  },
  { roomNumber: 'D004', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 2  },
  { roomNumber: 'D005', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 3  },
  { roomNumber: 'D006', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 4  },
  { roomNumber: 'D007', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 5  },
  { roomNumber: 'D008', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 6  },
  { roomNumber: 'D009', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 7  },
  { roomNumber: 'D011', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 8  },
  { roomNumber: 'D015', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 9  },
  { roomNumber: 'D017', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 10 },
  { roomNumber: 'D019', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 11 },
  { roomNumber: 'D021', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 12 },
  { roomNumber: 'D106', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 13 },
  { roomNumber: 'D107', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 14 },
  { roomNumber: 'D108', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 15 },
  { roomNumber: 'D109', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 16 },
  { roomNumber: 'D110', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 17 },
  { roomNumber: 'D111', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 18 },
  { roomNumber: 'D113', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 19 },
  { roomNumber: 'D115', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 20 },
  { roomNumber: 'D119', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 21 },
  { roomNumber: 'D121', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 22 },
  { roomNumber: 'D123', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 23 },
  { roomNumber: 'D125', block: 'D', school: 'soet', schoolCode: 'SOET', capacity: 60, roomType: 'classroom', equipmentType: 'Smart Panel', allocationOrder: 24 },
];

/** Total capacity for a given school across all its rooms. */
export function getSchoolCapacity(school: string): number {
  return ROOM_MASTER_DATA
    .filter(r => r.school === school)
    .reduce((sum, r) => sum + r.capacity, 0);
}

/** All distinct school IDs present in the master data. */
export const ALL_SCHOOLS = [...new Set(ROOM_MASTER_DATA.map(r => r.school))];

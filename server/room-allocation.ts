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
import { getRedis } from './redis.js';

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
    const redis = getRedis();
    const availableRooms = ROOM_MASTER_DATA
      .filter(r => r.school === departmentId)
      .sort((a,b) => a.allocationOrder - b.allocationOrder);

    // Redis LUA Script for atomic sequential fill
    const LUA_ALLOCATE = `
      local prefix = KEYS[1]
      local rooms = cjson.decode(ARGV[1])
      
      for i, room in ipairs(rooms) do
        local key = prefix .. room.roomNumber
        local current = redis.call('GET', key)
        
        if not current then
          -- Initialize capacity and take one seat
          redis.call('SET', key, room.capacity - 1)
          return room.roomNumber
        else
          local num = tonumber(current)
          if num > 0 then
            redis.call('DECR', key)
            return room.roomNumber
          end
        end
      end
      
      return nil
    `;

    const roomsJson = JSON.stringify(
      availableRooms.map(r => ({ roomNumber: r.roomNumber, capacity: r.capacity }))
    );
    
    const allocatedRoomNumber = await redis.eval(LUA_ALLOCATE, ["room_seats:"], [roomsJson]) as string | null;

    if (allocatedRoomNumber) {
      const room = availableRooms.find(r => r.roomNumber === allocatedRoomNumber)!;
      
      // Update Firestore Room Document using exact ID (avoid query index locks)
      // This will still have 1 write/sec contention per room, but it's partitioned across rooms.
      const roomRef = db.collection('rooms').doc(allocatedRoomNumber);
      const roomDoc = await transaction.get(roomRef);
      if (roomDoc.exists) {
        const roomData = roomDoc.data()!;
        transaction.update(roomRef, {
          occupancy:      (roomData.occupancy ?? 0) + 1,
          remainingSeats: (roomData.remainingSeats ?? roomData.capacity) - 1,
          updatedAt:      now,
        });
      }

      return {
        roomNumber:       room.roomNumber,
        block:            room.block,
        school:           departmentId,
        schoolCode:       room.schoolCode || schoolCode,
        capacity:         room.capacity,
        allocatedAt:      now,
        allocationStatus: 'allocated',
      };
    }

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

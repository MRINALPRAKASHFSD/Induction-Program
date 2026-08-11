/**
 * Room Allocation Engine — Aarambh 2026
 *
 * INTERNAL SERVER LIBRARY — never expose this as a public API endpoint.
 * Import this module only from API handlers that already enforce authentication.
 *
 * Algorithm: Planner-Driven Dynamic Allocation
 *   1. Resolve active planner ID (cached via Redis).
 *   2. Query `induction_room_allocations` for the programme mapping.
 *   3. Fetch Candidate Rooms from the `rooms` runtime collection.
 *   4. Use Redis as a fast selector/load-balancer to pick a candidate.
 *   5. Verify `remainingSeats > 0` in Firestore (the absolute source of truth).
 *   6. Atomically decrement remainingSeats and increment occupancy.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { getRedis } from './redis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomAssignment {
  roomNumber: string | null;
  roomId: string | null;
  plannerId: string | null;
  block: string | null;
  school: string;
  capacity: number | null;
  allocatedAt: string;
  allocationStatus: 'ALLOCATED' | 'PENDING';
}

function buildMappingKey(schoolCode: string, course: string, programme: string): string {
  return `${schoolCode.toLowerCase().trim()}|${course.toLowerCase().trim()}|${(programme || '').toLowerCase().trim()}`;
}

// ── Allocation Engine ─────────────────────────────────────────────────────────

export async function allocateRoom(
  db: Firestore,
  transaction: Transaction,
  departmentId: string,
  course: string,
  branchId: string | null | undefined,
  enrollmentNo: string,
): Promise<RoomAssignment> {
  const now = new Date().toISOString();
  const schoolCode = departmentId.toUpperCase();
  const programme = branchId || '';

  try {
    const redis = getRedis();
    
    // 1. Resolve Active Planner (with Redis caching)
    let plannerId = (await redis.get('planner_active')) as string | null;
    if (!plannerId) {
      const plannerSnap = await db.collection('induction_planners')
        .where('status', '==', 'PUBLISHED')
        .limit(1)
        .get();
      
      if (plannerSnap.empty) {
        return makePending(departmentId, now);
      }
      plannerId = plannerSnap.docs[0].id;
      // Cache for 60 seconds to avoid massive read spikes
      await redis.setex('planner_active', 60, plannerId);
    }

    // 2. Mapping Lookup
    // Try Programme -> Course -> School level mappings
    const keysToTry = [
      buildMappingKey(departmentId, course, programme),
      buildMappingKey(departmentId, course, course),
      buildMappingKey(departmentId, course, ''),
      buildMappingKey(departmentId, '', '')
    ];

    let mappedRooms: any[] = [];
    
    for (const key of keysToTry) {
      const mappingSnap = await db.collection('induction_room_allocations')
        .where('plannerId', '==', plannerId)
        .where('mappingKey', '==', key)
        .get();
        
      if (!mappingSnap.empty) {
        mappedRooms = mappingSnap.docs.map(d => d.data());
        break; // Found the most specific mapping
      }
    }

    if (mappedRooms.length === 0) {
      return makePending(departmentId, now, plannerId);
    }

    const roomNumbers = mappedRooms.map(r => r.roomNumber);

    // 3. Batch Fetch Runtime State
    // We cannot use 'in' queries easily within a transaction without doing get() on refs.
    const roomRefs = roomNumbers.map(r => db.collection('rooms').doc(r));
    const roomsSnap = await transaction.getAll(...roomRefs);
    
    const availableRooms = roomsSnap
      .map(d => ({ id: d.id, exists: d.exists, data: d.data() as any }))
      .filter(r => r.exists && r.data.status === 'ACTIVE' && r.data.remainingSeats > 0);

    if (availableRooms.length === 0) {
      return makePending(departmentId, now, plannerId);
    }

    // 4. Redis Selection (Load Balancer)
    // Pass the available rooms to Redis to pick one (to avoid all concurrent requests picking the exact same room and causing tx retries)
    const LUA_SELECT = `
      local prefix = KEYS[1]
      local rooms = cjson.decode(ARGV[1])
      
      for i, room in ipairs(rooms) do
        local key = prefix .. room.roomNumber
        local current = redis.call('GET', key)
        
        if not current then
          if room.remainingSeats > 0 then
            redis.call('SET', key, room.remainingSeats - 1)
            return room.roomNumber
          end
        else
          local num = tonumber(current)
          if num > 0 then
            redis.call('DECR', key)
            return room.roomNumber
          end
        end
      end
      
      -- Fallback: just return the first one if Redis state is mismatched
      return rooms[1].roomNumber
    `;

    const roomsJson = JSON.stringify(
      availableRooms.map(r => ({ 
        roomNumber: r.id, 
        remainingSeats: r.data.remainingSeats 
      }))
    );
    
    let selectedRoomNumber = await redis.eval(LUA_SELECT, [`alloc_seats:${plannerId}:`], [roomsJson]) as string;
    
    // 5. Firestore Source of Truth Verification
    let candidate = availableRooms.find(r => r.id === selectedRoomNumber);
    
    // If the Redis-selected room is somehow out of sync and full in Firestore, pick the first available one from our Firestore snapshot.
    if (!candidate || candidate.data.remainingSeats <= 0) {
      candidate = availableRooms.find(r => r.data.remainingSeats > 0);
    }

    if (candidate && candidate.data.remainingSeats > 0) {
      const roomRef = db.collection('rooms').doc(candidate.id);
      
      // Update Runtime Room Collection
      transaction.update(roomRef, {
        occupancy: (candidate.data.occupancy || 0) + 1,
        remainingSeats: candidate.data.remainingSeats - 1,
        updatedAt: now,
      });

      return {
        roomNumber:       candidate.id,
        roomId:           candidate.id,
        plannerId:        plannerId,
        block:            candidate.data.block || null,
        school:           departmentId,
        capacity:         candidate.data.capacity,
        allocatedAt:      now,
        allocationStatus: 'ALLOCATED',
      };
    }

    return makePending(departmentId, now, plannerId);
  } catch (err) {
    console.error(`[room-allocation] Error for ${enrollmentNo} (${departmentId}):`, err);
    return makePending(departmentId, now, null);
  }
}

function makePending(
  departmentId: string,
  now: string,
  plannerId: string | null = null
): RoomAssignment {
  return {
    roomNumber:       null,
    roomId:           null,
    plannerId:        plannerId,
    block:            null,
    school:           departmentId,
    capacity:         null,
    allocatedAt:      now,
    allocationStatus: 'PENDING',
  };
}

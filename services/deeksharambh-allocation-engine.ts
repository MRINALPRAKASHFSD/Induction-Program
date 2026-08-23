/**
 * services/deeksharambh-allocation-engine.ts
 *
 * Shared, reusable allocation engine for Deeksharambh induction.
 * Used by:
 *   - scripts/generate-final-room-allocation.ts  (batch migration)
 *   - api/induction-register.ts                  (new student auto-allocation)
 *
 * Allocation Priority:
 *   L1 — Exact:          schoolCode + programme + section → room
 *   L2 — Prog + School:  schoolCode + normalized(programme) → room (if only 1 match)
 *   L3 — Capacity Seq:   schoolCode + normalized(programme) → multiple rooms, fill sequentially by studentId sort
 *   L4 — Prog-only:      normalized(programme) across all schools (handles bad school field)
 *
 * Schedule Rule:
 *   All sessions in JSON where room_id === student's allocated roomNumber.
 *   No programme-based session filtering.
 *
 * Output schema:
 *   induction_student_room_allocations/{plannerId}_{studentId}
 *   induction_student_schedule/{plannerId}_{studentId}
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { normalizeProgramme } from '../config/programme-mapping.js';

export const PLANNER_ID      = 'planner_2026_v29';
export const ALLOCATION_VER  = 'v1';
export const INDUCTION_START = '2026-08-24';   // Sessions before this date are excluded
const JSON_PATH = path.join(os.homedir(), 'Downloads', 'deeksharambh_2026_schedule.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NormalizedRoom {
  roomNumber: string;
  schoolCode: string;
  programme:  string;   // Stripped of "— Section X" suffix
  section:    string;   // "A", "B", etc. or ""
  block:      string;
  capacity:   number;
}

export interface StudentAllocDoc {
  studentId:         string;
  email:             string;
  plannerId:         string;
  allocationVersion: string;
  allocationMethod:  'EXACT_MATCH' | 'CAPACITY_DISTRIBUTION' | 'PROGRAMME_ONLY';
  allocationStatus:  'ALLOCATED' | 'PENDING_REVIEW';
  roomNumber:        string;
  block:             string;
  floor:             string;
  capacity:          number;
  schoolCode:        string;
  programme:         string;
  section:           string | null;
  allocatedAt:       string;
  updatedAt:         string;
}

export interface SessionSlot {
  startTime:   string;
  endTime:     string;
  sessionName: string;
  venue:       string;
  sessionType: string;
  date:        string;
  day:         number;
}

export interface DaySchedule {
  date:      string;
  dayNumber: number;
  sessions:  SessionSlot[];
}

export interface StudentScheduleDoc {
  studentId:  string;
  plannerId:  string;
  roomNumber: string;
  days:       DaySchedule[];
  updatedAt:  string;
}

export interface AllocationResult {
  allocDoc:    StudentAllocDoc | null;
  scheduleDoc: StudentScheduleDoc | null;
  reason?:     string;           // populated when allocDoc is null
}

// ── Planner JSON loading ───────────────────────────────────────────────────────

let _cachedPlannerJson: any = null;

export function loadPlannerJson(): any {
  if (_cachedPlannerJson) return _cachedPlannerJson;
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`Planner JSON not found at ${JSON_PATH}`);
  }
  _cachedPlannerJson = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  return _cachedPlannerJson;
}

// ── Parse rooms once ──────────────────────────────────────────────────────────

let _cachedRooms: NormalizedRoom[] | null = null;
let _cachedSessionsByRoom: Record<string, any[]> | null = null;

export function getParsedRooms(): NormalizedRoom[] {
  if (_cachedRooms) return _cachedRooms;
  const data      = loadPlannerJson();
  const rawRooms  = data.rooms || {};
  const rooms: NormalizedRoom[] = [];

  for (const key in rawRooms) {
    const r        = rawRooms[key];
    const progRaw  = (r.program || '').trim();
    let prog       = progRaw;
    let section    = '';

    // "B.Tech (CSE) — Section A" → prog="B.Tech (CSE)", section="A"
    const sectionMatch = progRaw.match(/^(.*?)\s*[—\-–]\s*Section\s+([A-Za-z0-9]+)/i);
    if (sectionMatch) {
      prog    = sectionMatch[1].trim();
      section = sectionMatch[2].trim().toUpperCase();
    }
    // Strip trailing " (D207)" room qualifiers
    prog = prog.replace(/\s*\([A-Z]\d{3,4}\)\s*$/, '').trim();

    rooms.push({
      roomNumber: r.room_id    || key,
      schoolCode: r.school_code|| '',
      programme:  prog,
      section:    section,
      block:      r.block      || '',
      capacity:   Number(r.capacity) || 60,
    });
  }
  _cachedRooms = rooms;
  return rooms;
}

export function getSessionsByRoom(): Record<string, any[]> {
  if (_cachedSessionsByRoom) return _cachedSessionsByRoom;
  const data        = loadPlannerJson();
  const rawSessions = data.sessions || [];
  const byRoom: Record<string, any[]> = {};

  for (const s of rawSessions) {
    const rid = s.room_id || '';
    if (!rid) continue;
    if (!byRoom[rid]) byRoom[rid] = [];
    byRoom[rid].push(s);
  }
  _cachedSessionsByRoom = byRoom;
  return byRoom;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function inferFloor(roomNumber: string): string {
  if (roomNumber.length >= 4) {
    const floorNum = parseInt(roomNumber[1], 10);
    if (!isNaN(floorNum)) {
      if (floorNum === 0) return 'Ground Floor';
      if (floorNum === 1) return '1st Floor';
      if (floorNum === 2) return '2nd Floor';
      if (floorNum === 3) return '3rd Floor';
      return `${floorNum}th Floor`;
    }
  }
  return '';
}

export function schoolNameToCode(name: string): string {
  const n = (name || '').toLowerCase().trim();
  if (!n) return '';
  if (n === 'soet' || n.includes('engineering') || n.includes('technology')) return 'SOET';
  if (n === 'sols' || n.includes('law')  || n.includes('legal'))             return 'SOLS';
  if (n === 'somc' || n.includes('management') || n.includes('commerce') || n.includes('business')) return 'SOMC';
  if (n === 'smas' || n.includes('medical') || n.includes('allied') || n.includes('pharmacy'))      return 'SMAS';
  if (n === 'soad' || n.includes('architecture') || n.includes('design'))    return 'SOAD';
  if (n === 'sbas' || n.includes('basic') || n.includes('applied science'))  return 'SBAS';
  if (n === 'sola' || n.includes('liberal') || n.includes('humanities'))     return 'SOLA';
  if (n === 'semce'|| n.includes('media') || n.includes('creator') || n.includes('journalism')) return 'SEMCE';
  if (n === 'soas' || n.includes('agri'))                                    return 'SOAS';
  if (n === 'sprs' || n.includes('physio') || n.includes('rehabilitation'))  return 'SPRS';
  if (n === 'soed' || n.includes('education'))                               return 'SOED';
  // If already a code-like string, return uppercase
  if (/^[a-z]{3,6}$/.test(n)) return n.toUpperCase();
  return name.trim().toUpperCase();
}

function buildScheduleDoc(
  studentId: string,
  roomNumber: string,
  sessionsByRoom: Record<string, any[]>
): StudentScheduleDoc {
  const rawSessions = sessionsByRoom[roomNumber] || [];
  const now         = new Date().toISOString();

  // Group by date, filter out pre-induction dates
  const dayMap = new Map<string, { dayNumber: number; sessions: SessionSlot[] }>();

  for (const s of rawSessions) {
    const date = (s.date || '').trim();
    if (!date || date < INDUCTION_START) continue;   // Skip pre-24-Aug sessions

    if (!dayMap.has(date)) {
      dayMap.set(date, { dayNumber: Number(s.day) || 0, sessions: [] });
    }
    dayMap.get(date)!.sessions.push({
      startTime:   s.start_time   || '',
      endTime:     s.end_time     || '',
      sessionName: s.session_name || '',
      venue:       s.room_id      || roomNumber,
      sessionType: s.session_type || '',
      date,
      day:         Number(s.day) || 0,
    });
  }

  // Sort sessions within each day
  for (const day of dayMap.values()) {
    day.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // Build sorted days array
  const days: DaySchedule[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { dayNumber, sessions }]) => ({ date, dayNumber, sessions }));

  return {
    studentId,
    plannerId: PLANNER_ID,
    roomNumber,
    days,
    updatedAt: now,
  };
}

// ── Room occupancy tracker (per-process, for batch allocation) ────────────────
// For single-student allocation (registration trigger), we read current counts from Firestore.

export interface OccupancyMap {
  get(room: string): number;
  increment(room: string): void;
}

export function createInMemoryOccupancy(rooms: NormalizedRoom[]): OccupancyMap {
  const map = new Map<string, number>();
  for (const r of rooms) map.set(r.roomNumber, 0);
  return {
    get: (room: string) => map.get(room) ?? 0,
    increment: (room: string) => map.set(room, (map.get(room) ?? 0) + 1),
  };
}

// ── Core allocation function ──────────────────────────────────────────────────

/**
 * Allocate a single student to a room.
 *
 * @param student       - Student record (from Firestore or any source)
 * @param occupancy     - OccupancyMap tracking current room fill
 * @param rooms         - All NormalizedRoom objects from the planner JSON
 * @param sessionsByRoom - Sessions indexed by room_id
 * @returns AllocationResult with allocDoc and scheduleDoc (both null if unallocatable)
 */
export function allocateStudent(
  student: { id: string; email?: string; [key: string]: any },
  occupancy: OccupancyMap,
  rooms:    NormalizedRoom[],
  sessionsByRoom: Record<string, any[]>,
): AllocationResult {
  const now       = new Date().toISOString();
  const studentId = String(student.id);
  const email     = student.email || '';

  // ── Extract student fields ─────────────────────────────────────────────────
  const rawDept   = student.department_id || student.schoolCode || student.school || '';
  const rawCourse = student.course        || student.programme  || student.branch_id || '';
  const rawBranch = student.branch_id     || student.branch     || '';

  let sSchool  = rawDept;
  let sProgRaw = rawCourse;

  // Detect field swap: if one field contains "School of", it's the school
  const allFields  = [rawDept, rawCourse, rawBranch].filter(Boolean);
  const schoolLike = allFields.find(f => /school of|faculty of/i.test(f));
  if (schoolLike) {
    sSchool  = schoolLike;
    sProgRaw = allFields.find(f => f !== schoolLike) || '';
  } else if (!sSchool && rawCourse && rawBranch) {
    sSchool  = rawCourse;
    sProgRaw = rawBranch;
  }

  const schoolCode     = schoolNameToCode(sSchool);
  const sSec           = (student.section || '').trim().toUpperCase();
  const normalizedProg = normalizeProgramme(sProgRaw);

  let matchedRoom: NormalizedRoom | null = null;
  let method: StudentAllocDoc['allocationMethod'] = 'EXACT_MATCH';

  // ── L1: Exact match (schoolCode + programme + section) ───────────────────
  if (sSec) {
    const exact = rooms.find(r =>
      r.schoolCode === schoolCode &&
      r.programme  === normalizedProg &&
      r.section    === sSec
    );
    if (exact) { matchedRoom = exact; method = 'EXACT_MATCH'; }
  }

  // ── L2 / L3: Programme + school match ────────────────────────────────────
  if (!matchedRoom) {
    const progRooms = rooms.filter(r =>
      r.schoolCode === schoolCode &&
      r.programme  === normalizedProg
    );

    if (progRooms.length === 1) {
      matchedRoom = progRooms[0];
      method = 'EXACT_MATCH';
    } else if (progRooms.length > 1) {
      // L3: capacity-balanced sequential distribution
      method = 'CAPACITY_DISTRIBUTION';
      progRooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
      for (const room of progRooms) {
        if (occupancy.get(room.roomNumber) < room.capacity) {
          matchedRoom = room;
          break;
        }
      }
      // Safety overflow: all rooms full → last room
      if (!matchedRoom) matchedRoom = progRooms[progRooms.length - 1];
    }
  }

  // ── L4: Programme-only fallback (handles bad/missing school field) ─────────
  if (!matchedRoom) {
    const progOnly = rooms.filter(r => r.programme === normalizedProg);

    if (progOnly.length === 1) {
      matchedRoom = progOnly[0];
      method = 'PROGRAMME_ONLY';
    } else if (progOnly.length > 1) {
      method = 'PROGRAMME_ONLY';
      progOnly.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
      for (const room of progOnly) {
        if (occupancy.get(room.roomNumber) < room.capacity) {
          matchedRoom = room;
          break;
        }
      }
      if (!matchedRoom) matchedRoom = progOnly[progOnly.length - 1];
    }
  }

  if (!matchedRoom) {
    return {
      allocDoc:    null,
      scheduleDoc: null,
      reason: `No rooms found for programme "${normalizedProg}" (school: "${schoolCode}")`,
    };
  }

  // ── Capacity guard ────────────────────────────────────────────────────────
  if (occupancy.get(matchedRoom.roomNumber) >= matchedRoom.capacity) {
    // Overflow — we still allocate (admin can review), but flag it
    console.warn(`[allocation-engine] Room ${matchedRoom.roomNumber} at capacity (${matchedRoom.capacity}). Overflowing student ${studentId}.`);
  }

  occupancy.increment(matchedRoom.roomNumber);

  const allocDoc: StudentAllocDoc = {
    studentId,
    email,
    plannerId:         PLANNER_ID,
    allocationVersion: ALLOCATION_VER,
    allocationMethod:  method,
    allocationStatus:  'ALLOCATED',
    roomNumber:        matchedRoom.roomNumber,
    block:             matchedRoom.block,
    floor:             inferFloor(matchedRoom.roomNumber),
    capacity:          matchedRoom.capacity,
    schoolCode:        matchedRoom.schoolCode || schoolCode,
    programme:         matchedRoom.programme,
    section:           sSec || matchedRoom.section || null,
    allocatedAt:       now,
    updatedAt:         now,
  };

  const scheduleDoc = buildScheduleDoc(studentId, matchedRoom.roomNumber, sessionsByRoom);

  return { allocDoc, scheduleDoc };
}

export type LocalStudent = {
  id: string;
  full_name: string;
  enrollment_no: string;
  branch: string;
  semester: string;
  created_at: string;
  room_no?: string; // e.g. "A109" — undefined means not yet allocated
  department_id?: string;
  profile_picture_url?: string;
  photo_url?: string;
};

// ─── Room Allocation Configuration ────────────────────────────────────────
// Format: [Block][Floor][Room padded 2 digits] → e.g. A101, A113, B215, C315
export const ROOM_CONFIG = {
  blocks: ["A", "B", "C"] as const,
  floors: [1, 2, 3] as const,
  roomsPerFloor: 15, // rooms 01–15 on each floor
  defaultCapacity: 72, // standard max students per room
  /**
   * Rooms with a higher-than-default student capacity.
   * A113, A213, A313 are large lecture halls — each holds 100 students.
   */
  specialRooms: { A113: 100, A213: 100, A313: 100 } as Record<string, number>,
};

/** Return the maximum student capacity for a given room number.
 *  Special rooms (A113/A213/A313) → 100; all others → 72. */
export function getRoomCapacity(roomNo: string): number {
  return ROOM_CONFIG.specialRooms[roomNo] ?? ROOM_CONFIG.defaultCapacity;
}

/** Generate all valid room IDs in fill order: A101→A115, A201→A315, B101→C315. */
export function generateAllRooms(): string[] {
  const rooms: string[] = [];
  for (const block of ROOM_CONFIG.blocks) {
    for (const floor of ROOM_CONFIG.floors) {
      for (let r = 1; r <= ROOM_CONFIG.roomsPerFloor; r++) {
        rooms.push(`${block}${floor}${String(r).padStart(2, "0")}`);
      }
    }
  }
  return rooms;
}

/** Total student capacity across every room in all blocks. */
export function getTotalStudentCapacity(): number {
  return generateAllRooms().reduce((sum, r) => sum + getRoomCapacity(r), 0);
}

/** Sparse map: room number → current number of students assigned to it. */
export type RoomOccupancy = Record<string, number>;

export type LocalSession = {
  id: string;
  title: string;
  created_at: string;
  is_active: boolean;
};

export type LocalEvent = {
  id: string;
  title: string;
  description: string | null;
  day_number: number;
  venue: string;
  starts_at: string;
  ends_at: string;
  qr_token: string;
  is_active: boolean;
};

export type LocalClub = {
  id: string;
  name: string;
  tagline: string;
  description: string | null;
  imageUrl: string | null;
  whatsappGroup: string;
  capacity: number;
  registeredCount: number;
  isRegistrationOpen: boolean;
  visible: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type LocalAttendance = {
  id: string;
  session_id: string;
  enrollment_no: string;
  student_name: string;
  scanned_at: string;
};

export type LocalActivityLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: any;
  created_at: string;
};

class LocalDB {
  private get<T>(key: string): T[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private set(key: string, value: any) {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
    // Dispatch custom event to notify other components/tabs in the same origin
    window.dispatchEvent(new Event("local-db-update"));
  }

  // --- Activity Logs ---
  logActivity(action: string, entity: string, entity_id: string | null, meta: any = {}) {
    const logs = this.get<LocalActivityLog>("krmu_local_activity_logs");
    const log: LocalActivityLog = {
      id: "log_" + Date.now() + Math.random().toString(36).substring(2, 9),
      actor_id: "admin",
      action,
      entity,
      entity_id,
      meta,
      created_at: new Date().toISOString()
    };
    this.set("krmu_local_activity_logs", [log, ...logs].slice(0, 500)); // keep last 500
  }

  getActivityLogs(): LocalActivityLog[] {
    return this.get<LocalActivityLog>("krmu_local_activity_logs");
  }

  // --- Students ---
  getStudentProfile(): LocalStudent | null {
    if (typeof window === "undefined") return null;
    const data = localStorage.getItem("krmu_active_profile");
    return data ? JSON.parse(data) : null;
  }

  saveStudentProfile(student: LocalStudent) {
    if (typeof window === "undefined") return;
    localStorage.setItem("krmu_active_profile", JSON.stringify(student));
    
    // Also add to global students list if not present
    const students = this.get<LocalStudent>("krmu_local_students");
    if (!students.find((s) => s.enrollment_no === student.enrollment_no)) {
      this.set("krmu_local_students", [...students, student]);
      this.logActivity("student.register", "students", student.id, { name: student.full_name, enrollment: student.enrollment_no });
    }
  }

  getStudent(enrollment_no: string): LocalStudent | null {
    const students = this.get<LocalStudent>("krmu_local_students");
    return students.find((s) => s.enrollment_no === enrollment_no) || null;
  }

  getStudents(): LocalStudent[] {
    return this.get<LocalStudent>("krmu_local_students");
  }

  // --- Sessions (Admin) ---
  getSessions(): LocalSession[] {
    return this.get<LocalSession>("krmu_local_sessions").sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  createSession(title: string): LocalSession {
    const sessions = this.get<LocalSession>("krmu_local_sessions");
    // deactivate others
    const updated = sessions.map((s) => ({ ...s, is_active: false }));
    const newSession: LocalSession = {
      id: "sess_" + Date.now() + Math.random().toString(36).substring(2, 9),
      title,
      created_at: new Date().toISOString(),
      is_active: true,
    };
    this.set("krmu_local_sessions", [newSession, ...updated]);
    this.logActivity("session.create", "sessions", newSession.id, { title });
    return newSession;
  }

  getActiveSession(): LocalSession | null {
    return this.getSessions().find((s) => s.is_active) || null;
  }

  activateSession(id: string) {
    const sessions = this.get<LocalSession>("krmu_local_sessions");
    const updated = sessions.map((s) => ({ ...s, is_active: s.id === id }));
    this.set("krmu_local_sessions", updated);
    this.logActivity("session.activate", "sessions", id, {});
  }

  // --- Attendance ---
  getAttendanceForSession(sessionId: string): LocalAttendance[] {
    return this.get<LocalAttendance>("krmu_local_attendance")
      .filter((a) => a.session_id === sessionId)
      .sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());
  }

  getAllAttendance(): LocalAttendance[] {
    return this.get<LocalAttendance>("krmu_local_attendance");
  }

  hasAttended(sessionId: string, enrollment_no: string): boolean {
    return this.get<LocalAttendance>("krmu_local_attendance").some(
      (a) => a.session_id === sessionId && a.enrollment_no === enrollment_no
    );
  }

  markAttendance(sessionId: string, student: LocalStudent): { ok: boolean; message: string } {
    if (this.hasAttended(sessionId, student.enrollment_no)) {
      return { ok: false, message: "Attendance already recorded for this session." };
    }

    const attendance = this.get<LocalAttendance>("krmu_local_attendance");
    const record: LocalAttendance = {
      id: "att_" + Date.now() + Math.random().toString(36).substring(2, 9),
      session_id: sessionId,
      enrollment_no: student.enrollment_no,
      student_name: student.full_name,
      scanned_at: new Date().toISOString(),
    };

    this.set("krmu_local_attendance", [...attendance, record]);
    this.logActivity("attendance.mark", "attendance", record.id, { student_name: student.full_name, enrollment: student.enrollment_no });
    return { ok: true, message: "Attendance marked successfully." };
  }
  // --- Club Registrations ---
  getClubRegistrations(): { id: string; enrollment_no: string; club_slug: string; created_at: string }[] {
    return this.get("krmu_local_club_registrations");
  }

  registerForClub(enrollment_no: string, club_slug: string): { ok: boolean; error?: string; duplicate?: boolean; club?: string } {
    const student = this.getStudent(enrollment_no);
    if (!student) return { ok: false, error: "Please register as a student first." };

    const registrations = this.getClubRegistrations();
    const isDuplicate = registrations.some(
      (r) => r.enrollment_no === student.enrollment_no && r.club_slug === club_slug
    );

    if (isDuplicate) {
      return { ok: true, duplicate: true, club: club_slug };
    }

    const record = {
      id: "club_reg_" + Date.now() + Math.random().toString(36).substring(2, 9),
      enrollment_no: student.enrollment_no,
      club_slug,
      created_at: new Date().toISOString(),
    };

    this.set("krmu_local_club_registrations", [...registrations, record]);
    this.logActivity("club.register", "club_registrations", record.id, { club: club_slug, enrollment: student.enrollment_no });
    return { ok: true, duplicate: false, club: club_slug };
  }

  // --- Clubs (Admin) --- (legacy stub; clubs are now read/written via Firestore in admin.functions.ts)
  getClubs(): LocalClub[] {
    return this.get<LocalClub>("krmu_local_clubs");
  }

  upsertClub(club: Partial<LocalClub>): LocalClub {
    const clubs = this.getClubs();
    let updated = [...clubs];
    const idx = updated.findIndex(c => c.id === club.id);
    const newClub = { ...club, id: club.id || "club_" + Date.now() } as LocalClub;
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], ...newClub };
    } else {
      updated.push(newClub);
    }
    this.set("krmu_local_clubs", updated);
    this.logActivity(idx >= 0 ? "club.update" : "club.create", "clubs", newClub.id, { name: newClub.name });
    return newClub;
  }

  deleteClub(id: string) {
    const clubs = this.getClubs().filter(c => c.id !== id);
    this.set("krmu_local_clubs", clubs);
    this.logActivity("club.delete", "clubs", id, {});
  }

  // --- Events (Admin) ---
  getEvents(): LocalEvent[] {
    return this.get<LocalEvent>("krmu_local_events").sort(
      (a, b) => a.day_number - b.day_number || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );
  }

  createEvent(event: Omit<LocalEvent, "id" | "qr_token">): LocalEvent {
    const events = this.getEvents();
    const newEvent: LocalEvent = {
      ...event,
      id: "evt_" + Date.now() + Math.random().toString(36).substring(2, 9),
      qr_token: Math.random().toString(36).substring(2, 10),
    };
    this.set("krmu_local_events", [...events, newEvent]);
    this.logActivity("event.create", "events", newEvent.id, { title: newEvent.title });
    
    // Also mirror it to LocalSession so existing scanner still works automatically
    this.createSession(newEvent.title);
    return newEvent;
  }

  updateEvent(id: string, updates: Partial<LocalEvent>) {
    const events = this.getEvents();
    const updated = events.map(e => e.id === id ? { ...e, ...updates } : e);
    this.set("krmu_local_events", updated);
    this.logActivity("event.update", "events", id, updates);
  }

  deleteEvent(id: string) {
    const events = this.getEvents().filter(e => e.id !== id);
    this.set("krmu_local_events", events);
    this.logActivity("event.delete", "events", id, {});
  }

  // --- Room Allocation ---

  /** Read the persisted room-occupancy map from localStorage. */
  getRoomOccupancy(): RoomOccupancy {
    if (typeof window === "undefined") return {};
    try {
      const data = localStorage.getItem("krmu_room_occupancy");
      return data ? (JSON.parse(data) as RoomOccupancy) : {};
    } catch {
      return {};
    }
  }

  private setRoomOccupancy(occ: RoomOccupancy) {
    if (typeof window === "undefined") return;
    localStorage.setItem("krmu_room_occupancy", JSON.stringify(occ));
    window.dispatchEvent(new Event("local-db-update"));
  }

  /**
   * Returns a per-room summary for the occupancy grid UI.
   * Rooms are in fill order (A101 → A115, A201 → C315).
   */
  getRoomSummary(): {
    room_no: string;
    capacity: number;
    occupied: number;
    available: number;
    isSpecial: boolean;
    fillPct: number;
  }[] {
    const occupancy = this.getRoomOccupancy();
    return generateAllRooms().map((room_no) => {
      const capacity = getRoomCapacity(room_no);
      const occupied = Math.min(occupancy[room_no] ?? 0, capacity);
      return {
        room_no,
        capacity,
        occupied,
        available: capacity - occupied,
        isSpecial: room_no in ROOM_CONFIG.specialRooms,
        fillPct: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
      };
    });
  }

  /**
   * Assign rooms to all students who don't have one yet.
   *
   * Algorithm (v2 — shared-capacity model):
   *   • Students sorted FIFO (earliest registration first).
   *   • Rooms fill in order A101→A115, A201→A315, B101→C315.
   *   • A room accepts students until its capacity is reached:
   *       - A113, A213, A313 → max 100 students each.
   *       - All other rooms  → max 72 students each.
   *   • When a room is full, the pointer advances to the next room.
   *   • Already-allocated students are skipped (idempotent top-up).
   */
  allocateRooms(): { allocated: number; skipped: number; overflow: number; roomsUsed: number } {
    const allRooms = generateAllRooms();
    const students = this.get<LocalStudent>("krmu_local_students");
    const occupancy = this.getRoomOccupancy();

    // Unallocated students — sort FIFO
    const unallocated = [...students]
      .filter((s) => !s.room_no)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const skipped = students.filter((s) => !!s.room_no).length;
    let allocated = 0;
    let overflow = 0;
    let roomIdx = 0;
    const newRoomsUsed = new Set<string>();
    const assignments = new Map<string, string>();

    for (const student of unallocated) {
      // Advance past any rooms that are already at capacity
      while (roomIdx < allRooms.length) {
        const cap = getRoomCapacity(allRooms[roomIdx]);
        if ((occupancy[allRooms[roomIdx]] ?? 0) < cap) break;
        roomIdx++;
      }

      if (roomIdx >= allRooms.length) {
        assignments.set(student.id, "OVERFLOW");
        overflow++;
      } else {
        const room = allRooms[roomIdx];
        assignments.set(student.id, room);
        occupancy[room] = (occupancy[room] ?? 0) + 1;
        newRoomsUsed.add(room);
        allocated++;
      }
    }

    // Persist updated student records and occupancy map
    const updated = students.map((s) =>
      assignments.has(s.id) ? { ...s, room_no: assignments.get(s.id)! } : s
    );
    this.set("krmu_local_students", updated);
    this.setRoomOccupancy(occupancy);
    this.logActivity("room.allocate", "students", null, { allocated, skipped, overflow });
    return { allocated, skipped, overflow, roomsUsed: newRoomsUsed.size };
  }

  /** Clear all room assignments and reset occupancy counts to zero. */
  resetRoomAllocations(): { cleared: number } {
    const students = this.get<LocalStudent>("krmu_local_students");
    const updated = students.map((s) => ({ ...s, room_no: undefined }));
    this.set("krmu_local_students", updated);
    this.setRoomOccupancy({});
    this.logActivity("room.reset", "students", null, { cleared: students.length });
    return { cleared: students.length };
  }

  /**
   * Manually override a specific student's room and keep occupancy counts in sync.
   * Decrements the old room's count; increments the new room's count.
   */
  updateStudentRoom(enrollment_no: string, new_room_no: string): boolean {
    const students = this.get<LocalStudent>("krmu_local_students");
    const occupancy = this.getRoomOccupancy();
    let found = false;

    const updated = students.map((s) => {
      if (s.enrollment_no !== enrollment_no) return s;
      found = true;
      // Maintain occupancy counts
      if (s.room_no && s.room_no !== "OVERFLOW") {
        occupancy[s.room_no] = Math.max(0, (occupancy[s.room_no] ?? 1) - 1);
      }
      if (new_room_no !== "OVERFLOW") {
        occupancy[new_room_no] = (occupancy[new_room_no] ?? 0) + 1;
      }
      return { ...s, room_no: new_room_no };
    });

    if (found) {
      this.set("krmu_local_students", updated);
      this.setRoomOccupancy(occupancy);
      // Keep the active boarding pass in sync
      const profile = this.getStudentProfile();
      if (profile && profile.enrollment_no === enrollment_no) {
        localStorage.setItem("krmu_active_profile", JSON.stringify({ ...profile, room_no: new_room_no }));
      }
      this.logActivity("room.update", "students", null, { enrollment_no, room_no: new_room_no });
    }
    return found;
  }
}

export const localDb = new LocalDB();

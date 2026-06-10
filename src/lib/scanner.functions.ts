import { db } from "@/lib/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { eventCache } from "@/lib/event-cache";

/* ─── Active events list (for the admin event selector dropdown) ─────────── */

/**
 * getActiveEvents — uses event cache to avoid repeated reads.
 * Cache key: "active-events" — shared across all callers in this tab.
 */
export const getActiveEvents = async () => {
  const cacheKey = "active-events";
  const cached = eventCache.get<any[]>(cacheKey);
  if (cached) return cached;

  const eventsRef = collection(db, "events");
  const q = query(eventsRef, where("is_active", "==", true));
  const snap = await getDocs(q);
  const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  events.sort((a: any, b: any) => (a.day_number || 0) - (b.day_number || 0));

  eventCache.set(cacheKey, events);
  return events;
};

/* ─── All events (active + inactive) for pass checklist ─────────────────── */

export const getAllEvents = async () => {
  const cacheKey = "all-events";
  const cached = eventCache.get<any[]>(cacheKey);
  if (cached) return cached;

  const eventsRef = collection(db, "events");
  // No filter — fetch all, sort client-side, limit to 10 for pass display
  const snap = await getDocs(eventsRef);
  const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  events.sort((a: any, b: any) => (a.day_number || 0) - (b.day_number || 0));
  const result = events.slice(0, 10);

  eventCache.set(cacheKey, result);
  return result;
};

/* ─── Student boarding pass (profile + attended day numbers) ─────────────── */

/**
 * getStudentPass — FIXED: uses event cache to avoid re-fetching active events.
 *
 * Before: Fetched all active events from Firestore on every call, then
 *   fired N parallel attendance doc lookups — the event fetch was not cached.
 *
 * After:  Shares the same "active-events" cache used by getActiveEvents.
 *   The per-student attendance doc reads (N direct lookups) are unavoidable
 *   but are already O(1) each since they use compound doc IDs.
 */
export const getStudentPass = async ({ data }: { data: any }) => {
  // Direct O(1) student lookup — enrollment_no is the doc ID
  const studentRef = doc(db, "students", data.enrollment_no);
  const studentSnap = await getDoc(studentRef);

  if (!studentSnap.exists()) {
    return { student: null, attendedDays: [] };
  }

  const student = { id: studentSnap.id, ...studentSnap.data() } as any;

  const studentRes = {
    id: student.id,
    full_name: student.full_name,
    enrollment_no: student.enrollment_no,
    course: student.course,
    year: student.year,
    department: student.department_id || "Unknown",
    branch: student.branch_id || null,
  };

  // Reuse event cache — avoids a Firestore read if another function already
  // populated "active-events" in this browser tab session
  const cacheKey = "active-events";
  let activeEvents = eventCache.get<any[]>(cacheKey);
  if (!activeEvents) {
    const eventsRef = collection(db, "events");
    const activeEventsQ = query(eventsRef, where("is_active", "==", true));
    const eventsSnap = await getDocs(activeEventsQ);
    activeEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    eventCache.set(cacheKey, activeEvents);
  }

  const attendedDays = new Set<number>();

  // Direct O(1) attendance lookups — composite doc ID as dedup key
  await Promise.all(
    activeEvents.map(async (eventItem: any) => {
      if (!eventItem.day_number) return;
      const attRef = doc(db, "attendance", `${eventItem.id}_${student.id}`);
      const attSnap = await getDoc(attRef);
      if (attSnap.exists()) {
        attendedDays.add(eventItem.day_number);
      }
    }),
  );

  return {
    student: studentRes,
    attendedDays: Array.from(attendedDays).sort(),
  };
};

/* ─── Scanner: mark attendance ───────────────────────────────────────────── */

export type ScanResult =
  | { ok: true; duplicate: false; studentName: string; eventTitle: string; day: number }
  | { ok: true; duplicate: true; studentName: string; eventTitle: string; day: number }
  | { ok: false; error: string };

/**
 * scanMarkAttendance — used by the ADMIN scanner page.
 *
 * This function already had the correct structure (event fetched by doc ID
 * via transaction.get before the student + attendance lookup). No changes
 * needed here — preserved exactly as-is.
 */
export const scanMarkAttendance = async ({ data }: { data: any }): Promise<ScanResult> => {
  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Fetch Event — direct O(1) doc read (admin passes event_id directly)
      const eventRef = doc(db, "events", data.event_id);
      const eventDoc = await transaction.get(eventRef);
      if (!eventDoc.exists()) throw new Error("Event not found.");
      const eventData = eventDoc.data();

      // Check if event is active right now
      const now = new Date();
      if (eventData.starts_at && new Date(eventData.starts_at) > now) {
        throw new Error("This session hasn't started yet.");
      }
      if (eventData.ends_at && new Date(eventData.ends_at) < now) {
        throw new Error("This session has already ended.");
      }

      // 2. Fetch Student by enrollment_no — direct O(1) doc read
      const studentRef = doc(db, "students", data.enrollment_no);
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists()) throw new Error("Student not found.");

      const studentId = studentDoc.id;
      const studentData = studentDoc.data();

      // 3. Dedup check via compound doc ID — O(1) direct read
      const attendanceId = `${data.event_id}_${studentId}`;
      const attendanceRef = doc(db, "attendance", attendanceId);
      const attDoc = await transaction.get(attendanceRef);

      if (attDoc.exists()) {
        return {
          ok: true as const,
          duplicate: true,
          studentName: studentData.full_name,
          eventTitle: eventData.title,
          day: eventData.day_number,
        };
      }

      // 4. Record attendance atomically
      transaction.set(attendanceRef, {
        student_id: studentId,
        event_id: data.event_id,
        scanned_at: serverTimestamp(),
      });

      return {
        ok: true as const,
        duplicate: false,
        studentName: studentData.full_name,
        eventTitle: eventData.title,
        day: eventData.day_number,
      };
    });

    return result;
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
};

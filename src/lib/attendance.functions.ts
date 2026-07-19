import { db } from "@/lib/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  setDoc,
  runTransaction,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { eventCache } from "@/lib/event-cache";

/**
 * recordScan — REMOVED (Secure Attendance Architecture v2)
 *
 * This function previously allowed ANY authenticated student to write attendance
 * records directly to Firestore. This was the core security vulnerability.
 *
 * Attendance is now recorded EXCLUSIVELY through the server-side API
 * (api/attendance-mark.ts) which performs 13-point validation including:
 *   - HMAC-SHA256 QR signature verification
 *   - Nonce-based anti-replay
 *   - Geofence enforcement
 *   - Programme matching
 *   - Session status validation
 *
 * The student-side attendance.tsx page now calls the API directly.
 */

/**
 * getStudentAttendanceHistory — Fetch attendance records for a student.
 * Used by the student dashboard to show past attendance.
 */
export const getStudentAttendanceHistory = async (enrollmentNo: string) => {
  const q = query(
    collection(db, "attendance"),
    where("student_id", "==", enrollmentNo.toUpperCase()),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/**
 * registerForClub
 * Uses direct doc lookups wherever possible (no collection queries).
 * Dedup check uses compound doc ID instead of a collection scan.
 */
export const registerForClub = async ({ data }: { data: any }) => {
  try {
    // Club lookup by slug — needs a single-field index
    const clubsRef = collection(db, "clubs");
    const clubQ = query(clubsRef, where("slug", "==", data.club_slug), limit(1));
    const clubSnap = await getDocs(clubQ);
    if (clubSnap.empty) return { ok: false as const, error: "Club not found" };

    const clubId = clubSnap.docs[0].id;
    const clubData = clubSnap.docs[0].data();

    const result = await runTransaction(db, async (transaction) => {
      // Direct O(1) student lookup
      const studentRef = doc(db, "students", data.enrollment_no);
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists()) throw new Error("Please register as a student first.");

      const studentId = studentDoc.id;

      // Dedup check via compound doc ID (O(1) read)
      const regId = `${clubId}_${studentId}`;
      const regRef = doc(db, "club_registrations", regId);
      const regDoc = await transaction.get(regRef);

      if (regDoc.exists()) {
        return { ok: true as const, club: clubData.name, duplicate: true };
      }

      transaction.set(regRef, {
        club_id: clubId,
        student_id: studentId,
        registered_at: serverTimestamp(),
      });

      // Gamification: Add +10 points for joining a club
      transaction.update(studentRef, {
        points: increment(10)
      });

      return { ok: true as const, club: clubData.name, duplicate: false };
    });

    return result;
  } catch (error: any) {
    return { ok: false as const, error: error.message };
  }
};

/**
 * recordClubAttendance
 * Records attendance for a specific club session and grants +5 points.
 */
export const recordClubAttendance = async ({ data }: { data: any }) => {
  try {
    // Phase 1: Resolve the club event/session by qr_token
    const clubEventsRef = collection(db, "club_events");
    const eventQ = query(clubEventsRef, where("qr_token", "==", data.qr_token), limit(1));
    const eventSnap = await getDocs(eventQ);

    if (eventSnap.empty) {
      return { ok: false as const, error: "Club event not found for this QR token." };
    }

    const eventDoc = eventSnap.docs[0];
    const eventId = eventDoc.id;
    const eventData = eventDoc.data();

    // Phase 2: Atomic transaction
    const result = await runTransaction(db, async (transaction) => {
      const studentRef = doc(db, "students", data.enrollment_no);
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists()) throw new Error("Student not found.");

      const studentId = studentDoc.id;
      const studentData = studentDoc.data();

      const attendanceId = `${eventId}_${studentId}`;
      const attendanceRef = doc(db, "club_attendance", attendanceId);
      const attDoc = await transaction.get(attendanceRef);

      if (attDoc.exists()) {
        return {
          ok: true as const,
          duplicate: true,
          event: { title: eventData.title, club: eventData.club_name },
          student: { name: studentData.full_name },
        };
      }

      transaction.set(attendanceRef, {
        student_id: studentId,
        event_id: eventId,
        scanned_at: serverTimestamp(),
      });

      // Gamification: Add +5 points for club event attendance
      transaction.update(studentRef, {
        points: increment(5)
      });

      return {
        ok: true as const,
        duplicate: false,
        event: { title: eventData.title, club: eventData.club_name },
        student: { name: studentData.full_name },
      };
    });

    return result;
  } catch (error: any) {
    return { ok: false as const, error: error.message };
  }
};

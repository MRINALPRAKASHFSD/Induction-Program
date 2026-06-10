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
 * recordScan — v3: transaction-safe, scale-ready
 *
 * Architecture fix vs v2:
 *   v2 ran getDocs(collection query) INSIDE runTransaction.
 *   Firestore only retries `transaction.get(docRef)` calls on contention —
 *   collection queries inside transactions are NOT retried and can read
 *   stale data when concurrent writes are happening.
 *
 * v3 splits the work into two phases:
 *   Phase 1 (pre-transaction): Resolve the event by qr_token using a
 *     targeted, indexed single-field query with limit(1). Events are
 *     written by admins and don't change mid-session, so this read
 *     doesn't need transactional protection.
 *   Phase 2 (transaction): Only performs O(1) doc reads (student + attendance)
 *     and the atomic write. These are the only operations that need
 *     transactional retry semantics.
 *
 * Result: The transaction body is now pure O(1) — two direct doc reads
 *   + one conditional write. No collection scans inside transactions.
 *   This safely handles thousands of concurrent attendees.
 */
export const recordScan = async ({ data }: { data: any }) => {
  try {
    // ── Phase 1: Resolve event outside the transaction ────────────────────
    // qr_token is a single-field index (auto-indexed by Firestore).
    // limit(1) short-circuits as soon as the matching doc is found.
    const eventsRef = collection(db, "events");
    const eventQ = query(eventsRef, where("qr_token", "==", data.qr_token), limit(1));
    const eventSnap = await getDocs(eventQ);

    if (eventSnap.empty) {
      return { ok: false as const, error: "Event not found for this QR token." };
    }

    const eventDoc = eventSnap.docs[0];
    const eventId = eventDoc.id;
    const eventData = eventDoc.data();

    // Validate timing before entering transaction (fast-fail path)
    const now = new Date();
    if (eventData.starts_at && new Date(eventData.starts_at) > now) {
      return { ok: false as const, error: "This session hasn't started yet." };
    }
    if (eventData.ends_at && new Date(eventData.ends_at) < now) {
      return { ok: false as const, error: "This session has already ended." };
    }

    // ── Phase 2: Atomic transaction — O(1) reads + conditional write ──────
    const result = await runTransaction(db, async (transaction) => {
      // Direct doc read — enrollment_no IS the document ID (O(1), no index needed)
      const studentRef = doc(db, "students", data.enrollment_no);
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists()) throw new Error("Student not found.");

      const studentId = studentDoc.id;
      const studentData = studentDoc.data();

      // Composite attendance doc ID = guaranteed unique per (event, student)
      // Reading this doc is also O(1) — compound ID is the dedup mechanism
      const attendanceId = `${eventId}_${studentId}`;
      const attendanceRef = doc(db, "attendance", attendanceId);
      const attDoc = await transaction.get(attendanceRef);

      if (attDoc.exists()) {
        return {
          ok: true as const,
          duplicate: true,
          event: { title: eventData.title, venue: eventData.venue, day: eventData.day_number },
          student: { name: studentData.full_name },
        };
      }

      // Atomic write — Firestore rejects duplicates at the doc-ID level
      transaction.set(attendanceRef, {
        student_id: studentId,
        event_id: eventId,
        scanned_at: serverTimestamp(),
      });

      // Gamification: Add +10 points for event attendance
      transaction.update(studentRef, {
        points: increment(10)
      });

      return {
        ok: true as const,
        duplicate: false,
        event: { title: eventData.title, venue: eventData.venue, day: eventData.day_number },
        student: { name: studentData.full_name },
      };
    });

    return result;
  } catch (error: any) {
    return { ok: false as const, error: error.message };
  }
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

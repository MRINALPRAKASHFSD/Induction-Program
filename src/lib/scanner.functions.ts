import { z } from "zod";
import { db } from "@/lib/firebase/config";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  setDoc,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";

/* ─── Active events list (for the event selector dropdown) ─────────────── */

export const getActiveEvents = async () => {
  const eventsRef = collection(db, "events");
  const q = query(eventsRef, where("is_active", "==", true));
  const snap = await getDocs(q);
  const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  events.sort((a: any, b: any) => (a.day_number || 0) - (b.day_number || 0));
  return events;
};

/* ─── All events (active + inactive) for pass checklist ────────────────── */

export const getAllEvents = async () => {
  const eventsRef = collection(db, "events");
  const q = query(eventsRef, limit(20)); // Limit higher as sort is client side
  const snap = await getDocs(q);
  const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  events.sort((a: any, b: any) => (a.day_number || 0) - (b.day_number || 0));
  return events.slice(0, 10);
};

/* ─── Student boarding pass (profile + attended day numbers) ────────────── */

export const getStudentPass = async ({ data }: { data: any }) => {
  const studentRef = doc(db, "students", data.enrollment_no);
  const studentSnap = await getDoc(studentRef);
  
  if (!studentSnap.exists()) {
    return { student: null, attendedDays: [] };
  }
  
  const student = { id: studentSnap.id, ...studentSnap.data() } as any;
  
  // Resolve department manually if needed, but we'll return raw for now
  const studentRes = {
    id: student.id,
    full_name: student.full_name,
    enrollment_no: student.enrollment_no,
    course: student.course,
    year: student.year,
    department: student.department_id || "Unknown",
    branch: student.branch_id || null,
  };

  const eventsRef = collection(db, "events");
  const activeEventsQ = query(eventsRef, where("is_active", "==", true));
  const eventsSnap = await getDocs(activeEventsQ);
  
  const attendedDays = new Set<number>();
  
  // Look up attendance docs directly using composite ID to avoid 'list' permission
  await Promise.all(eventsSnap.docs.map(async (eDoc) => {
    const eventData = eDoc.data();
    if (!eventData.day_number) return;
    
    const attRef = doc(db, "attendance", `${eDoc.id}_${student.id}`);
    const attSnap = await getDoc(attRef);
    if (attSnap.exists()) {
      attendedDays.add(eventData.day_number);
    }
  }));

  return {
    student: studentRes,
    attendedDays: Array.from(attendedDays).sort(),
  };
};

/* ─── Scanner: mark attendance ─────────────────── */

export type ScanResult =
  | { ok: true; duplicate: false; studentName: string; eventTitle: string; day: number }
  | { ok: true; duplicate: true; studentName: string; eventTitle: string; day: number }
  | { ok: false; error: string };

export const scanMarkAttendance = async ({ data }: { data: any }): Promise<ScanResult> => {
  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Fetch Event
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

      // 2. Fetch Student by enrollment_no (Direct lookup)
      const studentRef = doc(db, "students", data.enrollment_no);
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists()) throw new Error("Student not found.");
      
      const studentId = studentDoc.id;
      const studentData = studentDoc.data();

      // 3. Check for existing attendance to avoid duplicates
      // We'll create a composite document ID to guarantee uniqueness in attendance: {event_id}_{student_id}
      const attendanceId = `${data.event_id}_${studentId}`;
      const attendanceRef = doc(db, "attendance", attendanceId);
      
      const attDoc = await transaction.get(attendanceRef);
      if (attDoc.exists()) {
        return {
          ok: true as const,
          duplicate: true,
          studentName: studentData.full_name,
          eventTitle: eventData.title,
          day: eventData.day_number
        };
      }

      // 4. Record attendance
      transaction.set(attendanceRef, {
        student_id: studentId,
        event_id: data.event_id,
        scanned_at: serverTimestamp()
      });

      return {
        ok: true as const,
        duplicate: false,
        studentName: studentData.full_name,
        eventTitle: eventData.title,
        day: eventData.day_number
      };
    });
    
    return result;
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
};

import { z } from "zod";
import { db } from "@/lib/firebase/config";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc,
  runTransaction
} from "firebase/firestore";

/**
 * recordScan — v2: using Firestore transactions
 *
 * 1. Fetch event by qr_token
 * 2. Fetch student by enrollment_no
 * 3. Insert attendance row
 */
export const recordScan = async ({ data }: { data: any }) => {
  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Fetch Event by qr_token
      const eventsRef = collection(db, "events");
      const eventQ = query(eventsRef, where("qr_token", "==", data.qr_token));
      const eventSnap = await getDocs(eventQ);
      if (eventSnap.empty) throw new Error("Event not found for this QR token.");
      
      const eventId = eventSnap.docs[0].id;
      const eventData = eventSnap.docs[0].data();

      // Check if event is active right now
      const now = new Date();
      if (eventData.starts_at && new Date(eventData.starts_at) > now) {
        throw new Error("This session hasn't started yet.");
      }
      if (eventData.ends_at && new Date(eventData.ends_at) < now) {
        throw new Error("This session has already ended.");
      }

      // 2. Fetch Student by enrollment_no
      const studentsRef = collection(db, "students");
      const studentQ = query(studentsRef, where("enrollment_no", "==", data.enrollment_no));
      const studentSnap = await getDocs(studentQ);
      if (studentSnap.empty) throw new Error("Student not found.");
      
      const studentId = studentSnap.docs[0].id;
      const studentData = studentSnap.docs[0].data();

      // 3. Record attendance
      const attendanceId = `${eventId}_${studentId}`;
      const attendanceRef = doc(db, "attendance", attendanceId);
      
      const attDoc = await transaction.get(attendanceRef);
      if (attDoc.exists()) {
        return {
          ok: true as const,
          duplicate: true,
          event: { title: eventData.title, venue: eventData.venue, day: eventData.day_number },
          student: { name: studentData.full_name }
        };
      }

      transaction.set(attendanceRef, {
        student_id: studentId,
        event_id: eventId,
        scanned_at: new Date().toISOString()
      });

      return {
        ok: true as const,
        duplicate: false,
        event: { title: eventData.title, venue: eventData.venue, day: eventData.day_number },
        student: { name: studentData.full_name }
      };
    });
    
    return result;
  } catch (error: any) {
    return { ok: false as const, error: error.message };
  }
};

export const registerForClub = async ({ data }: { data: any }) => {
  try {
    // Fetch club
    const clubsRef = collection(db, "clubs");
    const clubQ = query(clubsRef, where("slug", "==", data.club_slug));
    const clubSnap = await getDocs(clubQ);
    if (clubSnap.empty) return { ok: false as const, error: "Club not found" };
    
    const clubId = clubSnap.docs[0].id;
    const clubData = clubSnap.docs[0].data();

    // Fetch student
    const studentsRef = collection(db, "students");
    const studentQ = query(studentsRef, where("enrollment_no", "==", data.enrollment_no));
    const studentSnap = await getDocs(studentQ);
    if (studentSnap.empty) return { ok: false as const, error: "Please register as a student first." };
    
    const studentId = studentSnap.docs[0].id;

    // Register
    const regId = `${clubId}_${studentId}`;
    const regRef = doc(db, "club_registrations", regId);
    const regDoc = await getDoc(regRef);
    
    if (regDoc.exists()) {
      return { ok: true as const, club: clubData.name, duplicate: true };
    }

    await setDoc(regRef, {
      club_id: clubId,
      student_id: studentId,
      registered_at: new Date().toISOString()
    });

    return { ok: true as const, club: clubData.name, duplicate: false };
  } catch (error: any) {
    return { ok: false as const, error: error.message };
  }
};

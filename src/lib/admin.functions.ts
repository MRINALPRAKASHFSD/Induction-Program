import { z } from "zod";
import { db } from "@/lib/firebase/config";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit,
  where,
  addDoc,
  getCountFromServer
} from "firebase/firestore";

/* ---------------- Events ---------------- */

const eventInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  day_number: z.number().int().min(1).max(10),
  venue: z.string().trim().min(1).max(160),
  starts_at: z.string().min(8),
  ends_at: z.string().min(8),
  department_id: z.string().uuid().optional().or(z.string()),
  is_active: z.boolean().default(true),
});

export const createEvent = async ({ data }: { data: any }) => {
  const eventsRef = collection(db, "events");
  // auto-generate ID
  const newEventRef = doc(eventsRef);
  const qr_token = "krmu-" + Math.random().toString(36).substring(2, 10);
  const eventData = { ...data, qr_token, id: newEventRef.id, created_at: new Date().toISOString() };
  await setDoc(newEventRef, eventData);
  return eventData;
};

export const updateEvent = async ({ data }: { data: any }) => {
  const { id, ...patch } = data;
  if (!id) throw new Error("Missing ID for update");
  const eventRef = doc(db, "events", id);
  await updateDoc(eventRef, patch);
  return { id, ...patch };
};

export const deleteEvent = async ({ data }: { data: any }) => {
  if (!data.id) throw new Error("Missing ID for delete");
  await deleteDoc(doc(db, "events", data.id));
  return { ok: true };
};

export const listEvents = async () => {
  const eventsRef = collection(db, "events");
  const q = query(eventsRef, orderBy("day_number", "asc"));
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Sort by starts_at since firestore composite index might be needed otherwise
  rows.sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return rows;
};

/* ---------------- Clubs ---------------- */

export const upsertClub = async ({ data }: { data: any }) => {
  const { id, ...rest } = data;
  if (id) {
    const clubRef = doc(db, "clubs", id);
    await updateDoc(clubRef, rest);
    return { id, ...rest };
  }
  const clubsRef = collection(db, "clubs");
  const newClubRef = doc(clubsRef);
  const clubData = { ...rest, id: newClubRef.id, created_at: new Date().toISOString() };
  await setDoc(newClubRef, clubData);
  return clubData;
};

export const deleteClub = async ({ data }: { data: any }) => {
  if (!data.id) throw new Error("Missing ID for delete");
  await deleteDoc(doc(db, "clubs", data.id));
  return { ok: true };
};

export const listClubs = async () => {
  const clubsRef = collection(db, "clubs");
  const snap = await getDocs(clubsRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const listClubRegistrations = async () => {
  const regsRef = collection(db, "club_registrations");
  const snap = await getDocs(regsRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const registerForClub = async ({ data }: { data: any }) => {
  const { enrollment_no, slug } = data;
  if (!enrollment_no || !slug) throw new Error("Missing data");

  // check if student exists
  const studentsRef = collection(db, "students");
  const qStudent = query(studentsRef, where("enrollment_no", "==", enrollment_no), limit(1));
  const studentSnap = await getDocs(qStudent);
  if (studentSnap.empty) {
    throw new Error("Student not found. Please register first.");
  }
  const studentData = studentSnap.docs[0].data();

  // find club
  const clubsRef = collection(db, "clubs");
  const qClub = query(clubsRef, where("slug", "==", slug), limit(1));
  const clubSnap = await getDocs(qClub);
  if (clubSnap.empty) {
    throw new Error("Club not found.");
  }
  const clubData = clubSnap.docs[0].data();
  const club_id = clubSnap.docs[0].id;

  // check if already registered
  const regsRef = collection(db, "club_registrations");
  const qReg = query(regsRef, where("enrollment_no", "==", enrollment_no), where("club_id", "==", club_id), limit(1));
  const regSnap = await getDocs(qReg);
  if (!regSnap.empty) {
    return { ok: true, duplicate: true };
  }

  // insert
  await addDoc(regsRef, {
    enrollment_no,
    student_name: studentData.full_name,
    club_id,
    club_slug: slug,
    registered_at: new Date().toISOString()
  });

  return { ok: true };
};

/* ---------------- Analytics ---------------- */

export const getAnalytics = async () => {
  const [studentsSnap, attendanceSnap, clubsSnap, eventsSnap] = await Promise.all([
    getCountFromServer(collection(db, "students")),
    getCountFromServer(collection(db, "attendance")),
    getCountFromServer(collection(db, "club_registrations")),
    getDocs(collection(db, "events"))
  ]);

  const studentsCount = studentsSnap.data().count;
  const attendanceCount = attendanceSnap.data().count;
  const clubsCount = clubsSnap.data().count;

  const events = eventsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  return {
    totals: { 
      students: studentsCount, 
      attendance: attendanceCount, 
      clubs: clubsCount, 
      events: events.length 
    },
    byDept: [],
    byYear: [],
    byEvent: [],
    byHour: [],
    byClub: [],
  };
};

/* ---------------- Students list ---------------- */

export const listStudents = async ({ data }: { data: any }) => {
  const studentsRef = collection(db, "students");
  let q = query(studentsRef);
  if (data?.limit) {
    q = query(studentsRef, limit(data.limit));
  }
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { rows, total: rows.length };
};

import { writeBatch } from "firebase/firestore";

export const updateStudentsBatch = async ({ data }: { data: { updates: { id: string, patch: any }[] } }) => {
  const chunks = [];
  for (let i = 0; i < data.updates.length; i += 500) {
    chunks.push(data.updates.slice(i, i + 500));
  }
  
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const update of chunk) {
      batch.update(doc(db, "students", update.id), update.patch);
    }
    await batch.commit();
  }
  return { ok: true, count: data.updates.length };
};

export const exportStudentsCsv = async () => {
  return { csv: "enrollment_no,full_name,email,phone,course,year,department,created_at\n", count: 0 };
};

/* ---------------- Activity logs ---------------- */

export const listActivityLogs = async ({ data }: { data: any }) => {
  return [];
};

/* ---------------- Attendance logs ---------------- */

export const listAttendance = async ({ data }: { data: any }) => {
  const attendanceRef = collection(db, "attendance");
  // Sort by scanned_at descending, limit to avoid downloading everything
  const q = query(attendanceRef, orderBy("scanned_at", "desc"), limit(data?.limit || 100));
  const snap = await getDocs(q);
  
  // We do NOT download the entire student list. Just return the base logs. 
  // In a robust system, we would store student_name directly on the attendance document 
  // (which we actually do when we record it in scanner.functions!) to avoid joins.
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

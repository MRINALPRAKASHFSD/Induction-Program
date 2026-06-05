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
  const parsed = eventInput.parse(data);
  const eventsRef = collection(db, "events");
  // auto-generate ID
  const newEventRef = doc(eventsRef);
  const eventData = { ...parsed, id: newEventRef.id, created_at: new Date().toISOString() };
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

/* ---------------- Analytics ---------------- */

export const getAnalytics = async () => {
  // Use getCountFromServer to avoid downloading massive amounts of data!
  // This pushes the aggregation to Google's servers and only downloads the final count.
  const studentsSnap = await getCountFromServer(collection(db, "students"));
  const attendanceSnap = await getCountFromServer(collection(db, "attendance"));
  const clubsSnap = await getCountFromServer(collection(db, "clubs"));
  const eventsSnap = await getCountFromServer(collection(db, "events"));

  return {
    totals: { 
      students: studentsSnap.data().count, 
      attendance: attendanceSnap.data().count, 
      clubs: clubsSnap.data().count, 
      events: eventsSnap.data().count 
    },
    byDept: [], // Detailed charts can be built incrementally if needed
    byYear: [],
    byEvent: [],
    byHour: [],
    byClub: [],
  };
};

/* ---------------- Students list ---------------- */

export const listStudents = async ({ data }: { data: any }) => {
  const studentsRef = collection(db, "students");
  const snap = await getDocs(query(studentsRef, limit(data?.limit || 100)));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { rows, total: rows.length };
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

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
  const studentsSnap = await getDocs(collection(db, "students"));
  const students = studentsSnap.docs.map(d => d.data() as any);
  
  const attendanceSnap = await getDocs(collection(db, "attendance"));
  const attendance = attendanceSnap.docs.map(d => d.data() as any);

  const clubsSnap = await getDocs(collection(db, "club_registrations"));
  const clubs = clubsSnap.docs.map(d => d.data() as any);

  const eventsSnap = await getDocs(collection(db, "events"));
  const events = eventsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const byDept: Record<string, number> = {};
  students.forEach((s) => {
    const parts = s.branch?.split(" · ") || [];
    const k = parts.length > 1 ? parts[1] : "Unknown";
    byDept[k] = (byDept[k] ?? 0) + 1;
  });

  const byYear: Record<string, number> = {};
  students.forEach((s) => {
    const parts = s.semester?.split(" · ") || [];
    const k = parts.length > 0 ? parts[0] : "Unknown";
    byYear[k] = (byYear[k] ?? 0) + 1;
  });

  const eventMap = new Map<string, any>(events.map((e) => [e.id, e]));
  const byEvent: Record<string, number> = {};
  attendance.forEach((a) => {
    const ev = eventMap.get(a.event_id);
    const k = ev ? ev.title : "Unknown";
    byEvent[k] = (byEvent[k] ?? 0) + 1;
  });

  const byHour: Record<string, number> = {};
  attendance.forEach((a) => {
    const h = new Date(a.scanned_at).getHours();
    const k = `${h}:00`;
    byHour[k] = (byHour[k] ?? 0) + 1;
  });

  const byClub: Record<string, number> = {};
  // Assuming club_registrations have club_id
  // We need club names too, let's fetch clubs
  const clubRefSnap = await getDocs(collection(db, "clubs"));
  const clubMap = new Map<string, any>(clubRefSnap.docs.map((c) => [c.id, c.data()]));
  
  clubs.forEach((c) => {
    const club = clubMap.get(c.club_id);
    const k = club ? String(club.slug) : "Unknown";
    byClub[k] = (byClub[k] ?? 0) + 1;
  });

  const toArr = (o: Record<string, number>) =>
    Object.entries(o).map(([name, value]) => ({ name, value }));

  const byClubNamed = Object.entries(byClub).map(([slug, count]) => {
    const name = slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { name, count };
  });

  return {
    totals: { 
      students: students.length, 
      attendance: attendance.length, 
      clubs: clubs.length, 
      events: events.length 
    },
    byDept: toArr(byDept),
    byYear: toArr(byYear),
    byEvent: toArr(byEvent),
    byHour: Array.from({ length: 24 }, (_, h) => ({
      name: `${h}:00`, value: byHour[`${h}:00`] ?? 0,
    })),
    byClub: byClubNamed,
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

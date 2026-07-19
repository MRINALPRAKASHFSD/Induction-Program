import { z } from "zod";
import { db } from "@/lib/firebase/config";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { eventCache } from "@/lib/event-cache";

const studentSchema = z.object({
  full_name: z.string().trim().min(2, "Name is too short").max(120),
  enrollment_no: z.string().trim().min(3, "Enrollment number is too short").max(40),
  email: z.string().trim().email("Invalid email address").max(200),
  phone: z.string().trim().refine(val => val === "" || val.length >= 10, {
    message: "Phone number must be at least 10 digits if provided",
  }),
  department_id: z.string().uuid().or(z.string()),
  branch_id: z.string().uuid().or(z.string()).nullable().optional(),
  course: z.string().trim().min(1, "Course is required").max(80),
  year: z.number().int().min(1).max(6),
  auth_uid: z.string().optional(),
});

export const registerStudent = async ({ data }: { data: any }) => {
  const parsedResult = studentSchema.safeParse(data);
  if (!parsedResult.success) {
    return { ok: false, error: parsedResult.error.errors[0].message };
  }
  const parsed = parsedResult.data;

  const newStudentRef = doc(db, "students", parsed.enrollment_no);

  // Direct O(1) doc lookup — enrollment_no is the document ID
  const docSnap = await getDoc(newStudentRef);
  if (docSnap.exists()) {
    const existingData = docSnap.data();
    // If the enrollment number is already registered under a different email/auth session
    if (existingData.auth_uid && existingData.auth_uid !== parsed.auth_uid) {
      return { 
        ok: false, 
        error: "This enrollment number is already registered on another device or email. Please log in with the original email or contact support." 
      };
    }
    // Otherwise, they are just "logging back in" on a new device with the SAME email.
    return { ok: true, student_id: newStudentRef.id, duplicate: true };
  }

  const { email, phone, auth_uid, ...publicData } = parsed;

  const batch = writeBatch(db);

  batch.set(newStudentRef, {
    ...publicData,
    id: newStudentRef.id,
    auth_uid: auth_uid || null,
    points: 0, // Gamification: Start with 0 points
    created_at: new Date().toISOString(),
  });

  const privateRef = doc(db, "students", parsed.enrollment_no, "private", "contact");
  batch.set(privateRef, { email, phone });

  await batch.commit();

  return { ok: true, student_id: newStudentRef.id, duplicate: false };
};

export const lookupStudent = async ({ data }: { data: any }) => {
  if (!data.enrollment_no) return { student: null };
  // Direct O(1) doc lookup — enrollment_no is the document ID
  const studentRef = doc(db, "students", data.enrollment_no);
  const snap = await getDoc(studentRef);

  if (!snap.exists()) {
    return { student: null };
  }
  return { student: { id: snap.id, ...snap.data() } };
};

export const getDepartments = async () => {
  const deptsRef = collection(db, "departments");
  const q = query(deptsRef, orderBy("name", "asc"));
  const snap = await getDocs(q);
  const departments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { departments };
};

/**
 * getSchoolDays — FIXED for 5,000+ concurrent users
 *
 * Before: Full collection scan on `events` → filter in JS
 *   → N reads on every request, N grows with every event created
 *
 * After:  Compound Firestore query (department_id + is_active)
 *   → reads ONLY matching documents, server-side
 *   → result cached in memory for 5 min; 5,000 students share 1 read
 *
 * Requires composite index: (department_id ASC, is_active ASC)
 * Defined in: firestore.indexes.json
 */
export const getSchoolDays = async ({ data }: { data: any }) => {
  const cacheKey = `days:${data.department_id}`;

  // Return from memory cache if still valid (5 min TTL)
  const cached = eventCache.get<number[]>(cacheKey);
  if (cached) return { days: cached };

  const eventsRef = collection(db, "events");
  const q = query(
    eventsRef,
    where("department_id", "in", [data.department_id, null]),
    where("is_active", "==", true),
  );
  const snap = await getDocs(q);

  const days = Array.from(
    new Set(snap.docs.map(d => d.data().day_number as number)),
  ).sort((a, b) => a - b);

  eventCache.set(cacheKey, days);
  return { days };
};

/**
 * getSchoolSessions — FIXED for 5,000+ concurrent users
 *
 * Before: Full collection scan → filter by dept + day + is_active in JS
 *   → reads entire events collection every time
 *
 * After:  3-clause compound query + server-side orderBy
 *   → pinpoint read, only the matching sessions returned
 *   → result cached per (dept, day) key for 5 min
 *
 * Requires composite index: (department_id ASC, day_number ASC, is_active ASC, starts_at ASC)
 * Defined in: firestore.indexes.json
 */
export const getSchoolSessions = async ({ data }: { data: any }) => {
  const cacheKey = `sess:${data.department_id}:${data.day_number}`;

  // Return from memory cache if still valid (5 min TTL)
  const cached = eventCache.get<any[]>(cacheKey);
  if (cached) return { sessions: cached };

  const eventsRef = collection(db, "events");
  const q = query(
    eventsRef,
    where("department_id", "in", [data.department_id, null]),
    where("day_number", "==", Number(data.day_number)),
    where("is_active", "==", true)
    // orderBy("starts_at", "asc") - removed because Firestore requires orderBy field to be in the 'in' filter, we will sort in memory
  );
  const snap = await getDocs(q);
  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Sort in memory since we used 'in' query
  sessions.sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  eventCache.set(cacheKey, sessions);
  return { sessions };
};

/**
 * getAllSchoolDays - Master view (all departments)
 */
export const getAllSchoolDays = async () => {
  const cacheKey = `days:all`;
  const cached = eventCache.get<number[]>(cacheKey);
  if (cached) return { days: cached };

  const eventsRef = collection(db, "events");
  const q = query(eventsRef, where("is_active", "==", true));
  const snap = await getDocs(q);

  const days = Array.from(
    new Set(snap.docs.map(d => d.data().day_number as number)),
  ).sort((a, b) => a - b);

  eventCache.set(cacheKey, days);
  return { days };
};

/**
 * getAllSchoolSessions - Master view (all departments)
 */
export const getAllSchoolSessions = async ({ data }: { data: any }) => {
  const cacheKey = `sess:all:${data.day_number}`;
  const cached = eventCache.get<any[]>(cacheKey);
  if (cached) return { sessions: cached };

  const eventsRef = collection(db, "events");
  const q = query(
    eventsRef,
    where("day_number", "==", Number(data.day_number)),
    where("is_active", "==", true)
  );
  const snap = await getDocs(q);
  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  sessions.sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  eventCache.set(cacheKey, sessions);
  return { sessions };
};


// NOTE: generateQrPayload was removed in the Secure Attendance Architecture migration.
// QR payloads are now generated exclusively by the server-side admin API (api/attendance-qr.ts).
// Students must NEVER generate or view QR codes.


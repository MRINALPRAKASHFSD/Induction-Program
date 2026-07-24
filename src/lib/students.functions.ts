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

// ── Registration schema ────────────────────────────────────────────────────
// Original KRMU registration fields, restored.
// Phone is now MANDATORY (was optional before the production hardening).
// All uniqueness is enforced via O(1) index collection lookups — not collection scans.
const studentSchema = z.object({
  full_name:     z.string().trim().min(2, "Name is too short").max(120),
  enrollment_no: z.string().trim().min(3, "Enrollment number is too short").max(40),
  email:         z.string().trim().email("Invalid email address").max(200),
  phone:         z.string().trim().min(10, "Phone number must be at least 10 digits").max(20),
  department_id: z.string().min(1, "School is required"),
  branch_id:     z.string().nullable().optional(),
  course:        z.string().trim().min(1, "Course is required").max(80),
  year:          z.number().int().min(1).max(6),
  deptName:      z.string().optional(),
  auth_uid:      z.string().optional(),
});

export const registerStudent = async ({ data, regToken }: { data: any; regToken: string }) => {
  const parsedResult = studentSchema.safeParse(data);
  if (!parsedResult.success) {
    return { ok: false, error: parsedResult.error.errors[0].message };
  }
  const parsed = parsedResult.data;

  if (!regToken) {
    return {
      ok: false,
      error: "Authentication required. Please verify your OTP again.",
    };
  }

  try {
    // ── Call Secure Backend Endpoint ──────────────────────────────────────────
    // Authorization uses a Firestore-backed registration session token (regToken)
    // issued by /api/verify-otp. This avoids firebase-admin/auth which has a
    // jwks-rsa/jose ESM conflict on Vercel Node 18+.
    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${regToken}`,
      },
      body: JSON.stringify(parsed),
    });

    const result = await res.json();
    
    if (!res.ok) {
      return {
        ok: false,
        error: result.error || "Failed to register. Please try again.",
        code: result.code
      };
    }

    return result; // { ok: true, student_id: string, duplicate: boolean }
    
  } catch (error: any) {
    console.error("Client registration error:", error);
    return {
      ok: false,
      error: "Network error during registration. Please check your connection and try again."
    };
  }
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
 * getSchoolDays — Optimized for 5,000+ concurrent users
 *
 * Uses compound Firestore query (department_id + is_active) with server-side filtering.
 * Result cached in memory for 5 min — 5,000 students share 1 read.
 * Requires composite index: (department_id ASC, is_active ASC)
 */
export const getSchoolDays = async ({ data }: { data: any }) => {
  const cacheKey = `days:${data.department_id}`;

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
 * getSchoolSessions — Optimized for 5,000+ concurrent users
 *
 * 3-clause compound query + server-side orderBy, pinpoint read.
 * Result cached per (dept, day) key for 5 min.
 * Requires composite index: (department_id ASC, day_number ASC, is_active ASC, starts_at ASC)
 */
export const getSchoolSessions = async ({ data }: { data: any }) => {
  const cacheKey = `sess:${data.department_id}:${data.day_number}`;

  const cached = eventCache.get<any[]>(cacheKey);
  if (cached) return { sessions: cached };

  const eventsRef = collection(db, "events");
  const q = query(
    eventsRef,
    where("department_id", "in", [data.department_id, null]),
    where("day_number", "==", Number(data.day_number)),
    where("is_active", "==", true),
  );
  const snap = await getDocs(q);
  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Sort in memory — needed because 'in' queries don't support orderBy
  sessions.sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  eventCache.set(cacheKey, sessions);
  return { sessions };
};

/**
 * getAllSchoolDays - Master view (all departments, admin use)
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
 * getAllSchoolSessions - Master view (all departments, admin use)
 */
export const getAllSchoolSessions = async ({ data }: { data: any }) => {
  const cacheKey = `sess:all:${data.day_number}`;
  const cached = eventCache.get<any[]>(cacheKey);
  if (cached) return { sessions: cached };

  const eventsRef = collection(db, "events");
  const q = query(
    eventsRef,
    where("day_number", "==", Number(data.day_number)),
    where("is_active", "==", true),
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

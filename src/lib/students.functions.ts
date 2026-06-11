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
  writeBatch
} from "firebase/firestore";

const studentSchema = z.object({
  full_name: z.string().trim().min(2, "Name is too short").max(120),
  enrollment_no: z.string().trim().min(3, "Enrollment number is too short").max(40),
  email: z.string().trim().email("Invalid email address").max(200),
  phone: z.string().trim().refine(val => val === "" || val.length >= 10, { message: "Phone number must be at least 10 digits if provided" }),
  department_id: z.string().uuid().or(z.string()),
  branch_id: z.string().uuid().or(z.string()).nullable().optional(),
  course: z.string().trim().min(1, "Course is required").max(80),
  year: z.number().int().min(1).max(6),
});

export const registerStudent = async ({ data }: { data: any }) => {
  const parsedResult = studentSchema.safeParse(data);
  if (!parsedResult.success) {
    return { ok: false, error: parsedResult.error.errors[0].message };
  }
  const parsed = parsedResult.data;
  
  const newStudentRef = doc(db, "students", parsed.enrollment_no);
  
  // Check duplicate by checking if doc exists
  const docSnap = await getDoc(newStudentRef);
  if (docSnap.exists()) {
    return { ok: true, student_id: newStudentRef.id, duplicate: true };
  }

  const { email, phone, ...publicData } = parsed;

  const batch = writeBatch(db);
  
  batch.set(newStudentRef, {
    ...publicData,
    id: newStudentRef.id,
    created_at: new Date().toISOString()
  });

  const privateRef = doc(db, "students", parsed.enrollment_no, "private", "contact");
  batch.set(privateRef, { email, phone });

  await batch.commit();

  return { ok: true, student_id: newStudentRef.id, duplicate: false };
};

export const lookupStudent = async ({ data }: { data: any }) => {
  if (!data.enrollment_no) return { student: null };
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

export const getSchoolDays = async ({ data }: { data: any }) => {
  const eventsRef = collection(db, "events");
  const snap = await getDocs(eventsRef);
  const activeEvents = snap.docs.map(d => d.data())
    .filter((d: any) => d.is_active === true && d.department_id === data.department_id);
  const days = Array.from(new Set(activeEvents.map(d => d.day_number))).sort((a, b) => a - b);
  return { days };
};

export const getSchoolSessions = async ({ data }: { data: any }) => {
  const eventsRef = collection(db, "events");
  const snap = await getDocs(eventsRef);
  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter((d: any) => d.department_id === data.department_id && d.day_number === Number(data.day_number) && d.is_active === true);
  
  // Client side sort due to lack of composite index right now
  sessions.sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return { sessions };
};

export const generateQrPayload = async ({ data }: { data: any }) => {
  let studentRef = null;
  const studentDocRef = doc(db, "students", data.enrollment_no);
  const studentSnap = await getDoc(studentDocRef);
  if (studentSnap.exists()) {
    studentRef = { id: studentSnap.id, ...studentSnap.data() } as any;
  }

  const sessionDoc = await getDoc(doc(db, "events", data.session_id));
  if (!sessionDoc.exists()) {
    throw new Error("Session not found");
  }
  const session = sessionDoc.data() as any;

  const qrPayload = {
    student_id: studentRef?.id || "local-only",
    enrollment_no: studentRef?.enrollment_no || data.enrollment_no,
    school_id: session.department_id,
    day: session.day_number,
    session_id: sessionDoc.id,
    qr_token: session.qr_token || sessionDoc.id // Fallback to id if qr_token missing
  };

  return { payload: JSON.stringify(qrPayload) };
};

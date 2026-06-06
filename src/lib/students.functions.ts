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
  orderBy 
} from "firebase/firestore";

const studentSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  enrollment_no: z.string().trim().min(3).max(40),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(20).or(z.literal("")),
  department_id: z.string().uuid().or(z.string()),
  branch_id: z.string().uuid().or(z.string()).nullable().optional(),
  course: z.string().trim().min(1).max(80),
  year: z.number().int().min(1).max(6),
});

export const registerStudent = async ({ data }: { data: any }) => {
  const parsed = studentSchema.parse(data);
  const studentsRef = collection(db, "students");
  
  // Check duplicate by enrollment_no
  const dupCheck = query(studentsRef, where("enrollment_no", "==", parsed.enrollment_no));
  const snap = await getDocs(dupCheck);
  if (!snap.empty) {
    return { ok: true, student_id: snap.docs[0].id, duplicate: true };
  }

  const newStudentRef = doc(studentsRef);
  await setDoc(newStudentRef, {
    ...parsed,
    id: newStudentRef.id,
    created_at: new Date().toISOString()
  });

  return { ok: true, student_id: newStudentRef.id, duplicate: false };
};

export const lookupStudent = async ({ data }: { data: any }) => {
  if (!data.enrollment_no) return { student: null };
  const studentsRef = collection(db, "students");
  const q = query(studentsRef, where("enrollment_no", "==", data.enrollment_no));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    return { student: null };
  }
  return { student: { id: snap.docs[0].id, ...snap.docs[0].data() } };
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
  const studentsRef = collection(db, "students");
  const studentQ = query(studentsRef, where("enrollment_no", "==", data.enrollment_no));
  const studentSnap = await getDocs(studentQ);
  if (!studentSnap.empty) {
    studentRef = { id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() } as any;
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

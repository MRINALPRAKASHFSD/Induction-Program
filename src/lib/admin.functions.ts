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
  getCountFromServer,
  increment,
  runTransaction,
} from "firebase/firestore";
import { eventCache } from "@/lib/event-cache";

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
  const newEventRef = doc(eventsRef);
  const qr_token = "krmu-" + Math.random().toString(36).substring(2, 10);
  const eventData = { ...data, qr_token, id: newEventRef.id, created_at: new Date().toISOString() };
  await setDoc(newEventRef, eventData);
  // Bust student-facing caches so new event is visible immediately
  eventCache.invalidate();
  return eventData;
};

export const updateEvent = async ({ data }: { data: any }) => {
  const { id, ...patch } = data;
  if (!id) throw new Error("Missing ID for update");
  const eventRef = doc(db, "events", id);
  await updateDoc(eventRef, patch);
  // Bust student-facing caches so updated session data is visible immediately
  eventCache.invalidate();
  return { id, ...patch };
};

export const deleteEvent = async ({ data }: { data: any }) => {
  if (!data.id) throw new Error("Missing ID for delete");
  await deleteDoc(doc(db, "events", data.id));
  // Bust student-facing caches so deleted event is no longer shown
  eventCache.invalidate();
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

const CLUB_CAPACITY = 120;

export const upsertClub = async ({ data }: { data: any }) => {
  const { id, ...rest } = data;
  if (id) {
    // Update existing club — preserve capacity/registeredCount/isRegistrationOpen
    const clubRef = doc(db, "clubs", id);
    const patch = {
      name: rest.name,
      tagline: rest.tagline,
      description: rest.description ?? null,
      imageUrl: rest.imageUrl ?? null,
      whatsappGroup: rest.whatsappGroup,
      visible: rest.visible ?? true,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(clubRef, patch);
    return { id, ...patch };
  }

  // Create new club
  const clubsRef = collection(db, "clubs");
  const newClubRef = doc(clubsRef);
  const clubData = {
    name: rest.name,
    tagline: rest.tagline,
    description: rest.description ?? null,
    imageUrl: rest.imageUrl ?? null,
    whatsappGroup: rest.whatsappGroup,
    visible: rest.visible ?? true,
    capacity: CLUB_CAPACITY,
    registeredCount: 0,
    isRegistrationOpen: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    id: newClubRef.id,
  };
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

// Returns registration counts keyed by club_id
export const listClubRegistrations = async () => {
  const regsRef = collection(db, "club_registrations");
  const snap = await getDocs(regsRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const registerForClub = async ({ data }: { data: any }) => {
  const { enrollment_no, club_id } = data;
  if (!enrollment_no || !club_id) throw new Error("Missing data");

  // Direct O(1) student lookup — enrollment_no IS the document ID
  const studentRef = doc(db, "students", enrollment_no);
  const studentSnap = await getDoc(studentRef);
  if (!studentSnap.exists()) {
    throw new Error("Student not found. Please register first.");
  }
  const studentId = studentSnap.id;

  // Compound doc ID for O(1) dedup + security rule enforcement
  const regId = `${club_id}_${studentId}`;
  const regRef = doc(db, "club_registrations", regId);
  const clubRef = doc(db, "clubs", club_id);

  // Firestore transaction: atomic increment + cap enforcement + dedup
  const result = await runTransaction(db, async (tx) => {
    const [clubSnap, regSnap] = await Promise.all([
      tx.get(clubRef),
      tx.get(regRef),
    ]);

    if (!clubSnap.exists()) throw new Error("Club not found.");

    // Duplicate check
    if (regSnap.exists()) return { ok: true, duplicate: true };

    const clubData = clubSnap.data();
    const currentCount: number = clubData.registeredCount ?? 0;
    const capacity: number = clubData.capacity ?? CLUB_CAPACITY;

    // Capacity check
    if (!clubData.isRegistrationOpen || currentCount >= capacity) {
      return { ok: false, full: true };
    }

    const newCount = currentCount + 1;
    const willBeFull = newCount >= capacity;

    // Write registration doc
    tx.set(regRef, {
      club_id,
      student_id: studentId,
      registered_at: new Date().toISOString(),
    });

    // Atomically update club counters
    tx.update(clubRef, {
      registeredCount: increment(1),
      isRegistrationOpen: !willBeFull,
      updatedAt: new Date().toISOString(),
    });

    return { ok: true, duplicate: false };
  });

  if (result.full) throw new Error("Registration is full for this club.");
  if (result.duplicate) return { ok: true, duplicate: true };

  // Gamification: +25 points for joining a club (outside tx to keep tx minimal)
  await updateDoc(studentRef, { points: increment(25) });

  return { ok: true };
};

/* ---------------- Analytics ---------------- */

export const getAnalytics = async () => {
  const [studentsSnap, attendanceSnap, clubsSnap, eventsSnap] = await Promise.all([
    getCountFromServer(collection(db, "students")),
    getCountFromServer(collection(db, "attendance_logs")),
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
  const attendanceRef = collection(db, "attendance_logs");
  // Sort by scanned_at descending, limit to avoid downloading everything
  const q = query(attendanceRef, orderBy("scanned_at", "desc"), limit(data?.limit || 100));
  const snap = await getDocs(q);
  
  // We do NOT download the entire student list. Just return the base logs. 
  // In a robust system, we would store student_name directly on the attendance document 
  // (which we actually do when we record it in scanner.functions!) to avoid joins.
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/* ---------------- Event Attendance (new — isolated system) ---------------- */

/**
 * Build the attendance QR URL for an event.
 * Format: /event-attend/{eventId}?v=1
 * The ?v=1 is a URL schema version — allows future changes without reprinting QRs.
 */
export function getEventAttendanceUrl(eventId: string, version = 1): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/event-attend/${eventId}?v=${version}`;
}

/**
 * Update an event with Optimistic Concurrency Control.
 * Rejects the save if another admin updated the event since it was loaded.
 *
 * @throws ConflictError if the event was updated concurrently.
 */
export const updateEventWithOCC = async ({
  data,
}: {
  data: { id: string; expected_version?: number; [key: string]: any };
}) => {
  const { id, expected_version, ...patch } = data;
  if (!id) throw new Error("Missing ID for update");

  const eventRef = doc(db, "events", id);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists()) throw new Error("Event not found.");

    const currentVersion = (snap.data().version as number | undefined) ?? 0;

    // If caller supplied a version expectation and it doesn't match → conflict
    if (expected_version !== undefined && currentVersion !== expected_version) {
      const err = new Error(
        "CONFLICT: This event was updated by another admin while you were editing. Reloading the latest version."
      );
      (err as any).code = "CONFLICT";
      throw err;
    }

    tx.update(eventRef, {
      ...patch,
      version: increment(currentVersion + 1),
      updated_at: new Date().toISOString(),
    });

    return { id, version: currentVersion + 1, ...patch };
  });
};

/**
 * Fetch paginated event attendance from the backend admin API.
 * Uses server-side pagination to handle 50K+ records without memory issues.
 */
export const listEventAttendance = async ({
  token,
  event_id,
  page = 1,
  pageSize = 50,
  search = "",
  filter = {},
  sortBy = "created_at",
  sortOrder = "desc" as "asc" | "desc",
  cursor,
}: {
  token: string;
  event_id: string;
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: { department?: string; school?: string; status?: string };
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  cursor?: string;
}): Promise<any> => {
  const res = await fetch("/api/event-attendance-list", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ event_id, page, pageSize, search, filter, sortBy, sortOrder, cursor }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
  }
  return res.json();
};

/**
 * Export event attendance as CSV.
 * Triggers a browser file download.
 */
export const exportEventAttendanceCsv = async ({
  token,
  event_id,
  filter = {},
  eventTitle = "event",
}: {
  token: string;
  event_id: string;
  filter?: { department?: string; school?: string; status?: string };
  eventTitle?: string;
}): Promise<void> => {
  const res = await fetch("/api/event-attendance-export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ event_id, filter }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `event_attendance_${eventTitle.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ---------------- Modular Analytics API Fetchers ---------------- */

async function fetchAnalyticsEndpoint(endpoint: string, token: string, body = {}) {
  const res = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const getAnalyticsOverview = (token: string, filter?: any) => fetchAnalyticsEndpoint('analytics-overview', token, { filter });
export const getAnalyticsAttendance = (token: string, filter?: any) => fetchAnalyticsEndpoint('analytics-attendance', token, { filter });
export const getAnalyticsEvents = (token: string, filter?: any) => fetchAnalyticsEndpoint('analytics-events', token, { filter });
export const getAnalyticsClubs = (token: string, filter?: any) => fetchAnalyticsEndpoint('analytics-clubs', token, { filter });
export const getAnalyticsStudents = (token: string, filter?: any) => fetchAnalyticsEndpoint('analytics-students', token, { filter });
export const getAnalyticsQR = (token: string, filter?: any) => fetchAnalyticsEndpoint('analytics-qr', token, { filter });
export const getAnalyticsActivity = (token: string, limit?: number, cursor?: string) => fetchAnalyticsEndpoint('analytics-activity', token, { limit, cursor });
export const getAnalyticsSnapshot = (token: string) => fetchAnalyticsEndpoint('analytics-snapshot', token);

/* ---------------- Event Datasets Management ---------------- */

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

export const uploadDataset = async (token: string, file: File, event_id: string, adminName: string) => {
  const storage = getStorage();
  const fileExt = file.name.split('.').pop();
  const uniqueName = `datasets/${event_id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  const storageRef = ref(storage, uniqueName);

  // Upload to Storage for archival purposes
  await uploadBytes(storageRef, file);
  const download_url = await getDownloadURL(storageRef);

  // Read file as base64 so the API can process it directly
  // (avoids the server needing to re-download from an auth-gated Storage URL)
  const fileArrayBuffer = await file.arrayBuffer();
  const fileBase64 = btoa(
    new Uint8Array(fileArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  const payload = {
    event_id,
    filename: file.name,
    file_size: file.size,
    mime_type: file.type,
    storage_path: uniqueName,
    download_url,
    file_base64: fileBase64,
    uploaded_by: adminName,
    created_by_name: adminName
  };

  const res = await fetch("/api/event-dataset-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
  }
  return res.json();
};

export const importDatasetBatch = async (token: string, payload: { dataset_id: string, action: 'start' | 'chunk' | 'finish', rows?: any[], batch_time_ms?: number, import_duration_ms?: number }) => {
  const res = await fetch("/api/event-dataset-import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
  }
  return res.json();
};

export const activateDataset = async (token: string, dataset_id: string, activated_by: string) => {
  const res = await fetch("/api/event-dataset-activate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ dataset_id, activated_by }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
  }
  return res.json();
};

export const deleteDataset = async (token: string, dataset_id: string, deleted_by: string) => {
  const res = await fetch("/api/event-dataset-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ dataset_id, deleted_by }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${res.status}`);
  }
  return res.json();
};

export const listDatasets = async (event_id: string) => {
  const datasetsRef = collection(db, "event_datasets");
  // No orderBy to avoid composite index requirement — sort client-side instead
  const q = query(datasetsRef, where("event_id", "==", event_id));
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort by version descending (newest first)
  rows.sort((a: any, b: any) => (b.version ?? 0) - (a.version ?? 0));
  return rows;
};


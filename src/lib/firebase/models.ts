import { Timestamp } from "firebase/firestore";

export interface Student {
  id: string;
  full_name: string;
  enrollment_no: string;
  course: string;
  points: number;
  auth_uid?: string | null;
  created_at: Timestamp | string;
  // Academic fields — present on all new registrations
  department_id?: string;   // e.g. "soet"
  branch_id?: string | null; // e.g. "Undergraduate Programmes"
  year?: number;            // Session year: 1 = 2026–2027
  // Legacy / compat
  semester?: string;        // Only on records created by the old simplified flow
}

export interface Department {
  id: string;
  name: string;
  slug?: string;
  created_at?: Timestamp;
}

export interface Event {
  id: string;
  title: string;
  description?: string;
  day_number: number;
  venue: string;
  starts_at: string;
  ends_at: string;
  department_id: string;
  is_active: boolean;
  created_by?: string;
  created_at: Timestamp;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tags: string[];
  image_url?: string;
  is_active: boolean;
  created_at: Timestamp;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  event_id: string;
  scanned_at: Timestamp;
  // Denormalized for faster querying
  student_name?: string;
  student_enrollment?: string;
  event_title?: string;
  event_day?: number;
}

export interface ActivityLog {
  id: string;
  actor_id: string;
  action: string;
  entity: string;
  entity_id?: string;
  meta?: Record<string, any>;
  created_at: Timestamp;
}

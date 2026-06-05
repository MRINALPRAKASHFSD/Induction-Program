import { Timestamp } from "firebase/firestore";

export interface Student {
  id: string; // auto-generated
  full_name: string;
  enrollment_no: string;
  email?: string;
  phone?: string;
  course: string;
  year: number;
  department_id: string;
  created_at: Timestamp;
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

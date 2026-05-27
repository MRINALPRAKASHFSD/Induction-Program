import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ─── Active events list (for the event selector dropdown) ─────────────── */

export const getActiveEvents = createServerFn({ method: "POST" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("id, title, day_number, venue, starts_at, ends_at, is_active")
    .eq("is_active", true)
    .order("day_number", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

/* ─── All events (active + inactive) for pass checklist ────────────────── */

export const getAllEvents = createServerFn({ method: "POST" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("id, title, day_number, venue, starts_at")
    .order("day_number", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
});

/* ─── Student boarding pass (profile + attended day numbers) ────────────── */

export const getStudentPass = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ enrollment_no: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    // Fetch student with department + branch names
    const { data: student } = await supabaseAdmin
      .from("students")
      .select(
        `id, full_name, enrollment_no, course, year,
         departments:department_id ( name ),
         branches:branch_id ( name )`,
      )
      .eq("enrollment_no", data.enrollment_no)
      .maybeSingle();

    if (!student) return { student: null, attendedDays: [] };

    // Fetch attended event IDs
    const { data: attended } = await supabaseAdmin
      .from("attendance")
      .select("event_id, events:event_id ( day_number )")
      .eq("student_id", student.id);

    const attendedDays = (attended ?? [])
      .map((a: any) => a.events?.day_number)
      .filter(Boolean) as number[];

    return {
      student: {
        id: student.id,
        full_name: student.full_name,
        enrollment_no: student.enrollment_no,
        course: student.course,
        year: student.year,
        department: (student.departments as any)?.name ?? "Unknown",
        branch: (student.branches as any)?.name ?? null,
      },
      attendedDays: [...new Set(attendedDays)].sort(),
    };
  });

/* ─── Scanner: mark attendance via atomic Postgres RPC ─────────────────── */
//
// v2 — replaces 3 sequential round-trips (fetch event, fetch student, insert)
// with a single call to mark_attendance() which does all three atomically
// inside Postgres and handles the unique_violation duplicate case natively.
//
// The RPC is defined in supabase/migrations/20260527000000_performance.sql.

export type ScanResult =
  | { ok: true; duplicate: false; studentName: string; eventTitle: string; day: number }
  | { ok: true; duplicate: true; studentName: string; eventTitle: string; day: number }
  | { ok: false; error: string };

export const scanMarkAttendance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        enrollment_no: z.string().trim().min(1).max(40),
        event_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ScanResult> => {
    // event_id is the UUID of the event; we fetch its qr_token to call the RPC
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("qr_token")
      .eq("id", data.event_id)
      .maybeSingle();

    if (!event) return { ok: false, error: "Event not found." };

    const { data: result, error } = await supabaseAdmin.rpc("mark_attendance", {
      p_qr_token: event.qr_token,
      p_enrollment_no: data.enrollment_no,
    });

    if (error) throw new Error(error.message);
    return result as ScanResult;
  });

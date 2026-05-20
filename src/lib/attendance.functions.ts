import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const recordScan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        qr_token: z.string().min(4).max(64),
        enrollment_no: z.string().trim().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, title, venue, day_number, is_active")
      .eq("qr_token", data.qr_token)
      .maybeSingle();
    if (!event || !event.is_active) {
      return { ok: false as const, error: "Event not found or inactive" };
    }

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, full_name")
      .eq("enrollment_no", data.enrollment_no)
      .maybeSingle();
    if (!student) {
      return { ok: false as const, error: "Student not registered. Please register first." };
    }

    const { error } = await supabaseAdmin
      .from("attendance")
      .insert({ event_id: event.id, student_id: student.id });

    if (error) {
      if (error.code === "23505") {
        return {
          ok: true as const,
          duplicate: true,
          event: { title: event.title, venue: event.venue, day: event.day_number },
          student: { name: student.full_name },
        };
      }
      throw new Error(error.message);
    }
    return {
      ok: true as const,
      duplicate: false,
      event: { title: event.title, venue: event.venue, day: event.day_number },
      student: { name: student.full_name },
    };
  });

export const registerForClub = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        club_slug: z.string().min(1).max(60),
        enrollment_no: z.string().trim().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, name")
      .eq("slug", data.club_slug)
      .maybeSingle();
    if (!club) return { ok: false as const, error: "Club not found" };

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("enrollment_no", data.enrollment_no)
      .maybeSingle();
    if (!student) return { ok: false as const, error: "Please register as a student first." };

    const { error } = await supabaseAdmin
      .from("club_registrations")
      .insert({ club_id: club.id, student_id: student.id });

    if (error && error.code !== "23505") throw new Error(error.message);
    return { ok: true as const, club: club.name, duplicate: error?.code === "23505" };
  });

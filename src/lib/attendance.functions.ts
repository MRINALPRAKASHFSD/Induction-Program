import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * recordScan — v2: uses the mark_attendance() Postgres RPC.
 *
 * Original code made 3 sequential round-trips:
 *   1. Fetch event by qr_token
 *   2. Fetch student by enrollment_no
 *   3. Insert attendance row
 *
 * v2 passes both values directly to the DB function which resolves them
 * atomically and handles the unique_violation duplicate case natively.
 */
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
    const { data: result, error } = await supabaseAdmin.rpc("mark_attendance", {
      p_qr_token: data.qr_token,
      p_enrollment_no: data.enrollment_no,
    });

    if (error) throw new Error(error.message);

    const r = result as {
      ok: boolean;
      error?: string;
      duplicate?: boolean;
      studentName?: string;
      eventTitle?: string;
      day?: number;
    };

    if (!r.ok) {
      return { ok: false as const, error: r.error ?? "Unknown error" };
    }

    return {
      ok: true as const,
      duplicate: r.duplicate ?? false,
      event: { title: r.eventTitle ?? "", venue: "", day: r.day ?? 0 },
      student: { name: r.studentName ?? "" },
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

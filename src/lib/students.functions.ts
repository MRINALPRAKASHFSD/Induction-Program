import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const studentSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  enrollment_no: z.string().trim().min(3).max(40),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(20),
  department_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable(),
  course: z.string().trim().min(1).max(80),
  year: z.number().int().min(1).max(6),
});

/**
 * Register a new student.
 *
 * v2 — atomic dedup:
 *   Instead of a pre-check SELECT (which has a race window), we go straight
 *   to INSERT and let the database's UNIQUE constraint on (enrollment_no, email)
 *   reject duplicates. A `23505` error code is translated into { duplicate: true }
 *   rather than a 500. This is safe under any level of concurrency.
 */
export const registerStudent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => studentSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: created, error } = await supabaseAdmin
      .from("students")
      .insert(data)
      .select("id")
      .single();

    if (error) {
      // UNIQUE constraint violation on enrollment_no or email → treat as duplicate
      if (error.code === "23505") {
        const { data: existing } = await supabaseAdmin
          .from("students")
          .select("id")
          .or(`enrollment_no.eq.${data.enrollment_no},email.eq.${data.email}`)
          .maybeSingle();
        return { ok: true as const, student_id: existing!.id, duplicate: true };
      }
      throw new Error(error.message);
    }

    return { ok: true as const, student_id: created.id, duplicate: false };
  });

export const lookupStudent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ enrollment_no: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("students")
      .select("id, full_name, enrollment_no, department_id")
      .eq("enrollment_no", data.enrollment_no)
      .maybeSingle();
    return { student: row };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Role cache — avoids a DB round-trip on every admin action.
 * Workers isolates share module-level state across requests within the same
 * isolate instance. TTL of 60 s is safe: role changes take effect within 1 min.
 */
const _roleCache = new Map<string, { roles: string[]; exp: number }>();

const ensureStaff = async (supabase: any, userId: string) => {
  const cached = _roleCache.get(userId);
  if (cached && cached.exp > Date.now()) {
    if (!cached.roles.includes("admin") && !cached.roles.includes("coordinator"))
      throw new Error("Forbidden: staff role required");
    return cached.roles;
  }
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  _roleCache.set(userId, { roles, exp: Date.now() + 60_000 });
  if (!roles.includes("admin") && !roles.includes("coordinator"))
    throw new Error("Forbidden: staff role required");
  return roles;
};

const log = async (
  supabase: any,
  actor_id: string,
  action: string,
  entity: string,
  entity_id: string | null,
  meta: Record<string, unknown> = {},
) => {
  await supabase.from("activity_logs").insert({ actor_id, action, entity, entity_id, meta });
};

/* ---------------- Events ---------------- */

const eventInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  day_number: z.number().int().min(1).max(10),
  venue: z.string().trim().min(1).max(160),
  starts_at: z.string().min(8),
  ends_at: z.string().min(8),
  is_active: z.boolean().default(true),
});

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => eventInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    const { data: row, error } = await supabase
      .from("events")
      .insert({ ...data, created_by: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await log(supabase, userId, "event.create", "events", row.id, { title: row.title });
    return row;
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).merge(eventInput.partial()).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await log(supabase, userId, "event.update", "events", id, patch);
    return row;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const roles = await ensureStaff(supabase, userId);
    if (!roles.includes("admin")) throw new Error("Only admins can delete events");
    const { error } = await supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(supabase, userId, "event.delete", "events", data.id, {});
    return { ok: true };
  });

/* ---------------- Clubs ---------------- */

const clubInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens"),
  description: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(30)).max(12).default([]),
  image_url: z.string().url().optional().nullable(),
  is_active: z.boolean().default(true),
});

export const upsertClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional() }).merge(clubInput.partial()).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    const { id, ...rest } = data;
    if (id) {
      const { data: row, error } = await supabase
        .from("clubs").update(rest).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      await log(supabase, userId, "club.update", "clubs", id, rest);
      return row;
    }
    const parsed = clubInput.parse(rest);
    const { data: row, error } = await supabase.from("clubs").insert(parsed).select("*").single();
    if (error) throw new Error(error.message);
    await log(supabase, userId, "club.create", "clubs", row.id, { name: row.name });
    return row;
  });

export const deleteClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const roles = await ensureStaff(supabase, userId);
    if (!roles.includes("admin")) throw new Error("Only admins can delete clubs");
    const { error } = await supabase.from("clubs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(supabase, userId, "club.delete", "clubs", data.id, {});
    return { ok: true };
  });

/* ---------------- Analytics ---------------- */

/**
 * getAnalytics — v2: delegates all aggregation to Postgres via the
 * get_analytics() RPC. Replaces 4 full-table fetches + JS aggregation
 * with a single network call that returns pre-computed JSON.
 * Payload: a few KB instead of potentially MBs of raw rows.
 */
export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    const { data, error } = await supabase.rpc("get_analytics");
    if (error) throw new Error(error.message);
    return data as {
      totals: { students: number; attendance: number; clubs: number; events: number };
      byDept:  { name: string; value: number }[];
      byYear:  { name: string; value: number }[];
      byEvent: { name: string; value: number }[];
      byHour:  { name: string; value: number }[];
      byClub:  { name: string; count: number }[];
    };
  });

/* ---------------- Students list (server-paginated) ---------------- */

export const listStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      q: z.string().trim().max(120).optional(),
      department_id: z.string().uuid().optional().nullable(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    let query = supabase
      .from("students")
      .select("id, full_name, enrollment_no, email, phone, course, year, department_id, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.q) {
      const safe = data.q.replace(/[%,]/g, "");
      query = query.or(
        `full_name.ilike.%${safe}%,enrollment_no.ilike.%${safe}%,email.ilike.%${safe}%`,
      );
    }
    if (data.department_id) query = query.eq("department_id", data.department_id);
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const exportStudentsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    const { data: rows } = await supabase
      .from("students")
      .select("enrollment_no, full_name, email, phone, course, year, department_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50000);
    const { data: depts } = await supabase.from("departments").select("id, name");
    const dmap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
    const header = ["enrollment_no", "full_name", "email", "phone", "course", "year", "department", "created_at"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...(rows ?? []).map((r: any) =>
        [r.enrollment_no, r.full_name, r.email, r.phone, r.course, r.year, dmap.get(r.department_id) ?? "", r.created_at]
          .map(esc).join(","),
      ),
    ].join("\n");
    return { csv, count: rows?.length ?? 0 };
  });

/* ---------------- Activity logs ---------------- */

export const listActivityLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    const { data: rows, error } = await supabase
      .from("activity_logs")
      .select("id, actor_id, action, entity, entity_id, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------------- Attendance logs ---------------- */

export const listAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await ensureStaff(supabase, userId);
    const { data: rows, error } = await supabase
      .from("attendance")
      .select("id, scanned_at, students(full_name, enrollment_no), events(title, day_number)")
      .order("scanned_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

-- ============================================================
-- Performance migration: analytics RPC + atomic scan RPC + index
-- ============================================================

-- 1. Explicit index on enrollment_no for fast student lookups
--    (UNIQUE constraint already creates one; this is for clarity + IF NOT EXISTS safety)
create index if not exists students_enroll_idx on public.students(enrollment_no);

-- ============================================================
-- 2. get_analytics()
--    Replaces 4 full-table fetches + JS aggregation in getAnalytics().
--    All GROUP BY work runs inside Postgres on indexed columns.
-- ============================================================
create or replace function public.get_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'students',   (select count(*)::int from public.students),
      'attendance', (select count(*)::int from public.attendance),
      'clubs',      (select count(*)::int from public.club_registrations),
      'events',     (select count(*)::int from public.events)
    ),
    'byDept', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', d.name, 'value', s.cnt)),
        '[]'::jsonb
      )
      from (
        select department_id, count(*)::int as cnt
        from public.students
        group by department_id
      ) s
      join public.departments d on d.id = s.department_id
    ),
    'byYear', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', 'Year ' || y.year, 'value', y.cnt) order by y.year),
        '[]'::jsonb
      )
      from (
        select year, count(*)::int as cnt
        from public.students
        group by year
      ) y
    ),
    'byEvent', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', 'D' || e.day_number || ' · ' || e.title, 'value', a.cnt)),
        '[]'::jsonb
      )
      from (
        select event_id, count(*)::int as cnt
        from public.attendance
        group by event_id
      ) a
      join public.events e on e.id = a.event_id
    ),
    'byHour', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('name', lpad(h::text, 2, '0') || ':00', 'value', coalesce(a.cnt, 0))
          order by h
        ),
        '[]'::jsonb
      )
      from generate_series(0, 23) h
      left join (
        select extract(hour from scanned_at)::int as hr, count(*)::int as cnt
        from public.attendance
        group by hr
      ) a on a.hr = h
    ),
    'byClub', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', c.name, 'count', coalesce(r.cnt, 0))),
        '[]'::jsonb
      )
      from public.clubs c
      left join (
        select club_id, count(*)::int as cnt
        from public.club_registrations
        group by club_id
      ) r on r.club_id = c.id
    )
  ) into result;

  return result;
end;
$$;

-- ============================================================
-- 3. mark_attendance(p_qr_token, p_enrollment_no)
--    Replaces 3 sequential round-trips in scanMarkAttendance /
--    recordScan with a single atomic Postgres call.
--    Handles duplicates via unique_violation, not a pre-check SELECT.
-- ============================================================
create or replace function public.mark_attendance(
  p_qr_token    text,
  p_enrollment_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event   public.events%rowtype;
  v_student public.students%rowtype;
begin
  -- 1. Resolve event by qr_token
  select * into v_event
  from public.events
  where qr_token = p_qr_token
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Event not found.');
  end if;

  if not v_event.is_active then
    return jsonb_build_object('ok', false, 'error', 'This event is no longer active.');
  end if;

  -- 2. Resolve student by enrollment_no (case-insensitive, trimmed)
  select * into v_student
  from public.students
  where enrollment_no = upper(trim(p_enrollment_no))
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Enrollment number "' || p_enrollment_no || '" is not registered. Please register first.'
    );
  end if;

  -- 3. Atomically insert attendance
  insert into public.attendance(event_id, student_id)
  values (v_event.id, v_student.id);

  return jsonb_build_object(
    'ok',          true,
    'duplicate',   false,
    'studentName', v_student.full_name,
    'eventTitle',  v_event.title,
    'day',         v_event.day_number
  );

exception
  when unique_violation then
    -- Already scanned — not an error, just a duplicate
    return jsonb_build_object(
      'ok',          true,
      'duplicate',   true,
      'studentName', v_student.full_name,
      'eventTitle',  v_event.title,
      'day',         v_event.day_number
    );
end;
$$;

-- ============================================================
-- 4. Grants: service_role (used by supabaseAdmin) needs EXECUTE
-- ============================================================
grant execute on function public.get_analytics()                     to service_role;
grant execute on function public.mark_attendance(text, text)         to service_role;

-- anon / authenticated roles do NOT need access to these functions
-- (they are called only from server-side code with the service role key)
revoke execute on function public.get_analytics()               from anon, authenticated;
revoke execute on function public.mark_attendance(text, text)   from anon, authenticated;

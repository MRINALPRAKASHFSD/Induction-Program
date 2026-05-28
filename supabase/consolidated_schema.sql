-- ============================================================
-- CONSOLIDATED SCHEMAS AND MIGRATIONS FOR THE INDUCTION PROGRAM
-- ============================================================

-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'coordinator', 'club_lead');

-- ============ ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin','coordinator')
  )
$$;

create policy "users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);
create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============ DEPARTMENTS / BRANCHES ============
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.departments enable row level security;
create policy "public read departments" on public.departments for select using (true);
create policy "admins manage departments" on public.departments for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index branches_dept_idx on public.branches(department_id);
alter table public.branches enable row level security;
create policy "public read branches" on public.branches for select using (true);
create policy "admins manage branches" on public.branches for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ============ STUDENTS ============
create table public.students (
  id uuid primary key default gen_random_uuid(),
  enrollment_no text not null unique,
  full_name text not null,
  email text not null unique,
  phone text not null,
  department_id uuid not null references public.departments(id),
  branch_id uuid references public.branches(id),
  course text not null,
  year int not null check (year between 1 and 6),
  created_at timestamptz not null default now()
);
create index students_dept_idx on public.students(department_id);
create index students_created_idx on public.students(created_at desc);
alter table public.students enable row level security;
-- Public registration: anyone may insert a student row
create policy "public insert student" on public.students for insert with check (true);
-- Staff can read all students
create policy "staff read students" on public.students for select to authenticated
  using (public.is_staff(auth.uid()));
create policy "admins update students" on public.students for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ============ EVENTS ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  day_number int not null check (day_number between 1 and 7),
  venue text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  qr_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index events_day_idx on public.events(day_number, starts_at);
create index events_active_idx on public.events(is_active);
alter table public.events enable row level security;
create policy "public read active events" on public.events for select using (is_active = true);
create policy "staff read all events" on public.events for select to authenticated
  using (public.is_staff(auth.uid()));
create policy "staff manage events" on public.events for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ============ ATTENDANCE ============
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (event_id, student_id)
);
create index attendance_event_idx on public.attendance(event_id, scanned_at desc);
create index attendance_student_idx on public.attendance(student_id);
alter table public.attendance enable row level security;
-- Public can insert their own scan (validated by server fn that checks qr_token + student)
create policy "public insert attendance" on public.attendance for insert with check (true);
create policy "staff read attendance" on public.attendance for select to authenticated
  using (public.is_staff(auth.uid()));

-- ============ CLUBS ============
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  tags text[] not null default '{}',
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index clubs_active_idx on public.clubs(is_active);
alter table public.clubs enable row level security;
create policy "public read active clubs" on public.clubs for select using (is_active = true);
create policy "staff manage clubs" on public.clubs for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.club_registrations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, student_id)
);
create index club_reg_club_idx on public.club_registrations(club_id, created_at desc);
alter table public.club_registrations enable row level security;
create policy "public insert club reg" on public.club_registrations for insert with check (true);
create policy "staff read club regs" on public.club_registrations for select to authenticated
  using (public.is_staff(auth.uid()));

-- ============ DYNAMIC FORMS ============
create table public.dynamic_forms (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('event','club','department','global')),
  owner_id uuid,
  title text not null,
  schema jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.dynamic_forms enable row level security;
create policy "public read active forms" on public.dynamic_forms for select using (is_active = true);
create policy "staff manage forms" on public.dynamic_forms for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.dynamic_forms(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index form_resp_form_idx on public.form_responses(form_id, created_at desc);
alter table public.form_responses enable row level security;
create policy "public insert form responses" on public.form_responses for insert with check (true);
create policy "staff read form responses" on public.form_responses for select to authenticated
  using (public.is_staff(auth.uid()));

-- ============ ACTIVITY LOGS ============
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_created_idx on public.activity_logs(created_at desc);
alter table public.activity_logs enable row level security;
create policy "staff read activity" on public.activity_logs for select to authenticated
  using (public.is_staff(auth.uid()));

-- ============ REALTIME ============
alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.club_registrations;
alter publication supabase_realtime add table public.students;
alter publication supabase_realtime add table public.events;

-- ============================================================
-- Performance migration: analytics RPC + atomic scan RPC + index
-- ============================================================

-- 1. Explicit index on enrollment_no for fast student lookups
create index if not exists students_enroll_idx on public.students(enrollment_no);

-- ============================================================
-- 2. get_analytics()
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
revoke execute on function public.get_analytics()               from anon, authenticated;
revoke execute on function public.mark_attendance(text, text)   from anon, authenticated;

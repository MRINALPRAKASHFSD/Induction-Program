
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

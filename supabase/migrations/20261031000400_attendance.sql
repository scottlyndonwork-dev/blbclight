-- Attendance: service types, sessions, member attendance and visitors.

create type public.attendance_status as enum ('present', 'late', 'excused', 'absent');
create type public.attendance_method as enum ('manual', 'qr', 'bulk');
create type public.session_status as enum ('open', 'closed');

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null unique check (char_length(name) between 1 and 100),
  default_start_time time,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_types_set_updated_at before update on public.service_types
for each row execute function public.set_updated_at();

insert into public.service_types (code, name, default_start_time, sort_order) values
  ('sunday_morning', 'Sunday Morning Worship', '09:00', 10),
  ('sunday_evening', 'Sunday Evening Worship', '18:00', 20),
  ('prayer_meeting', 'Prayer Meeting',         '19:00', 30),
  ('bible_study',    'Bible Study',            '19:00', 40),
  ('youth_service',  'Youth Service',          '16:00', 50),
  ('special',        'Special Service',        null,    60),
  ('other',          'Other Activity',         null,    70);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types (id) on delete restrict,
  session_date date not null,
  start_time time not null,
  title text check (title is null or char_length(title) <= 150),
  notes text check (notes is null or char_length(notes) <= 2000),
  status public.session_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type_id, session_date, start_time),
  check (session_date >= date '2000-01-01')
);

create index attendance_sessions_date_idx on public.attendance_sessions (session_date desc, start_time desc);

create trigger attendance_sessions_set_updated_at before update on public.attendance_sessions
for each row execute function public.set_updated_at();

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete restrict,
  status public.attendance_status not null default 'present',
  method public.attendance_method not null default 'manual',
  checked_in_at timestamptz not null default now(),
  correction_reason text check (correction_reason is null or char_length(correction_reason) <= 500),
  recorded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_unique_member unique (session_id, member_id)
);

create index attendance_records_member_idx on public.attendance_records (member_id, session_id);
create index attendance_records_session_status_idx on public.attendance_records (session_id, status);

create trigger attendance_records_set_updated_at before update on public.attendance_records
for each row execute function public.set_updated_at();

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 150),
  contact_number text check (contact_number is null or contact_number ~ '^[0-9+()\- ]{7,20}$'),
  address text check (address is null or char_length(address) <= 200),
  invited_by_member_id uuid references public.members (id) on delete set null,
  is_first_time boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 1000),
  recorded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index visitors_session_idx on public.visitors (session_id);

create trigger audit_attendance_sessions after insert or update or delete on public.attendance_sessions
for each row execute function public.audit_row_change('attendance_session');
create trigger audit_attendance_records after update or delete on public.attendance_records
for each row execute function public.audit_row_change('attendance');
create trigger audit_visitors after insert or update or delete on public.visitors
for each row execute function public.audit_row_change('visitor');
create trigger audit_service_types after insert or update or delete on public.service_types
for each row execute function public.audit_row_change('service_type');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Ensures the caller may change attendance in the given session.
create or replace function public._require_attendance_access(p_session_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.session_status;
begin
  select status into v_status from public.attendance_sessions where id = p_session_id;
  if not found then
    raise exception 'Attendance session not found.' using errcode = 'P0002';
  end if;
  if v_status = 'closed' then
    perform public.require_permission('attendance.correct');
  else
    perform public.require_permission('attendance.write');
  end if;
end;
$$;

revoke execute on function public._require_attendance_access(uuid) from public, anon, authenticated;

-- Number of members counted as active on a given date, derived from the
-- status history so historical percentages stay accurate.
create or replace function public.active_member_count_as_of(p_date date)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.members m
  join lateral (
    select h.status_id
    from public.membership_status_history h
    where h.member_id = m.id and h.effective_date <= p_date
    order by h.effective_date desc, h.created_at desc
    limit 1
  ) last_status on true
  join public.membership_statuses s on s.id = last_status.status_id and s.counts_as_active
  where m.date_registered <= p_date
    and (m.archived_at is null or (m.archived_at at time zone 'Asia/Manila')::date > p_date);
$$;

-- ---------------------------------------------------------------------------
-- Business functions
-- ---------------------------------------------------------------------------

-- Records (or updates) one member's attendance. Returns whether a new
-- record was created so the UI can warn about duplicates.
create or replace function public.record_attendance(
  p_session_id uuid,
  p_member_id uuid,
  p_status public.attendance_status default 'present',
  p_method public.attendance_method default 'manual'
)
returns table (record_id uuid, created boolean, previous_status public.attendance_status, status public.attendance_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.attendance_records;
  v_id uuid;
begin
  perform public._require_attendance_access(p_session_id);

  if not exists (select 1 from public.members m where m.id = p_member_id and m.archived_at is null) then
    raise exception 'Member not found or archived.' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.attendance_records r
  where r.session_id = p_session_id and r.member_id = p_member_id
  for update;

  if found then
    if v_existing.status <> p_status then
      update public.attendance_records r
      set status = p_status, method = p_method, recorded_by = auth.uid()
      where r.id = v_existing.id;
    end if;
    return query select v_existing.id, false, v_existing.status, p_status;
    return;
  end if;

  insert into public.attendance_records (session_id, member_id, status, method)
  values (p_session_id, p_member_id, p_status, p_method)
  on conflict on constraint attendance_records_unique_member do nothing
  returning id into v_id;

  if v_id is null then
    -- A concurrent insert won the race; report it as an existing record.
    return query
    select r.id, false, r.status, r.status
    from public.attendance_records r
    where r.session_id = p_session_id and r.member_id = p_member_id;
    return;
  end if;

  return query select v_id, true, null::public.attendance_status, p_status;
end;
$$;

-- Corrects a recorded attendance status with a reason.
create or replace function public.correct_attendance(
  p_record_id uuid,
  p_status public.attendance_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
begin
  select session_id into v_session from public.attendance_records where id = p_record_id;
  if not found then
    raise exception 'Attendance record not found.' using errcode = 'P0002';
  end if;
  perform public._require_attendance_access(v_session);
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Please give a reason for the correction.' using errcode = '22023';
  end if;
  update public.attendance_records
  set status = p_status, correction_reason = btrim(p_reason), recorded_by = auth.uid()
  where id = p_record_id;
end;
$$;

create or replace function public.remove_attendance(p_record_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
begin
  select session_id into v_session from public.attendance_records where id = p_record_id;
  if not found then
    raise exception 'Attendance record not found.' using errcode = 'P0002';
  end if;
  perform public._require_attendance_access(v_session);
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Please give a reason for removing this entry.' using errcode = '22023';
  end if;
  -- Store the reason on the row first so the audit log captures it.
  update public.attendance_records set correction_reason = btrim(p_reason) where id = p_record_id;
  delete from public.attendance_records where id = p_record_id;
end;
$$;

-- Marks every active member without a record as absent.
create or replace function public.mark_remaining_absent(p_session_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform public._require_attendance_access(p_session_id);

  insert into public.attendance_records (session_id, member_id, status, method)
  select p_session_id, m.id, 'absent', 'bulk'
  from public.members m
  join public.membership_statuses s on s.id = m.current_status_id and s.counts_as_active
  where m.archived_at is null
    and not exists (
      select 1 from public.attendance_records r where r.session_id = p_session_id and r.member_id = m.id
    )
  on conflict on constraint attendance_records_unique_member do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.set_session_status(p_session_id uuid, p_status public.session_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'closed' then
    perform public.require_permission('attendance.write');
  else
    perform public.require_permission('attendance.correct');
  end if;

  update public.attendance_sessions
  set status = p_status,
      closed_at = case when p_status = 'closed' then now() else null end,
      closed_by = case when p_status = 'closed' then auth.uid() else null end
  where id = p_session_id and status <> p_status;

  if not found then
    raise exception 'Session not found or already %.', p_status using errcode = 'P0002';
  end if;
end;
$$;

-- Attendance list for a session, including member identity fields, for
-- users who may not hold members.read.
create or replace function public.session_attendance(p_session_id uuid)
returns table (
  record_id uuid,
  member_id uuid,
  member_no text,
  full_name text,
  status public.attendance_status,
  method public.attendance_method,
  checked_in_at timestamptz,
  correction_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_permission(array['attendance.read', 'attendance.write']) then
    raise exception 'You do not have permission to view attendance.' using errcode = '42501';
  end if;
  return query
  select r.id, m.id, m.member_no,
         m.last_name || ', ' || m.first_name || coalesce(' ' || left(m.middle_name, 1) || '.', '') || coalesce(' ' || m.suffix, ''),
         r.status, r.method, r.checked_in_at, r.correction_reason
  from public.attendance_records r
  join public.members m on m.id = r.member_id
  where r.session_id = p_session_id
  order by r.checked_in_at desc;
end;
$$;

-- Per-session summary.
create view public.attendance_session_summary
with (security_invoker = true)
as
select
  s.id,
  s.session_date,
  s.start_time,
  s.title,
  s.status,
  s.service_type_id,
  t.name as service_type_name,
  count(r.id) filter (where r.status = 'present') as present_count,
  count(r.id) filter (where r.status = 'late') as late_count,
  count(r.id) filter (where r.status = 'excused') as excused_count,
  count(r.id) filter (where r.status = 'absent') as absent_count,
  (select count(*) from public.visitors v where v.session_id = s.id) as visitor_count,
  s.created_at
from public.attendance_sessions s
join public.service_types t on t.id = s.service_type_id
left join public.attendance_records r on r.session_id = s.id
group by s.id, t.name;

-- ---------------------------------------------------------------------------
-- Row Level Security & privileges
-- ---------------------------------------------------------------------------

alter table public.service_types enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.visitors enable row level security;

create policy service_types_select on public.service_types for select to authenticated using (true);
create policy service_types_write on public.service_types for all to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using ((select public.has_any_permission(array['attendance.read', 'attendance.write'])));
create policy attendance_sessions_insert on public.attendance_sessions for insert to authenticated
  with check ((select public.has_permission('attendance.write')) and status = 'open');
create policy attendance_sessions_update on public.attendance_sessions for update to authenticated
  using ((select public.has_permission('attendance.write')) and status = 'open')
  with check ((select public.has_permission('attendance.write')));
create policy attendance_sessions_delete on public.attendance_sessions for delete to authenticated
  using (
    (select public.has_permission('attendance.correct'))
    and not exists (select 1 from public.attendance_records r where r.session_id = attendance_sessions.id)
  );

revoke update on public.attendance_sessions from authenticated;
grant update (service_type_id, session_date, start_time, title, notes) on public.attendance_sessions to authenticated;

create policy attendance_records_select on public.attendance_records for select to authenticated
  using ((select public.has_any_permission(array['attendance.read', 'attendance.write'])));
revoke insert, update, delete, truncate on public.attendance_records from authenticated;

create policy visitors_select on public.visitors for select to authenticated
  using ((select public.has_any_permission(array['attendance.read', 'attendance.write'])));
create policy visitors_write on public.visitors for all to authenticated
  using ((select public.has_permission('attendance.write'))) with check ((select public.has_permission('attendance.write')));

grant select on public.attendance_session_summary to authenticated;

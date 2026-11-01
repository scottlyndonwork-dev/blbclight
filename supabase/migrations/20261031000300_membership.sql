-- Membership: members, classifications, status history, baptism,
-- ministries and households.

create type public.gender as enum ('male', 'female');
create type public.civil_status as enum ('single', 'married', 'widowed', 'separated', 'annulled');
create type public.household_relationship as enum ('head', 'spouse', 'child', 'parent', 'sibling', 'relative', 'other');

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------

create table public.membership_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  description text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.membership_statuses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z_]{1,40}$'),
  name text not null unique,
  description text not null default '',
  -- Counted as an active member in statistics.
  counts_as_active boolean not null default false,
  color text not null default 'gray' check (color in ('green', 'gray', 'amber', 'blue', 'red', 'slate')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 120),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger membership_categories_set_updated_at before update on public.membership_categories
for each row execute function public.set_updated_at();
create trigger membership_statuses_set_updated_at before update on public.membership_statuses
for each row execute function public.set_updated_at();
create trigger ministries_set_updated_at before update on public.ministries
for each row execute function public.set_updated_at();

insert into public.membership_statuses (key, name, description, counts_as_active, color, sort_order, is_system) values
  ('active',      'Active',      'Regularly participating member.',            true,  'green', 10, true),
  ('pending',     'Pending',     'Registration awaiting confirmation.',        false, 'amber', 20, true),
  ('inactive',    'Inactive',    'Member who is no longer actively attending.', false, 'gray',  30, true),
  ('transferred', 'Transferred', 'Transferred membership to another church.',  false, 'blue',  40, true),
  ('deceased',    'Deceased',    'Member has passed away.',                    false, 'slate', 50, true),
  ('removed',     'Removed',     'Membership removed by church decision.',     false, 'red',   60, true);

insert into public.membership_categories (name, description, sort_order) values
  ('Regular Member',   'Full communicant member.', 10),
  ('Associate Member', 'Associate or non-resident member.', 20),
  ('Youth Member',     'Youth member.', 30),
  ('Child',            'Child of member families.', 40),
  ('Regular Attendee', 'Attends regularly but not yet a member.', 50);

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  member_no text not null unique,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  middle_name text check (middle_name is null or char_length(middle_name) <= 100),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 100),
  suffix text check (suffix is null or char_length(suffix) <= 20),
  gender public.gender,
  civil_status public.civil_status,
  birthdate date check (birthdate is null or birthdate between date '1900-01-01' and (now() at time zone 'Asia/Manila')::date),
  contact_number text check (contact_number is null or contact_number ~ '^[0-9+()\- ]{7,20}$'),
  email extensions.citext check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address_line text check (address_line is null or char_length(address_line) <= 200),
  barangay text check (barangay is null or char_length(barangay) <= 100),
  city text check (city is null or char_length(city) <= 100),
  province text check (province is null or char_length(province) <= 100),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{4}$'),
  photo_path text,
  date_registered date not null default ((now() at time zone 'Asia/Manila')::date),
  membership_date date,
  category_id uuid references public.membership_categories (id) on delete restrict,
  current_status_id uuid not null references public.membership_statuses (id) on delete restrict,
  previous_church text check (previous_church is null or char_length(previous_church) <= 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  archive_reason text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (
    lower(
      member_no || ' ' || first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name || ' '
      || coalesce(suffix, '') || ' ' || first_name || ' ' || last_name
    )
  ) stored,
  constraint members_archive_consistency check (
    archived_at is not null or (archived_by is null and archive_reason is null)
  ),
  constraint members_membership_after_birth check (membership_date is null or birthdate is null or membership_date >= birthdate)
);

create index members_search_trgm_idx on public.members using gin (search_text extensions.gin_trgm_ops);
create index members_name_idx on public.members (last_name, first_name);
create index members_status_idx on public.members (current_status_id) where archived_at is null;
create index members_category_idx on public.members (category_id);
create index members_date_registered_idx on public.members (date_registered);
create index members_birthdate_idx on public.members (birthdate);

create or replace function public.members_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger members_set_updated_at before update on public.members
for each row execute function public.set_updated_at();
create trigger members_set_updated_by before update on public.members
for each row execute function public.members_before_update();

-- ---------------------------------------------------------------------------
-- Status history (append-only)
-- ---------------------------------------------------------------------------

create table public.membership_status_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  status_id uuid not null references public.membership_statuses (id) on delete restrict,
  previous_status_id uuid references public.membership_statuses (id) on delete restrict,
  effective_date date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  changed_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index membership_status_history_member_idx on public.membership_status_history (member_id, effective_date desc, created_at desc);
create index membership_status_history_status_idx on public.membership_status_history (status_id, effective_date);

create trigger membership_status_history_immutable
before update or delete on public.membership_status_history
for each row execute function public.prevent_audit_mutation();

-- ---------------------------------------------------------------------------
-- Baptism records
-- ---------------------------------------------------------------------------

create table public.baptism_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members (id) on delete restrict,
  baptism_date date check (baptism_date is null or baptism_date <= (now() at time zone 'Asia/Manila')::date),
  location text check (location is null or char_length(location) <= 200),
  officiant text check (officiant is null or char_length(officiant) <= 200),
  church_name text check (church_name is null or char_length(church_name) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index baptism_records_date_idx on public.baptism_records (baptism_date);

create trigger baptism_records_set_updated_at before update on public.baptism_records
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ministries & households
-- ---------------------------------------------------------------------------

create table public.member_ministries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  ministry_id uuid not null references public.ministries (id) on delete restrict,
  role text check (role is null or char_length(role) <= 80),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  unique (member_id, ministry_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index member_ministries_ministry_idx on public.member_ministries (ministry_id);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 150),
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at before update on public.households
for each row execute function public.set_updated_at();

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null unique references public.members (id) on delete cascade,
  relationship public.household_relationship not null default 'other',
  created_at timestamptz not null default now()
);

create index household_members_household_idx on public.household_members (household_id);

-- At most one head per household.
create unique index household_members_one_head on public.household_members (household_id) where relationship = 'head';

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------

create trigger audit_members after insert or update or delete on public.members
for each row execute function public.audit_row_change('member');
create trigger audit_membership_status_history after insert on public.membership_status_history
for each row execute function public.audit_row_change('membership_status');
create trigger audit_baptism_records after insert or update or delete on public.baptism_records
for each row execute function public.audit_row_change('baptism');
create trigger audit_member_ministries after insert or update or delete on public.member_ministries
for each row execute function public.audit_row_change('member_ministry');
create trigger audit_household_members after insert or update or delete on public.household_members
for each row execute function public.audit_row_change('household_member');
create trigger audit_households after insert or update or delete on public.households
for each row execute function public.audit_row_change('household');
create trigger audit_membership_statuses after insert or update or delete on public.membership_statuses
for each row execute function public.audit_row_change('membership_status_type');
create trigger audit_membership_categories after insert or update or delete on public.membership_categories
for each row execute function public.audit_row_change('membership_category');
create trigger audit_ministries after insert or update or delete on public.ministries
for each row execute function public.audit_row_change('ministry');

-- ---------------------------------------------------------------------------
-- Business functions
-- ---------------------------------------------------------------------------

-- Inserts a member row from a JSON payload. Internal: callers must have
-- checked permissions already.
create or replace function public._insert_member(p_data jsonb, p_status_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.members;
  v_id uuid;
  v_prefix text;
  v_member_no text;
  v_effective date;
begin
  v_rec := jsonb_populate_record(null::public.members, p_data);

  if not exists (select 1 from public.membership_statuses where id = p_status_id and is_active) then
    raise exception 'Select a valid membership status.' using errcode = '22023';
  end if;

  select member_no_prefix into v_prefix from public.church_settings where id;
  v_member_no := public.next_document_number('member', coalesce(v_prefix, 'GRC'), 5);

  insert into public.members (
    member_no, first_name, middle_name, last_name, suffix, gender, civil_status, birthdate,
    contact_number, email, address_line, barangay, city, province, postal_code,
    date_registered, membership_date, category_id, current_status_id, previous_church, notes
  ) values (
    v_member_no, btrim(v_rec.first_name), nullif(btrim(v_rec.middle_name), ''), btrim(v_rec.last_name),
    nullif(btrim(v_rec.suffix), ''), v_rec.gender, v_rec.civil_status, v_rec.birthdate,
    nullif(btrim(v_rec.contact_number), ''), nullif(btrim(v_rec.email::text), ''), nullif(btrim(v_rec.address_line), ''),
    nullif(btrim(v_rec.barangay), ''), nullif(btrim(v_rec.city), ''), nullif(btrim(v_rec.province), ''),
    nullif(btrim(v_rec.postal_code), ''), coalesce(v_rec.date_registered, public.today_manila()),
    v_rec.membership_date, v_rec.category_id, p_status_id, nullif(btrim(v_rec.previous_church), ''),
    nullif(btrim(v_rec.notes), '')
  )
  returning id, coalesce(membership_date, date_registered) into v_id, v_effective;

  insert into public.membership_status_history (member_id, status_id, previous_status_id, effective_date, reason)
  values (v_id, p_status_id, null, v_effective, coalesce(nullif(btrim(p_reason), ''), 'Initial registration'));

  return v_id;
end;
$$;

revoke execute on function public._insert_member(jsonb, uuid, text) from public, anon, authenticated;

-- Registers a member, records the initial status and, optionally, baptism.
create or replace function public.register_member(
  p_member jsonb,
  p_status_id uuid,
  p_baptism jsonb default null
)
returns table (id uuid, member_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_permission('members.write');

  v_id := public._insert_member(p_member, p_status_id, 'Initial registration');

  if p_baptism is not null then
    perform public.require_permission('baptism.write');
    insert into public.baptism_records (member_id, baptism_date, location, officiant, church_name, notes)
    values (
      v_id,
      nullif(p_baptism ->> 'baptism_date', '')::date,
      nullif(btrim(p_baptism ->> 'location'), ''),
      nullif(btrim(p_baptism ->> 'officiant'), ''),
      nullif(btrim(p_baptism ->> 'church_name'), ''),
      nullif(btrim(p_baptism ->> 'notes'), '')
    );
  end if;

  return query select m.id, m.member_no from public.members m where m.id = v_id;
end;
$$;

-- Imports many members atomically: either every row is saved or none.
create or replace function public.import_members(p_rows jsonb, p_status_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_count int := 0;
begin
  perform public.require_permission('members.import');

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import at most 2,000 rows at a time.' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    perform public._insert_member(v_row, p_status_id, 'Imported from spreadsheet');
    v_count := v_count + 1;
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, summary, metadata)
  values (auth.uid(), 'import.members', 'member', format('Imported %s members', v_count), jsonb_build_object('count', v_count));

  return v_count;
end;
$$;

-- Changes a member's status, preserving the full history.
create or replace function public.change_member_status(
  p_member_id uuid,
  p_status_id uuid,
  p_effective_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
  v_last_effective date;
  v_history_id uuid;
begin
  perform public.require_permission('membership.status_change');

  select current_status_id into v_current
  from public.members where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.membership_statuses where id = p_status_id and is_active) then
    raise exception 'Select a valid membership status.' using errcode = '22023';
  end if;
  if v_current = p_status_id then
    raise exception 'The member already has this status.' using errcode = '22023';
  end if;
  if p_effective_date is null or p_effective_date > public.today_manila() then
    raise exception 'The effective date cannot be in the future.' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Please give a reason for the status change.' using errcode = '22023';
  end if;

  select max(effective_date) into v_last_effective
  from public.membership_status_history where member_id = p_member_id;
  if v_last_effective is not null and p_effective_date < v_last_effective then
    raise exception 'The effective date cannot be earlier than the previous status change (%).', v_last_effective
      using errcode = '22023';
  end if;

  insert into public.membership_status_history (member_id, status_id, previous_status_id, effective_date, reason)
  values (p_member_id, p_status_id, v_current, p_effective_date, btrim(p_reason))
  returning id into v_history_id;

  update public.members set current_status_id = p_status_id where id = p_member_id;

  return v_history_id;
end;
$$;

create or replace function public.archive_member(p_member_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('members.archive');
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Please give a reason for archiving.' using errcode = '22023';
  end if;
  update public.members
  set archived_at = now(), archived_by = auth.uid(), archive_reason = btrim(p_reason)
  where id = p_member_id and archived_at is null;
  if not found then
    raise exception 'Member not found or already archived.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('members.archive');
  update public.members
  set archived_at = null, archived_by = null, archive_reason = null
  where id = p_member_id and archived_at is not null;
  if not found then
    raise exception 'Member not found or not archived.' using errcode = 'P0002';
  end if;
end;
$$;

-- Possible duplicate registrations (fuzzy name, birthdate, email, phone).
create or replace function public.find_possible_member_duplicates(
  p_first_name text,
  p_last_name text,
  p_birthdate date default null,
  p_email text default null,
  p_contact_number text default null,
  p_exclude_id uuid default null
)
returns table (id uuid, member_no text, full_name text, birthdate date, reason text, score real)
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select
      m.id,
      m.member_no,
      m.first_name || ' ' || coalesce(m.middle_name || ' ', '') || m.last_name || coalesce(' ' || m.suffix, '') as full_name,
      m.birthdate,
      extensions.similarity(lower(m.first_name || ' ' || m.last_name), lower(btrim(p_first_name) || ' ' || btrim(p_last_name))) as name_score,
      (p_email is not null and lower(m.email::text) = lower(btrim(p_email))) as email_match,
      (p_contact_number is not null and regexp_replace(m.contact_number, '\D', '', 'g') = regexp_replace(p_contact_number, '\D', '', 'g')) as phone_match,
      (p_birthdate is not null and m.birthdate = p_birthdate) as birth_match
    from public.members m
    where (p_exclude_id is null or m.id <> p_exclude_id)
      and (
        m.search_text operator(extensions.%) lower(btrim(p_first_name) || ' ' || btrim(p_last_name))
        or (p_email is not null and lower(m.email::text) = lower(btrim(p_email)))
        or (p_contact_number is not null and m.contact_number is not null
            and regexp_replace(m.contact_number, '\D', '', 'g') = regexp_replace(p_contact_number, '\D', '', 'g'))
      )
  )
  select
    c.id, c.member_no, c.full_name, c.birthdate,
    case
      when c.email_match then 'Same email address'
      when c.phone_match then 'Same contact number'
      when c.birth_match then 'Similar name and same birthdate'
      else 'Similar name'
    end as reason,
    (c.name_score + case when c.birth_match then 0.5 else 0 end
      + case when c.email_match or c.phone_match then 1 else 0 end)::real as score
  from candidates c
  where c.email_match or c.phone_match or c.name_score >= 0.55 or (c.birth_match and c.name_score >= 0.35)
  order by score desc
  limit 5;
$$;

-- Minimal member lookup for pickers (attendance, finance, certificates).
-- Returns identity fields only, for roles that do not hold members.read.
create or replace function public.member_lookup(p_query text, p_limit int default 10)
returns table (id uuid, member_no text, full_name text, status_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_permission(array[
    'members.read', 'attendance.write', 'attendance.read', 'finance.write', 'certificates.issue'
  ]) then
    raise exception 'You do not have permission to look up members.' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.member_no,
    m.first_name || ' ' || coalesce(left(m.middle_name, 1) || '. ', '') || m.last_name || coalesce(' ' || m.suffix, ''),
    s.name
  from public.members m
  join public.membership_statuses s on s.id = m.current_status_id
  where m.archived_at is null
    and char_length(btrim(coalesce(p_query, ''))) >= 1
    and (
      m.member_no ilike btrim(p_query) || '%'
      or m.search_text like '%' || lower(btrim(p_query)) || '%'
    )
  order by (m.member_no ilike btrim(p_query)) desc, m.last_name, m.first_name
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- Member list view (RLS of the underlying tables applies)
-- ---------------------------------------------------------------------------

create view public.member_list
with (security_invoker = true)
as
select
  m.id,
  m.member_no,
  m.first_name,
  m.middle_name,
  m.last_name,
  m.suffix,
  m.first_name || ' ' || coalesce(m.middle_name || ' ', '') || m.last_name || coalesce(' ' || m.suffix, '') as full_name,
  m.gender,
  m.birthdate,
  m.contact_number,
  m.email,
  m.city,
  m.photo_path,
  m.date_registered,
  m.membership_date,
  m.category_id,
  c.name as category_name,
  m.current_status_id,
  s.key as status_key,
  s.name as status_name,
  s.color as status_color,
  s.counts_as_active,
  (b.id is not null) as is_baptized,
  b.baptism_date,
  coalesce(
    (select array_agg(mm.ministry_id) from public.member_ministries mm where mm.member_id = m.id),
    '{}'::uuid[]
  ) as ministry_ids,
  m.archived_at,
  m.search_text,
  m.created_at
from public.members m
join public.membership_statuses s on s.id = m.current_status_id
left join public.membership_categories c on c.id = m.category_id
left join public.baptism_records b on b.member_id = m.id;

-- ---------------------------------------------------------------------------
-- Row Level Security & privileges
-- ---------------------------------------------------------------------------

alter table public.membership_categories enable row level security;
alter table public.membership_statuses enable row level security;
alter table public.ministries enable row level security;
alter table public.members enable row level security;
alter table public.membership_status_history enable row level security;
alter table public.baptism_records enable row level security;
alter table public.member_ministries enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Lookups: readable by staff, managed by settings administrators.
create policy membership_categories_select on public.membership_categories for select to authenticated using (true);
create policy membership_categories_write on public.membership_categories for all to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

create policy membership_statuses_select on public.membership_statuses for select to authenticated using (true);
create policy membership_statuses_write on public.membership_statuses for all to authenticated
  using ((select public.has_permission('settings.manage')) and not is_system)
  with check ((select public.has_permission('settings.manage')) and not is_system);

create policy ministries_select on public.ministries for select to authenticated using (true);
create policy ministries_write on public.ministries for all to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

-- Members: read with members.read; edit with members.write. Inserts, status
-- and archival go through SECURITY DEFINER functions only.
create policy members_select on public.members for select to authenticated
  using ((select public.has_permission('members.read')));
create policy members_update on public.members for update to authenticated
  using ((select public.has_permission('members.write')) and archived_at is null)
  with check ((select public.has_permission('members.write')));

revoke insert, update, delete, truncate on public.members from authenticated;
grant update (
  first_name, middle_name, last_name, suffix, gender, civil_status, birthdate, contact_number, email,
  address_line, barangay, city, province, postal_code, photo_path, date_registered, membership_date,
  category_id, previous_church, notes
) on public.members to authenticated;

create policy membership_status_history_select on public.membership_status_history for select to authenticated
  using ((select public.has_permission('members.read')));
revoke insert, update, delete, truncate on public.membership_status_history from authenticated;

create policy baptism_records_select on public.baptism_records for select to authenticated
  using ((select public.has_permission('members.read')));
create policy baptism_records_insert on public.baptism_records for insert to authenticated
  with check ((select public.has_permission('baptism.write')));
create policy baptism_records_update on public.baptism_records for update to authenticated
  using ((select public.has_permission('baptism.write'))) with check ((select public.has_permission('baptism.write')));
create policy baptism_records_delete on public.baptism_records for delete to authenticated
  using ((select public.has_permission('baptism.write')));
revoke update on public.baptism_records from authenticated;
grant update (baptism_date, location, officiant, church_name, notes) on public.baptism_records to authenticated;

create policy member_ministries_select on public.member_ministries for select to authenticated
  using ((select public.has_permission('members.read')));
create policy member_ministries_write on public.member_ministries for all to authenticated
  using ((select public.has_permission('members.write'))) with check ((select public.has_permission('members.write')));

create policy households_select on public.households for select to authenticated
  using ((select public.has_permission('members.read')));
create policy households_write on public.households for all to authenticated
  using ((select public.has_permission('members.write'))) with check ((select public.has_permission('members.write')));

create policy household_members_select on public.household_members for select to authenticated
  using ((select public.has_permission('members.read')));
create policy household_members_write on public.household_members for all to authenticated
  using ((select public.has_permission('members.write'))) with check ((select public.has_permission('members.write')));

revoke all on public.member_list from anon;
grant select on public.member_list to authenticated;

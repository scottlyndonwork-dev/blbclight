-- GRACE foundation: extensions, identity, roles & permissions, settings,
-- document numbering, and audit logging.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Deny by default: the anonymous role gets nothing unless explicitly granted
-- (only the public certificate verification function is granted to anon).
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
-- PUBLIC's execute privilege comes from the global default, which a
-- per-schema default cannot remove, so revoke it globally.
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Current date in the church's timezone (Asia/Manila).
create or replace function public.today_manila()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  email extensions.citext not null,
  is_active boolean not null default true,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (email);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, new.id::text)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Roles & permissions
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z_]{1,48}$'),
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx on public.role_permissions (permission_id);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index user_roles_role_idx on public.user_roles (role_id);

-- Core authorization check used by RLS policies and RPCs.
-- Super administrators implicitly hold every permission.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.is_active
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and (
        r.key = 'super_admin'
        or exists (
          select 1
          from public.role_permissions rp
          join public.permissions p on p.id = rp.permission_id
          where rp.role_id = r.id and p.key = p_permission
        )
      )
  );
$$;

create or replace function public.has_any_permission(p_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from unnest(p_permissions) as x(p) where public.has_permission(x.p)
  );
$$;

create or replace function public.require_permission(p_permission text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not public.has_permission(p_permission) then
    raise exception 'You do not have permission to perform this action (%).', p_permission
      using errcode = '42501';
  end if;
end;
$$;

-- Permissions held by the current user (used to drive the UI).
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.key
  from public.permissions p
  where public.has_permission(p.key)
  order by p.key;
$$;

-- Never allow the last active super administrator to be removed.
create or replace function public.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super uuid;
  v_remaining int;
begin
  select id into v_super from public.roles where key = 'super_admin';
  if old.role_id = v_super then
    select count(*) into v_remaining
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.is_active
    where ur.role_id = v_super and ur.user_id <> old.user_id;
    if v_remaining = 0 then
      raise exception 'At least one active Super Administrator must remain.' using errcode = 'P0001';
    end if;
  end if;
  return old;
end;
$$;

create trigger user_roles_guard_last_super_admin
before delete on public.user_roles
for each row execute function public.guard_last_super_admin();

create or replace function public.guard_super_admin_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining int;
begin
  if old.is_active and not new.is_active then
    if exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = old.id and r.key = 'super_admin'
    ) then
      select count(*) into v_remaining
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.key = 'super_admin'
      join public.profiles p on p.id = ur.user_id and p.is_active
      where ur.user_id <> old.id;
      if v_remaining = 0 then
        raise exception 'At least one active Super Administrator must remain.' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_super_admin_deactivation
before update of is_active on public.profiles
for each row execute function public.guard_super_admin_deactivation();

-- ---------------------------------------------------------------------------
-- Church settings (singleton)
-- ---------------------------------------------------------------------------

create table public.church_settings (
  id boolean primary key default true check (id),
  church_name text not null default 'Church Name',
  short_name text not null default 'GRACE',
  address text not null default '',
  contact_number text not null default '',
  email text not null default '',
  website text not null default '',
  logo_path text,
  member_no_prefix text not null default 'GRC' check (member_no_prefix ~ '^[A-Z]{2,6}$'),
  timezone text not null default 'Asia/Manila',
  currency text not null default 'PHP',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.church_settings (id) values (true);

create trigger church_settings_set_updated_at
before update on public.church_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Gapless document numbering per scope and year (Asia/Manila)
-- ---------------------------------------------------------------------------

create table public.id_counters (
  scope text not null,
  year int not null check (year between 2000 and 2999),
  last_value int not null default 0 check (last_value >= 0),
  primary key (scope, year)
);

create or replace function public.next_document_number(p_scope text, p_prefix text, p_pad int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int := extract(year from public.today_manila())::int;
  v_value int;
begin
  insert into public.id_counters (scope, year, last_value)
  values (p_scope, v_year, 1)
  on conflict (scope, year)
  do update set last_value = public.id_counters.last_value + 1
  returning last_value into v_value;

  return p_prefix || '-' || v_year::text || '-' || lpad(v_value::text, p_pad, '0');
end;
$$;

revoke execute on function public.next_document_number(text, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit logs (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit records cannot be modified or deleted.' using errcode = '42501';
end;
$$;

create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_mutation();

-- Generic row-change audit trigger. Pass the entity label as TG_ARGV[0].
-- Updates store only changed columns to keep the log compact.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity text := coalesce(tg_argv[0], tg_table_name);
  v_old jsonb;
  v_new jsonb;
  v_before jsonb := null;
  v_after jsonb := null;
  v_key text;
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_after := v_new - 'search_text';
    v_id := v_new ->> 'id';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_before := '{}'::jsonb;
    v_after := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'search_text')
         and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_before := v_before || jsonb_build_object(v_key, v_old -> v_key);
        v_after := v_after || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;
    if v_after = '{}'::jsonb then
      return new;
    end if;
    v_id := v_new ->> 'id';
  else
    v_old := to_jsonb(old);
    v_before := v_old - 'search_text';
    v_id := v_old ->> 'id';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    auth.uid(),
    v_entity || '.' || lower(tg_op),
    v_entity,
    v_id,
    v_before,
    v_after
  );

  return coalesce(new, old);
end;
$$;

-- Explicit application events (login, exports, printing...). The actor is
-- always the calling user; callers cannot impersonate someone else.
create or replace function public.log_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_action !~ '^(auth|export|report|certificate|import)\.[a-z_]+$' then
    raise exception 'Unsupported audit action %', p_action using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, left(p_summary, 500), coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Records a successful sign in and updates the profile timestamp.
create or replace function public.record_sign_in(p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  update public.profiles set last_sign_in_at = now() where id = auth.uid();
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'auth.login', 'user', auth.uid()::text, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Audit identity and configuration tables.
create trigger audit_user_roles
after insert or update or delete on public.user_roles
for each row execute function public.audit_row_change('user_role');

create trigger audit_role_permissions
after insert or delete on public.role_permissions
for each row execute function public.audit_row_change('role_permission');

create trigger audit_roles
after insert or update or delete on public.roles
for each row execute function public.audit_row_change('role');

create trigger audit_profiles
after update on public.profiles
for each row execute function public.audit_row_change('user');

create trigger audit_church_settings
after update on public.church_settings
for each row execute function public.audit_row_change('settings');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.church_settings enable row level security;
alter table public.id_counters enable row level security;
alter table public.audit_logs enable row level security;

-- Staff can see one another's basic profile (needed for "recorded by" labels).
create policy profiles_select on public.profiles
for select to authenticated using (true);

create policy profiles_update on public.profiles
for update to authenticated
using ((select public.has_permission('users.manage')))
with check ((select public.has_permission('users.manage')));

create policy roles_select on public.roles
for select to authenticated using (true);

create policy roles_write on public.roles
for all to authenticated
using ((select public.has_permission('users.manage')) and not is_system)
with check ((select public.has_permission('users.manage')) and not is_system);

create policy permissions_select on public.permissions
for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions
for select to authenticated using (true);

create policy role_permissions_write on public.role_permissions
for all to authenticated
using ((select public.has_permission('users.manage')))
with check ((select public.has_permission('users.manage')));

create policy user_roles_select on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()) or (select public.has_permission('users.manage')));

create policy user_roles_insert on public.user_roles
for insert to authenticated
with check ((select public.has_permission('users.manage')));

create policy user_roles_delete on public.user_roles
for delete to authenticated
using ((select public.has_permission('users.manage')));

create policy church_settings_select on public.church_settings
for select to authenticated using (true);

create policy church_settings_update on public.church_settings
for update to authenticated
using ((select public.has_permission('settings.manage')))
with check ((select public.has_permission('settings.manage')));

create policy audit_logs_select on public.audit_logs
for select to authenticated
using ((select public.has_permission('audit.read')));

-- Audit logs are written only by SECURITY DEFINER functions/triggers.
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;
revoke all on public.id_counters from anon, authenticated;
revoke insert, delete, truncate on public.profiles from anon, authenticated;
revoke insert, delete, truncate on public.church_settings from anon, authenticated;
revoke insert, update, delete, truncate on public.permissions from anon, authenticated;
revoke update on public.role_permissions from anon, authenticated;
revoke update on public.user_roles from anon, authenticated;

-- Profiles: only status and display name are editable through the API.
revoke update on public.profiles from authenticated;
grant update (full_name, is_active) on public.profiles to authenticated;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.next_document_number(text, text, int) from authenticated;

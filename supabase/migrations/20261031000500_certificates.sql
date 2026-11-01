-- Certificates: types, templates, signatories, issuance and verification.

create type public.certificate_status as enum ('issued', 'voided', 'replaced');
create type public.page_orientation as enum ('landscape', 'portrait');

create table public.certificate_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null unique check (char_length(name) between 1 and 120),
  prefix text not null unique check (prefix ~ '^[A-Z]{2,5}$'),
  description text not null default '',
  requires_member boolean not null default true,
  sort_order int not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger certificate_types_set_updated_at before update on public.certificate_types
for each row execute function public.set_updated_at();

insert into public.certificate_types (code, name, prefix, description, requires_member, sort_order, is_system) values
  ('baptismal',        'Baptismal Certificate',        'BAP', 'Certifies water baptism.', true, 10, true),
  ('membership',       'Certificate of Membership',    'MEM', 'Certifies church membership.', true, 20, true),
  ('child_dedication', 'Child Dedication Certificate', 'CDD', 'Certifies the dedication of a child.', false, 30, true),
  ('marriage',         'Marriage Certificate',         'MAR', 'Church record of a marriage ceremony.', false, 40, true),
  ('participation',    'Certificate of Participation', 'PAR', 'Recognizes participation in an activity.', false, 50, true);

-- Template body supports placeholders such as {{full_name}}, {{baptism_date}}
-- and any custom field key defined in "fields".
create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.certificate_types (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  title text not null check (char_length(title) between 1 and 150),
  subtitle text check (subtitle is null or char_length(subtitle) <= 200),
  body text not null check (char_length(body) between 1 and 4000),
  footer_text text check (footer_text is null or char_length(footer_text) <= 500),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  orientation public.page_orientation not null default 'landscape',
  show_qr boolean not null default true,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type_id, name)
);

create unique index certificate_templates_one_default on public.certificate_templates (type_id) where is_default;

create trigger certificate_templates_set_updated_at before update on public.certificate_templates
for each row execute function public.set_updated_at();

create table public.certificate_signatories (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 150),
  title text not null check (char_length(title) between 1 and 150),
  signature_path text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger certificate_signatories_set_updated_at before update on public.certificate_signatories
for each row execute function public.set_updated_at();

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  verification_token text not null unique
    default encode(extensions.gen_random_bytes(16), 'hex')
    check (verification_token ~ '^[0-9a-f]{32}$'),
  type_id uuid not null references public.certificate_types (id) on delete restrict,
  template_id uuid not null references public.certificate_templates (id) on delete restrict,
  member_id uuid references public.members (id) on delete restrict,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 200),
  issued_on date not null,
  -- Frozen content used to render and reprint the certificate exactly.
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  status public.certificate_status not null default 'issued',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  replaces_certificate_id uuid unique references public.certificates (id) on delete restrict,
  issued_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((status = 'issued') = (voided_at is null)),
  check (status = 'issued' or void_reason is not null)
);

create index certificates_member_idx on public.certificates (member_id);
create index certificates_type_issued_idx on public.certificates (type_id, issued_on desc);
create index certificates_issued_on_idx on public.certificates (issued_on desc);

create table public.certificate_signers (
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  signatory_id uuid not null references public.certificate_signatories (id) on delete restrict,
  sort_order int not null default 0,
  primary key (certificate_id, signatory_id)
);

create index certificate_signers_signatory_idx on public.certificate_signers (signatory_id);

-- Issued certificates are immutable except for the void/replace transition.
create or replace function public.guard_certificate_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'issued' then
    raise exception 'A voided or replaced certificate cannot be changed.' using errcode = '42501';
  end if;
  if new.reference_no is distinct from old.reference_no
     or new.verification_token is distinct from old.verification_token
     or new.type_id is distinct from old.type_id
     or new.template_id is distinct from old.template_id
     or new.member_id is distinct from old.member_id
     or new.recipient_name is distinct from old.recipient_name
     or new.issued_on is distinct from old.issued_on
     or new.data is distinct from old.data
     or new.issued_by is distinct from old.issued_by
     or new.replaces_certificate_id is distinct from old.replaces_certificate_id then
    raise exception 'Issued certificates cannot be edited. Void or replace it instead.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger certificates_guard_update before update on public.certificates
for each row execute function public.guard_certificate_update();

create or replace function public.prevent_certificate_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Certificates cannot be deleted. Void the certificate instead.' using errcode = '42501';
end;
$$;

create trigger certificates_no_delete before delete on public.certificates
for each row execute function public.prevent_certificate_delete();

create trigger audit_certificates after insert or update on public.certificates
for each row execute function public.audit_row_change('certificate');
create trigger audit_certificate_templates after insert or update or delete on public.certificate_templates
for each row execute function public.audit_row_change('certificate_template');
create trigger audit_certificate_signatories after insert or update or delete on public.certificate_signatories
for each row execute function public.audit_row_change('certificate_signatory');
create trigger audit_certificate_types after insert or update or delete on public.certificate_types
for each row execute function public.audit_row_change('certificate_type');

-- ---------------------------------------------------------------------------
-- Business functions
-- ---------------------------------------------------------------------------

-- Issues a certificate. p_content contains the rendered body and custom
-- field values prepared by the application; the function adds the
-- authoritative template, type, church and signatory snapshot.
create or replace function public.issue_certificate(
  p_template_id uuid,
  p_member_id uuid,
  p_recipient_name text,
  p_issued_on date,
  p_content jsonb,
  p_signatory_ids uuid[],
  p_replaces_certificate_id uuid default null,
  p_replace_reason text default null
)
returns table (id uuid, reference_no text, verification_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.certificate_templates;
  v_type public.certificate_types;
  v_church public.church_settings;
  v_signatories jsonb;
  v_ref text;
  v_id uuid;
  v_old public.certificates;
begin
  perform public.require_permission('certificates.issue');

  select * into v_template from public.certificate_templates t where t.id = p_template_id and t.is_active;
  if not found then
    raise exception 'Select an active certificate template.' using errcode = '22023';
  end if;
  select * into v_type from public.certificate_types ct where ct.id = v_template.type_id;
  if not v_type.is_active then
    raise exception 'This certificate type is no longer active.' using errcode = '22023';
  end if;
  if v_type.requires_member and p_member_id is null then
    raise exception 'This certificate must be issued to a registered member.' using errcode = '22023';
  end if;
  if p_member_id is not null and not exists (select 1 from public.members m where m.id = p_member_id) then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if p_issued_on is null or p_issued_on > public.today_manila() then
    raise exception 'The issue date cannot be in the future.' using errcode = '22023';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or coalesce(p_content ->> 'body', '') = '' then
    raise exception 'Certificate content is missing.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_signatory_ids, 1), 0) = 0 then
    raise exception 'Select at least one authorized signatory.' using errcode = '22023';
  end if;
  if (select count(*) from public.certificate_signatories s where s.id = any(p_signatory_ids) and s.is_active)
     <> (select count(distinct x) from unnest(p_signatory_ids) as x) then
    raise exception 'One or more signatories are inactive or missing.' using errcode = '22023';
  end if;

  if p_replaces_certificate_id is not null then
    perform public.require_permission('certificates.void');
    if p_replace_reason is null or char_length(btrim(p_replace_reason)) < 3 then
      raise exception 'Please give a reason for replacing the certificate.' using errcode = '22023';
    end if;
    select * into v_old from public.certificates c where c.id = p_replaces_certificate_id for update;
    if not found or v_old.status <> 'issued' then
      raise exception 'Only an issued certificate can be replaced.' using errcode = '22023';
    end if;
    if v_old.type_id <> v_type.id then
      raise exception 'A replacement must be the same certificate type.' using errcode = '22023';
    end if;
  end if;

  select * into v_church from public.church_settings where church_settings.id;

  select jsonb_agg(jsonb_build_object('id', s.id, 'full_name', s.full_name, 'title', s.title, 'signature_path', s.signature_path)
                   order by array_position(p_signatory_ids, s.id))
  into v_signatories
  from public.certificate_signatories s
  where s.id = any(p_signatory_ids);

  v_ref := public.next_document_number('certificate_' || v_type.code, v_type.prefix, 6);

  insert into public.certificates (reference_no, type_id, template_id, member_id, recipient_name, issued_on, data, replaces_certificate_id)
  values (
    v_ref, v_type.id, v_template.id, p_member_id, btrim(p_recipient_name), p_issued_on,
    jsonb_build_object(
      'title', v_template.title,
      'subtitle', v_template.subtitle,
      'body', p_content ->> 'body',
      'footer_text', v_template.footer_text,
      'fields', coalesce(p_content -> 'fields', '{}'::jsonb),
      'orientation', v_template.orientation,
      'show_qr', v_template.show_qr,
      'type_name', v_type.name,
      'church', jsonb_build_object(
        'name', v_church.church_name, 'address', v_church.address, 'logo_path', v_church.logo_path
      ),
      'signatories', v_signatories
    ),
    p_replaces_certificate_id
  )
  returning certificates.id into v_id;

  insert into public.certificate_signers (certificate_id, signatory_id, sort_order)
  select v_id, x.sid, x.ord::int
  from unnest(p_signatory_ids) with ordinality as x(sid, ord)
  on conflict do nothing;

  if p_replaces_certificate_id is not null then
    update public.certificates c
    set status = 'replaced', void_reason = btrim(p_replace_reason) || ' (replaced by ' || v_ref || ')',
        voided_at = now(), voided_by = auth.uid()
    where c.id = p_replaces_certificate_id;
  end if;

  return query select c.id, c.reference_no, c.verification_token from public.certificates c where c.id = v_id;
end;
$$;

create or replace function public.void_certificate(p_certificate_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('certificates.void');
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Please give a reason for voiding the certificate.' using errcode = '22023';
  end if;
  update public.certificates
  set status = 'voided', void_reason = btrim(p_reason), voided_at = now(), voided_by = auth.uid()
  where id = p_certificate_id and status = 'issued';
  if not found then
    raise exception 'Only an issued certificate can be voided.' using errcode = '22023';
  end if;
end;
$$;

-- Public verification. Reveals only what is needed to confirm authenticity:
-- reference number, type, issue date, status and an abbreviated name.
create or replace function public.verify_certificate(p_token text)
returns table (
  reference_no text,
  certificate_type text,
  recipient_display_name text,
  issued_on date,
  status public.certificate_status,
  church_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return;
  end if;
  return query
  select
    c.reference_no,
    t.name,
    -- "Juan Dela Cruz" -> "Juan D."
    split_part(btrim(c.recipient_name), ' ', 1) || ' '
      || upper(left(regexp_replace(btrim(c.recipient_name), '^.*\s', ''), 1)) || '.',
    c.issued_on,
    c.status,
    (select cs.church_name from public.church_settings cs where cs.id)
  from public.certificates c
  join public.certificate_types t on t.id = c.type_id
  where c.verification_token = p_token;
end;
$$;

grant execute on function public.verify_certificate(text) to anon;

-- ---------------------------------------------------------------------------
-- Row Level Security & privileges
-- ---------------------------------------------------------------------------

alter table public.certificate_types enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.certificate_signatories enable row level security;
alter table public.certificates enable row level security;
alter table public.certificate_signers enable row level security;

create policy certificate_types_select on public.certificate_types for select to authenticated using (true);
create policy certificate_types_write on public.certificate_types for all to authenticated
  using ((select public.has_permission('certificates.templates')) and not is_system)
  with check ((select public.has_permission('certificates.templates')) and not is_system);

create policy certificate_templates_select on public.certificate_templates for select to authenticated
  using ((select public.has_any_permission(array['certificates.read', 'certificates.issue', 'certificates.templates'])));
create policy certificate_templates_write on public.certificate_templates for all to authenticated
  using ((select public.has_permission('certificates.templates')))
  with check ((select public.has_permission('certificates.templates')));

create policy certificate_signatories_select on public.certificate_signatories for select to authenticated
  using ((select public.has_any_permission(array['certificates.read', 'certificates.issue', 'certificates.templates'])));
create policy certificate_signatories_write on public.certificate_signatories for all to authenticated
  using ((select public.has_permission('certificates.templates')))
  with check ((select public.has_permission('certificates.templates')));

create policy certificates_select on public.certificates for select to authenticated
  using ((select public.has_any_permission(array['certificates.read', 'certificates.issue'])));
revoke insert, update, delete, truncate on public.certificates from authenticated;

create policy certificate_signers_select on public.certificate_signers for select to authenticated
  using ((select public.has_any_permission(array['certificates.read', 'certificates.issue'])));
revoke insert, update, delete, truncate on public.certificate_signers from authenticated;

-- ---------------------------------------------------------------------------
-- Default templates (editable by users with certificates.templates)
-- ---------------------------------------------------------------------------

insert into public.certificate_templates (type_id, name, title, subtitle, body, footer_text, fields, is_default)
select t.id, v.name, v.title, v.subtitle, v.body, v.footer_text, v.fields::jsonb, true
from (values
  ('baptismal', 'Standard Baptismal Certificate', 'Certificate of Baptism', 'This is to certify that',
   E'{{full_name}}\n\nwas baptized by immersion in obedience to the command of our Lord Jesus Christ on {{baptism_date}} at {{baptism_location}}, officiated by {{officiant}}.',
   '"Therefore we are buried with him by baptism into death: that like as Christ was raised up from the dead by the glory of the Father, even so we also should walk in newness of life." Romans 6:4',
   '[]'),
  ('membership', 'Standard Membership Certificate', 'Certificate of Membership', 'This is to certify that',
   E'{{full_name}}\n\nis a member in good standing of {{church_name}}, having been received into membership on {{membership_date}}.',
   null, '[]'),
  ('child_dedication', 'Standard Child Dedication Certificate', 'Certificate of Child Dedication', 'This certifies that',
   E'{{full_name}}\n\nchild of {{parents}}, was presented and dedicated to the Lord on {{dedication_date}} at {{church_name}}.',
   '"Train up a child in the way he should go: and when he is old, he will not depart from it." Proverbs 22:6',
   '[{"key":"parents","label":"Parents","type":"text","required":true},{"key":"dedication_date","label":"Dedication date","type":"date","required":true}]'),
  ('marriage', 'Standard Marriage Certificate', 'Certificate of Marriage', 'This certifies that',
   E'{{full_name}}\nand\n{{spouse_name}}\n\nwere united in holy matrimony on {{wedding_date}} at {{wedding_venue}}, officiated by {{officiant_name}}.',
   'This is a church record of the ceremony and does not replace the civil marriage certificate issued by the PSA.',
   '[{"key":"spouse_name","label":"Spouse name","type":"text","required":true},{"key":"wedding_date","label":"Wedding date","type":"date","required":true},{"key":"wedding_venue","label":"Venue","type":"text","required":true},{"key":"officiant_name","label":"Officiating minister","type":"text","required":true}]'),
  ('participation', 'Standard Certificate of Participation', 'Certificate of Participation', 'This is awarded to',
   E'{{full_name}}\n\nfor active participation in {{activity_name}} held on {{activity_date}}.',
   null,
   '[{"key":"activity_name","label":"Activity name","type":"text","required":true},{"key":"activity_date","label":"Activity date","type":"text","required":true}]')
) as v(code, name, title, subtitle, body, footer_text, fields)
join public.certificate_types t on t.code = v.code;

-- Finance: funds, categories, transactions, transfers and attachments.
--
-- Rules:
--  * Amounts are numeric(14,2) and always positive. Direction comes from the
--    transaction kind (income/expense).
--  * Drafts may be edited or deleted. Posted transactions are immutable; they
--    are corrected by a reversal entry that offsets the original.
--  * Fund balance = opening balance + income - expenses + transfers in - transfers out,
--    counting posted and reversed originals together with their reversals.
--  * Monetary values leave the database as text to avoid floating point.

create type public.transaction_kind as enum ('income', 'expense');
create type public.transaction_status as enum ('draft', 'posted', 'reversed');
create type public.payment_method as enum ('cash', 'check', 'bank_transfer', 'e_wallet', 'other');

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]{1,15}$'),
  name text not null unique check (char_length(name) between 1 and 120),
  description text not null default '',
  is_restricted boolean not null default false,
  opening_balance numeric(14, 2) not null default 0 check (opening_balance >= 0),
  opening_balance_date date,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger funds_set_updated_at before update on public.funds
for each row execute function public.set_updated_at();

insert into public.funds (code, name, description, is_restricted, sort_order) values
  ('GENERAL',  'General Fund',  'Unrestricted operating fund.', false, 10),
  ('BUILDING', 'Building Fund', 'Designated for building projects and repairs.', true, 20),
  ('MISSION',  'Mission Fund',  'Designated for missions and outreach.', true, 30),
  ('YOUTH',    'Youth Fund',    'Designated for youth ministry.', true, 40);

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  kind public.transaction_kind not null,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, name)
);

create trigger financial_categories_set_updated_at before update on public.financial_categories
for each row execute function public.set_updated_at();

insert into public.financial_categories (kind, name, sort_order) values
  ('income', 'Tithes', 10),
  ('income', 'Sunday Offerings', 20),
  ('income', 'Special Offerings', 30),
  ('income', 'Donations', 40),
  ('income', 'Pledges', 50),
  ('income', 'Mission Contributions', 60),
  ('income', 'Other Income', 90),
  ('expense', 'Utilities', 10),
  ('expense', 'Maintenance', 20),
  ('expense', 'Supplies', 30),
  ('expense', 'Ministry Expenses', 40),
  ('expense', 'Mission Expenses', 50),
  ('expense', 'Salaries and Allowances', 60),
  ('expense', 'Other Expenses', 90);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  txn_no text unique,
  kind public.transaction_kind not null,
  fund_id uuid not null references public.funds (id) on delete restrict,
  category_id uuid not null references public.financial_categories (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  txn_date date not null check (txn_date >= date '2000-01-01'),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  reference_no text check (reference_no is null or char_length(reference_no) <= 80),
  payer_payee text check (payer_payee is null or char_length(payer_payee) <= 200),
  member_id uuid references public.members (id) on delete restrict,
  payment_method public.payment_method not null default 'cash',
  status public.transaction_status not null default 'draft',
  reverses_transaction_id uuid unique references public.financial_transactions (id) on delete restrict,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) <= 500),
  posted_at timestamptz,
  posted_by uuid references public.profiles (id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'draft') = (txn_no is null)),
  check ((status = 'draft') = (posted_at is null)),
  check ((status = 'reversed') = (reversed_at is not null)),
  check (reverses_transaction_id is null or status = 'posted'),
  check (reverses_transaction_id is null or reversal_reason is not null)
);

create index financial_transactions_date_idx on public.financial_transactions (txn_date desc, created_at desc);
create index financial_transactions_fund_idx on public.financial_transactions (fund_id, status, txn_date);
create index financial_transactions_category_idx on public.financial_transactions (category_id, txn_date);
create index financial_transactions_kind_status_idx on public.financial_transactions (kind, status, txn_date);
create index financial_transactions_member_idx on public.financial_transactions (member_id) where member_id is not null;

create table public.fund_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  from_fund_id uuid not null references public.funds (id) on delete restrict,
  to_fund_id uuid not null references public.funds (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  transfer_date date not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  reverses_transfer_id uuid unique references public.fund_transfers (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_fund_id <> to_fund_id)
);

create index fund_transfers_date_idx on public.fund_transfers (transfer_date desc);
create index fund_transfers_from_idx on public.fund_transfers (from_fund_id);
create index fund_transfers_to_idx on public.fund_transfers (to_fund_id);

create table public.financial_attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.financial_transactions (id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|webp)$'),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index financial_attachments_txn_idx on public.financial_attachments (transaction_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create or replace function public.validate_financial_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_category_kind public.transaction_kind;
begin
  select kind into v_category_kind from public.financial_categories where id = new.category_id;
  if v_category_kind is distinct from new.kind then
    raise exception 'The category does not match the transaction type.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or new.fund_id is distinct from old.fund_id then
    if not exists (select 1 from public.funds where id = new.fund_id and is_active) then
      raise exception 'The selected fund is inactive.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'reversed' then
      raise exception 'A reversed transaction cannot be changed.' using errcode = '42501';
    end if;
    if old.status = 'posted' then
      -- The only permitted change: posted -> reversed, with nothing else edited.
      if new.status <> 'reversed'
         or new.txn_no is distinct from old.txn_no
         or new.kind is distinct from old.kind
         or new.fund_id is distinct from old.fund_id
         or new.category_id is distinct from old.category_id
         or new.amount is distinct from old.amount
         or new.txn_date is distinct from old.txn_date
         or new.description is distinct from old.description
         or new.reference_no is distinct from old.reference_no
         or new.payer_payee is distinct from old.payer_payee
         or new.member_id is distinct from old.member_id
         or new.payment_method is distinct from old.payment_method
         or new.reverses_transaction_id is distinct from old.reverses_transaction_id then
        raise exception 'Posted transactions cannot be edited. Reverse the transaction instead.' using errcode = '42501';
      end if;
    end if;
    new.updated_by := coalesce(auth.uid(), old.updated_by);
  end if;

  return new;
end;
$$;

create trigger financial_transactions_validate
before insert or update on public.financial_transactions
for each row execute function public.validate_financial_transaction();

create trigger financial_transactions_set_updated_at before update on public.financial_transactions
for each row execute function public.set_updated_at();

create or replace function public.guard_financial_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Posted transactions cannot be deleted. Reverse the transaction instead.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger financial_transactions_guard_delete before delete on public.financial_transactions
for each row execute function public.guard_financial_delete();

create trigger fund_transfers_immutable before update or delete on public.fund_transfers
for each row execute function public.prevent_audit_mutation();

create trigger audit_financial_transactions after insert or update or delete on public.financial_transactions
for each row execute function public.audit_row_change('financial_transaction');
create trigger audit_fund_transfers after insert on public.fund_transfers
for each row execute function public.audit_row_change('fund_transfer');
create trigger audit_financial_attachments after insert or delete on public.financial_attachments
for each row execute function public.audit_row_change('financial_attachment');
create trigger audit_funds after insert or update or delete on public.funds
for each row execute function public.audit_row_change('fund');
create trigger audit_financial_categories after insert or update or delete on public.financial_categories
for each row execute function public.audit_row_change('financial_category');

-- ---------------------------------------------------------------------------
-- Business functions
-- ---------------------------------------------------------------------------

create or replace function public._txn_from_jsonb(p jsonb)
returns public.financial_transactions
language plpgsql
stable
set search_path = ''
as $$
declare
  v public.financial_transactions;
  v_raw numeric;
begin
  -- Validate the raw value: casting into numeric(14,2) would silently round.
  begin
    v_raw := (p ->> 'amount')::numeric;
  exception when others then
    raise exception 'Enter a valid amount.' using errcode = '22023';
  end;
  if v_raw is null or v_raw <= 0 then
    raise exception 'Enter an amount greater than zero.' using errcode = '22023';
  end if;
  if v_raw <> round(v_raw, 2) then
    raise exception 'Amounts can have at most two decimal places.' using errcode = '22023';
  end if;
  if v_raw >= 1000000000000 then
    raise exception 'The amount is too large.' using errcode = '22023';
  end if;
  v := jsonb_populate_record(null::public.financial_transactions, p);
  return v;
end;
$$;

revoke execute on function public._txn_from_jsonb(jsonb) from public, anon, authenticated;

create or replace function public._post_transaction(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.transaction_kind;
  v_no text;
begin
  select kind into v_kind from public.financial_transactions where id = p_id and status = 'draft' for update;
  if not found then
    raise exception 'Only draft transactions can be posted.' using errcode = '22023';
  end if;
  v_no := public.next_document_number(
    'txn_' || v_kind::text,
    case v_kind when 'income' then 'INC' else 'EXP' end,
    6
  );
  update public.financial_transactions
  set status = 'posted', txn_no = v_no, posted_at = now(), posted_by = auth.uid()
  where id = p_id;
  return v_no;
end;
$$;

revoke execute on function public._post_transaction(uuid) from public, anon, authenticated;

-- Creates a transaction as a draft, or posts it immediately.
create or replace function public.create_transaction(p_data jsonb, p_post boolean default false)
returns table (id uuid, txn_no text, status public.transaction_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.financial_transactions;
  v_id uuid;
begin
  perform public.require_permission('finance.write');
  if p_post then
    perform public.require_permission('finance.post');
  end if;

  v := public._txn_from_jsonb(p_data);
  if v.txn_date is null or v.txn_date > public.today_manila() then
    raise exception 'The transaction date cannot be in the future.' using errcode = '22023';
  end if;

  insert into public.financial_transactions (
    kind, fund_id, category_id, amount, txn_date, description, reference_no, payer_payee, member_id, payment_method
  ) values (
    v.kind, v.fund_id, v.category_id, v.amount, v.txn_date, btrim(v.description),
    nullif(btrim(v.reference_no), ''), nullif(btrim(v.payer_payee), ''), v.member_id, coalesce(v.payment_method, 'cash')
  )
  returning financial_transactions.id into v_id;

  if p_post then
    perform public._post_transaction(v_id);
  end if;

  return query
  select t.id, t.txn_no, t.status from public.financial_transactions t where t.id = v_id;
end;
$$;

create or replace function public.update_draft_transaction(p_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.financial_transactions;
begin
  perform public.require_permission('finance.write');
  v := public._txn_from_jsonb(p_data);
  if v.txn_date is null or v.txn_date > public.today_manila() then
    raise exception 'The transaction date cannot be in the future.' using errcode = '22023';
  end if;

  update public.financial_transactions
  set kind = v.kind, fund_id = v.fund_id, category_id = v.category_id, amount = v.amount,
      txn_date = v.txn_date, description = btrim(v.description),
      reference_no = nullif(btrim(v.reference_no), ''), payer_payee = nullif(btrim(v.payer_payee), ''),
      member_id = v.member_id, payment_method = coalesce(v.payment_method, 'cash')
  where id = p_id and status = 'draft';

  if not found then
    raise exception 'Only draft transactions can be edited.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.delete_draft_transaction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('finance.write');
  delete from public.financial_transactions where id = p_id and status = 'draft';
  if not found then
    raise exception 'Only draft transactions can be deleted.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.post_transaction(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('finance.post');
  return public._post_transaction(p_id);
end;
$$;

-- Reverses a posted transaction by recording an offsetting entry.
create or replace function public.reverse_transaction(p_id uuid, p_reason text, p_reversal_date date default null)
returns table (id uuid, txn_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.financial_transactions;
  v_date date := coalesce(p_reversal_date, public.today_manila());
  v_id uuid;
  v_no text;
begin
  perform public.require_permission('finance.reverse');

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Please give a reason for the reversal.' using errcode = '22023';
  end if;

  select * into v_orig from public.financial_transactions t where t.id = p_id for update;
  if not found or v_orig.status <> 'posted' or v_orig.reverses_transaction_id is not null then
    raise exception 'Only a posted original transaction can be reversed.' using errcode = '22023';
  end if;
  if v_date < v_orig.txn_date or v_date > public.today_manila() then
    raise exception 'The reversal date must be between the transaction date and today.' using errcode = '22023';
  end if;

  v_no := public.next_document_number('txn_reversal', 'REV', 6);

  insert into public.financial_transactions (
    txn_no, kind, fund_id, category_id, amount, txn_date, description, reference_no, payer_payee,
    member_id, payment_method, status, reverses_transaction_id, reversal_reason, posted_at, posted_by
  ) values (
    v_no, v_orig.kind, v_orig.fund_id, v_orig.category_id, v_orig.amount, v_date,
    left('Reversal of ' || v_orig.txn_no || ': ' || v_orig.description, 500),
    v_orig.txn_no, v_orig.payer_payee, v_orig.member_id, v_orig.payment_method,
    'posted', v_orig.id, btrim(p_reason), now(), auth.uid()
  )
  returning financial_transactions.id into v_id;

  update public.financial_transactions t
  set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = btrim(p_reason)
  where t.id = v_orig.id;

  return query select v_id, v_no;
end;
$$;

create or replace function public.create_fund_transfer(
  p_from_fund_id uuid,
  p_to_fund_id uuid,
  p_amount numeric,
  p_transfer_date date,
  p_reason text
)
returns table (id uuid, transfer_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_no text;
begin
  perform public.require_permission('finance.manage_funds');
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a valid amount greater than zero.' using errcode = '22023';
  end if;
  if p_transfer_date is null or p_transfer_date > public.today_manila() then
    raise exception 'The transfer date cannot be in the future.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.funds f where f.id = p_from_fund_id and f.is_active)
     or not exists (select 1 from public.funds f where f.id = p_to_fund_id and f.is_active) then
    raise exception 'Both funds must be active.' using errcode = '22023';
  end if;

  v_no := public.next_document_number('fund_transfer', 'TRF', 6);
  insert into public.fund_transfers (transfer_no, from_fund_id, to_fund_id, amount, transfer_date, reason)
  values (v_no, p_from_fund_id, p_to_fund_id, p_amount, p_transfer_date, btrim(p_reason))
  returning fund_transfers.id into v_id;

  return query select v_id, v_no;
end;
$$;

create or replace function public.reverse_fund_transfer(p_id uuid, p_reason text)
returns table (id uuid, transfer_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.fund_transfers;
  v_id uuid;
  v_no text;
begin
  perform public.require_permission('finance.manage_funds');
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Please give a reason for the reversal.' using errcode = '22023';
  end if;
  select * into v_orig from public.fund_transfers t where t.id = p_id for update;
  if not found or v_orig.reverses_transfer_id is not null then
    raise exception 'Only an original transfer can be reversed.' using errcode = '22023';
  end if;
  if exists (select 1 from public.fund_transfers t where t.reverses_transfer_id = p_id) then
    raise exception 'This transfer has already been reversed.' using errcode = '22023';
  end if;

  v_no := public.next_document_number('fund_transfer', 'TRF', 6);
  insert into public.fund_transfers (transfer_no, from_fund_id, to_fund_id, amount, transfer_date, reason, reverses_transfer_id)
  values (v_no, v_orig.to_fund_id, v_orig.from_fund_id, v_orig.amount, public.today_manila(),
          left('Reversal of ' || v_orig.transfer_no || ': ' || btrim(p_reason), 500), v_orig.id)
  returning fund_transfers.id into v_id;

  return query select v_id, v_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting functions (money returned as text)
-- ---------------------------------------------------------------------------

-- Effective ledger: posted originals, reversed originals and reversals.
-- Reversal entries carry a negative sign so they offset the original.
create view public.finance_ledger
with (security_invoker = true)
as
select
  t.id,
  t.txn_no,
  t.kind,
  t.fund_id,
  t.category_id,
  t.txn_date,
  t.status,
  t.reverses_transaction_id,
  case when t.reverses_transaction_id is null then t.amount else -t.amount end as signed_amount
from public.financial_transactions t
where t.status in ('posted', 'reversed');

create or replace function public._require_finance_report()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_permission(array['finance.read', 'reports.finance']) then
    raise exception 'You do not have permission to view financial reports.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public._require_finance_report() from public, anon, authenticated;

-- Fund balances as of a date, separating cash received, cash disbursed and
-- allocations (transfers) between funds.
create or replace function public.get_fund_balances(p_as_of date default null)
returns table (
  fund_id uuid,
  code text,
  name text,
  is_restricted boolean,
  is_active boolean,
  opening_balance text,
  cash_received text,
  cash_disbursed text,
  transfers_in text,
  transfers_out text,
  available_balance text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_as_of date := coalesce(p_as_of, public.today_manila());
begin
  perform public._require_finance_report();
  return query
  with ledger as (
    select l.fund_id,
      sum(l.signed_amount) filter (where l.kind = 'income') as income,
      sum(l.signed_amount) filter (where l.kind = 'expense') as expense
    from (
      select t.fund_id, t.kind,
             case when t.reverses_transaction_id is null then t.amount else -t.amount end as signed_amount
      from public.financial_transactions t
      where t.status in ('posted', 'reversed') and t.txn_date <= v_as_of
    ) l
    group by l.fund_id
  ),
  transfers as (
    select x.fund_id, sum(x.amount_in) as amount_in, sum(x.amount_out) as amount_out
    from (
      select ft.to_fund_id as fund_id, ft.amount as amount_in, 0::numeric as amount_out
      from public.fund_transfers ft where ft.transfer_date <= v_as_of
      union all
      select ft.from_fund_id, 0::numeric, ft.amount
      from public.fund_transfers ft where ft.transfer_date <= v_as_of
    ) x
    group by x.fund_id
  )
  select
    f.id, f.code, f.name, f.is_restricted, f.is_active,
    (case when f.opening_balance_date is null or f.opening_balance_date <= v_as_of then f.opening_balance else 0 end)::numeric(14,2)::text,
    coalesce(l.income, 0)::numeric(14,2)::text,
    coalesce(l.expense, 0)::numeric(14,2)::text,
    coalesce(tr.amount_in, 0)::numeric(14,2)::text,
    coalesce(tr.amount_out, 0)::numeric(14,2)::text,
    (
      (case when f.opening_balance_date is null or f.opening_balance_date <= v_as_of then f.opening_balance else 0 end)
      + coalesce(l.income, 0) - coalesce(l.expense, 0) + coalesce(tr.amount_in, 0) - coalesce(tr.amount_out, 0)
    )::numeric(14,2)::text
  from public.funds f
  left join ledger l on l.fund_id = f.id
  left join transfers tr on tr.fund_id = f.id
  order by f.sort_order, f.name;
end;
$$;

-- Income and expense totals per category for a period.
create or replace function public.get_finance_category_summary(p_from date, p_to date, p_fund_id uuid default null)
returns table (kind public.transaction_kind, category_id uuid, category_name text, total text, entry_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._require_finance_report();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Select a valid date range.' using errcode = '22023';
  end if;
  return query
  select c.kind, c.id, c.name,
         coalesce(sum(case when t.reverses_transaction_id is null then t.amount else -t.amount end), 0)::numeric(14,2)::text,
         count(t.id) filter (where t.reverses_transaction_id is null)::int
  from public.financial_categories c
  left join public.financial_transactions t
    on t.category_id = c.id
   and t.status in ('posted', 'reversed')
   and t.txn_date between p_from and p_to
   and (p_fund_id is null or t.fund_id = p_fund_id)
  group by c.id
  having count(t.id) > 0 or c.is_active
  order by c.kind, c.sort_order, c.name;
end;
$$;

-- Monthly income/expense totals for a date range (inclusive).
create or replace function public.get_finance_monthly_summary(p_from date, p_to date, p_fund_id uuid default null)
returns table (month date, income text, expense text, net text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._require_finance_report();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Select a valid date range.' using errcode = '22023';
  end if;
  return query
  with months as (
    select generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month')::date as m
  ),
  totals as (
    select date_trunc('month', t.txn_date)::date as m,
      sum(case when t.reverses_transaction_id is null then t.amount else -t.amount end) filter (where t.kind = 'income') as income,
      sum(case when t.reverses_transaction_id is null then t.amount else -t.amount end) filter (where t.kind = 'expense') as expense
    from public.financial_transactions t
    where t.status in ('posted', 'reversed')
      and t.txn_date between p_from and p_to
      and (p_fund_id is null or t.fund_id = p_fund_id)
    group by 1
  )
  select mo.m,
         coalesce(tt.income, 0)::numeric(14,2)::text,
         coalesce(tt.expense, 0)::numeric(14,2)::text,
         (coalesce(tt.income, 0) - coalesce(tt.expense, 0))::numeric(14,2)::text
  from months mo
  left join totals tt on tt.m = mo.m
  order by mo.m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security & privileges
-- ---------------------------------------------------------------------------

alter table public.funds enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.fund_transfers enable row level security;
alter table public.financial_attachments enable row level security;

create policy funds_select on public.funds for select to authenticated
  using ((select public.has_any_permission(array['finance.read', 'finance.write', 'reports.finance'])));
create policy funds_write on public.funds for all to authenticated
  using ((select public.has_permission('finance.manage_funds')))
  with check ((select public.has_permission('finance.manage_funds')));
revoke delete on public.funds from authenticated;

create policy financial_categories_select on public.financial_categories for select to authenticated
  using ((select public.has_any_permission(array['finance.read', 'finance.write', 'reports.finance'])));
create policy financial_categories_write on public.financial_categories for all to authenticated
  using ((select public.has_permission('finance.manage_funds')))
  with check ((select public.has_permission('finance.manage_funds')));
revoke delete on public.financial_categories from authenticated;

create policy financial_transactions_select on public.financial_transactions for select to authenticated
  using ((select public.has_permission('finance.read')));
revoke insert, update, delete, truncate on public.financial_transactions from authenticated;

create policy fund_transfers_select on public.fund_transfers for select to authenticated
  using ((select public.has_permission('finance.read')));
revoke insert, update, delete, truncate on public.fund_transfers from authenticated;

create policy financial_attachments_select on public.financial_attachments for select to authenticated
  using ((select public.has_permission('finance.read')));
create policy financial_attachments_insert on public.financial_attachments for insert to authenticated
  with check (
    (select public.has_permission('finance.write'))
    and exists (select 1 from public.financial_transactions t where t.id = transaction_id and t.status <> 'reversed')
  );
create policy financial_attachments_delete on public.financial_attachments for delete to authenticated
  using (
    (select public.has_permission('finance.write'))
    and exists (select 1 from public.financial_transactions t where t.id = transaction_id and t.status = 'draft')
  );
revoke update on public.financial_attachments from authenticated;

grant select on public.finance_ledger to authenticated;

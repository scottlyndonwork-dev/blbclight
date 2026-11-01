-- Dashboard and report aggregation functions. Each section is computed in a
-- single round trip and returned only to users permitted to see it.

-- Membership statistics; p_from/p_to bound "new members".
create or replace function public.get_membership_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.has_any_permission(array['members.read', 'reports.membership']) then
    return null;
  end if;
  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where s.counts_as_active),
    'inactive', count(*) filter (where s.key = 'inactive'),
    'pending', count(*) filter (where s.key = 'pending'),
    'transferred', count(*) filter (where s.key = 'transferred'),
    'new_members', count(*) filter (where m.date_registered between p_from and p_to),
    'baptized', count(*) filter (where exists (select 1 from public.baptism_records b where b.member_id = m.id)),
    'by_status', (
      select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'name', x.name, 'color', x.color, 'count', x.cnt) order by x.sort_order), '[]'::jsonb)
      from (
        select st.key, st.name, st.color, st.sort_order, count(mm.id) as cnt
        from public.membership_statuses st
        left join public.members mm on mm.current_status_id = st.id and mm.archived_at is null
        group by st.id
      ) x
    )
  )
  into v
  from public.members m
  join public.membership_statuses s on s.id = m.current_status_id
  where m.archived_at is null;
  return v;
end;
$$;

-- Attendance statistics for sessions in the period.
create or replace function public.get_attendance_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sessions jsonb;
  v_latest jsonb;
  v_avg numeric;
  v_avg_pct numeric;
  v_weekly jsonb;
begin
  if not public.has_any_permission(array['attendance.read', 'reports.attendance']) then
    return null;
  end if;

  with s as (
    select a.id, a.session_date, a.start_time, t.name as service_name,
           (select count(*) from public.attendance_records r where r.session_id = a.id and r.status in ('present', 'late')) as attended,
           public.active_member_count_as_of(a.session_date) as active_members
    from public.attendance_sessions a
    join public.service_types t on t.id = a.service_type_id
    where a.session_date between p_from and p_to
  )
  select
    avg(s.attended),
    avg(case when s.active_members > 0 then s.attended::numeric * 100 / s.active_members end),
    (
      select jsonb_build_object(
        'session_id', l.id, 'session_date', l.session_date, 'service_name', l.service_name,
        'attended', l.attended, 'active_members', l.active_members,
        'percentage', case when l.active_members > 0 then round(l.attended::numeric * 100 / l.active_members, 1) end
      )
      from s l order by l.session_date desc, l.start_time desc limit 1
    )
  into v_avg, v_avg_pct, v_latest
  from s;

  select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'attended', w.attended, 'sessions', w.sessions) order by w.week), '[]'::jsonb)
  into v_weekly
  from (
    select date_trunc('week', a.session_date)::date as week,
           count(distinct a.id) as sessions,
           count(r.id) filter (where r.status in ('present', 'late')) as attended
    from public.attendance_sessions a
    left join public.attendance_records r on r.session_id = a.id
    where a.session_date between p_from and p_to
    group by 1
  ) w;

  select jsonb_build_object('count', count(*)) into v_sessions
  from public.attendance_sessions a where a.session_date between p_from and p_to;

  return jsonb_build_object(
    'session_count', v_sessions -> 'count',
    'average_attendance', round(coalesce(v_avg, 0), 1),
    'average_percentage', round(coalesce(v_avg_pct, 0), 1),
    'latest', v_latest,
    'weekly', v_weekly
  );
end;
$$;

create or replace function public.get_certificate_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.has_any_permission(array['certificates.read', 'reports.certificates']) then
    return null;
  end if;
  select jsonb_build_object(
    'total_all_time', (select count(*) from public.certificates c where c.status <> 'voided'),
    'issued_in_period', (select count(*) from public.certificates c where c.issued_on between p_from and p_to),
    'voided_in_period', (select count(*) from public.certificates c where c.status = 'voided' and c.issued_on between p_from and p_to),
    'by_type', (
      select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'count', x.cnt) order by x.sort_order), '[]'::jsonb)
      from (
        select t.code, t.name, t.sort_order,
               count(c.id) filter (where c.status <> 'voided' and c.issued_on between p_from and p_to) as cnt
        from public.certificate_types t
        left join public.certificates c on c.type_id = t.id
        group by t.id
      ) x
    )
  ) into v;
  return v;
end;
$$;

create or replace function public.get_finance_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.has_any_permission(array['finance.read', 'reports.finance']) then
    return null;
  end if;
  with l as (
    select t.kind, c.name as category_name,
           case when t.reverses_transaction_id is null then t.amount else -t.amount end as amt
    from public.financial_transactions t
    join public.financial_categories c on c.id = t.category_id
    where t.status in ('posted', 'reversed') and t.txn_date between p_from and p_to
  )
  select jsonb_build_object(
    'income', coalesce(sum(l.amt) filter (where l.kind = 'income'), 0)::numeric(14,2)::text,
    'expense', coalesce(sum(l.amt) filter (where l.kind = 'expense'), 0)::numeric(14,2)::text,
    'net', (coalesce(sum(l.amt) filter (where l.kind = 'income'), 0) - coalesce(sum(l.amt) filter (where l.kind = 'expense'), 0))::numeric(14,2)::text,
    'tithes', coalesce(sum(l.amt) filter (where l.kind = 'income' and l.category_name = 'Tithes'), 0)::numeric(14,2)::text,
    'offerings', coalesce(sum(l.amt) filter (where l.kind = 'income' and l.category_name ilike '%offering%'), 0)::numeric(14,2)::text
  ) into v
  from l;
  return v;
end;
$$;

-- Attendance report grouped by day, week, month or year.
create or replace function public.get_attendance_report(
  p_from date,
  p_to date,
  p_group text default 'week',
  p_service_type_id uuid default null
)
returns table (
  period date,
  sessions int,
  present int,
  late int,
  excused int,
  absent int,
  visitors int,
  average_attendance numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_permission(array['attendance.read', 'reports.attendance']) then
    raise exception 'You do not have permission to view attendance reports.' using errcode = '42501';
  end if;
  if p_group not in ('day', 'week', 'month', 'year') then
    raise exception 'Invalid grouping.' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Select a valid date range.' using errcode = '22023';
  end if;

  return query
  with per_session as (
    select a.id, a.session_date,
      count(r.id) filter (where r.status = 'present') as present,
      count(r.id) filter (where r.status = 'late') as late,
      count(r.id) filter (where r.status = 'excused') as excused,
      count(r.id) filter (where r.status = 'absent') as absent,
      (select count(*) from public.visitors v where v.session_id = a.id) as visitors
    from public.attendance_sessions a
    left join public.attendance_records r on r.session_id = a.id
    where a.session_date between p_from and p_to
      and (p_service_type_id is null or a.service_type_id = p_service_type_id)
    group by a.id
  )
  select
    date_trunc(p_group, ps.session_date)::date,
    count(*)::int,
    sum(ps.present)::int,
    sum(ps.late)::int,
    sum(ps.excused)::int,
    sum(ps.absent)::int,
    sum(ps.visitors)::int,
    round(avg(ps.present + ps.late), 1)
  from per_session ps
  group by 1
  order by 1;
end;
$$;

-- Individual member attendance summary for a period.
create or replace function public.get_member_attendance_summary(p_member_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.has_any_permission(array['attendance.read', 'reports.attendance']) then
    return null;
  end if;
  select jsonb_build_object(
    'sessions_held', (select count(*) from public.attendance_sessions a where a.session_date between p_from and p_to),
    'present', count(*) filter (where r.status = 'present'),
    'late', count(*) filter (where r.status = 'late'),
    'excused', count(*) filter (where r.status = 'excused'),
    'absent', count(*) filter (where r.status = 'absent')
  ) into v
  from public.attendance_records r
  join public.attendance_sessions a on a.id = r.session_id
  where r.member_id = p_member_id and a.session_date between p_from and p_to;
  return v;
end;
$$;

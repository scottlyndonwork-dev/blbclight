-- =============================================================================
-- DEVELOPMENT / TESTING DEMO DATA ONLY. NEVER LOAD INTO PRODUCTION.
-- Every demo person is marked with the note 'DEMO DATA' so it can be removed:
--   delete is blocked by design; archive them instead, or reset the database.
-- Reference data (roles, permissions, statuses, funds, categories, templates)
-- is created by the migrations, not here.
-- =============================================================================

update public.church_settings
set church_name = 'Grace Demo Church', short_name = 'GDC', address = 'Quezon City, Metro Manila'
where id and church_name = 'Church Name';

insert into public.ministries (name, description) values
  ('Music Ministry', 'Worship team and choir'),
  ('Youth Ministry', 'Ministry for young people'),
  ('Children''s Ministry', 'Sunday school and children''s worship'),
  ('Ushering', 'Welcome and ushering team')
on conflict (name) do nothing;

do $$
declare
  v_active uuid := (select id from public.membership_statuses where key = 'active');
  v_names text[][] := array[
    array['Juan', 'Dela Cruz', 'male', '1985-03-14'],
    array['Maria', 'Santos', 'female', '1990-07-22'],
    array['Jose', 'Reyes', 'male', '1978-11-02'],
    array['Ana', 'Garcia', 'female', '1995-01-30'],
    array['Pedro', 'Mendoza', 'male', '2001-05-17'],
    array['Rosa', 'Bautista', 'female', '1969-09-09'],
    array['Carlo', 'Villanueva', 'male', '1988-12-25'],
    array['Liza', 'Ramos', 'female', '1999-04-04']
  ];
  i int;
  v_id uuid;
begin
  if exists (select 1 from public.members where notes = 'DEMO DATA') then
    return;
  end if;
  for i in 1 .. array_length(v_names, 1) loop
    v_id := public._insert_member(
      jsonb_build_object(
        'first_name', v_names[i][1],
        'last_name', v_names[i][2],
        'gender', v_names[i][3],
        'birthdate', v_names[i][4],
        'city', 'Quezon City',
        'date_registered', '2024-01-07',
        'membership_date', '2024-02-04',
        'notes', 'DEMO DATA'
      ),
      v_active,
      'Demo data'
    );
    if i % 2 = 0 then
      insert into public.baptism_records (member_id, baptism_date, location, officiant)
      values (v_id, date '2024-03-31', 'Main Sanctuary', 'Rev. Demo Pastor');
    end if;
  end loop;
end;
$$;

-- Four Sunday services with attendance.
do $$
declare
  v_type uuid := (select id from public.service_types where code = 'sunday_morning');
  v_session uuid;
  d date;
begin
  if exists (select 1 from public.attendance_sessions where title = 'DEMO Sunday Service') then
    return;
  end if;
  foreach d in array array[date '2025-06-01', date '2025-06-08', date '2025-06-15', date '2025-06-22'] loop
    insert into public.attendance_sessions (service_type_id, session_date, start_time, title, status)
    values (v_type, d, '09:00', 'DEMO Sunday Service', 'closed')
    returning id into v_session;
    insert into public.attendance_records (session_id, member_id, status, method)
    select v_session, m.id, case when random() < 0.8 then 'present' else 'absent' end::public.attendance_status, 'manual'
    from public.members m where m.notes = 'DEMO DATA';
  end loop;
end;
$$;

-- Posted demo transactions.
do $$
declare
  v_general uuid := (select id from public.funds where code = 'GENERAL');
  v_tithes uuid := (select id from public.financial_categories where kind = 'income' and name = 'Tithes');
  v_offering uuid := (select id from public.financial_categories where kind = 'income' and name = 'Sunday Offerings');
  v_utilities uuid := (select id from public.financial_categories where kind = 'expense' and name = 'Utilities');
begin
  if exists (select 1 from public.financial_transactions where description like 'DEMO%') then
    return;
  end if;
  insert into public.financial_transactions (txn_no, kind, fund_id, category_id, amount, txn_date, description, status, posted_at)
  values
    (public.next_document_number('txn_income', 'INC', 6), 'income', v_general, v_tithes, 12500.00, '2025-06-01', 'DEMO Tithes', 'posted', now()),
    (public.next_document_number('txn_income', 'INC', 6), 'income', v_general, v_offering, 4380.50, '2025-06-01', 'DEMO Sunday offering', 'posted', now()),
    (public.next_document_number('txn_expense', 'EXP', 6), 'expense', v_general, v_utilities, 3215.75, '2025-06-05', 'DEMO Electricity bill', 'posted', now());
end;
$$;

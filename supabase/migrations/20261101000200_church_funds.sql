-- The church keeps two funds: General Fund and Missions Fund.
-- The other starter funds are removed when they were never used, and
-- deactivated otherwise, so existing financial records stay intact.

update public.funds
   set name = 'Missions Fund',
       description = 'Designated for missions and outreach.'
 where code = 'MISSION';

delete from public.funds f
 where f.code in ('BUILDING', 'YOUTH')
   and f.opening_balance = 0
   and not exists (select 1 from public.financial_transactions t where t.fund_id = f.id)
   and not exists (select 1 from public.fund_transfers x where x.from_fund_id = f.id or x.to_fund_id = f.id);

update public.funds
   set is_active = false
 where code in ('BUILDING', 'YOUTH');

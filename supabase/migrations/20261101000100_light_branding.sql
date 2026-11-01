-- The system is named LIGHT (Leadership Information, Governance, and
-- Holistic Tracking). Update the settings defaults, and the existing row
-- where it still holds the old defaults.

alter table public.church_settings
  alter column short_name set default 'LIGHT',
  alter column member_no_prefix set default 'LGT';

update public.church_settings
   set short_name = case when short_name = 'GRACE' then 'LIGHT' else short_name end,
       member_no_prefix = case when member_no_prefix = 'GRC' then 'LGT' else member_no_prefix end
 where short_name = 'GRACE' or member_no_prefix = 'GRC';

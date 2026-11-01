-- Reference data required in every environment: roles, permissions and the
-- default role/permission matrix. Super administrators implicitly hold all
-- permissions (see public.has_permission).

insert into public.permissions (key, module, description) values
  ('members.read',               'members',      'View member records'),
  ('members.write',              'members',      'Register and edit members'),
  ('members.archive',            'members',      'Archive and restore member records'),
  ('members.import',             'members',      'Import members from spreadsheets'),
  ('members.export',             'members',      'Export member records'),
  ('membership.status_change',   'membership',   'Change membership status'),
  ('baptism.write',              'members',      'Record baptism information'),
  ('attendance.read',            'attendance',   'View attendance sessions and records'),
  ('attendance.write',           'attendance',   'Create sessions and record attendance'),
  ('attendance.correct',         'attendance',   'Correct attendance on closed sessions'),
  ('certificates.read',          'certificates', 'View issued certificates'),
  ('certificates.issue',         'certificates', 'Issue and reprint certificates'),
  ('certificates.void',          'certificates', 'Void or replace certificates'),
  ('certificates.templates',     'certificates', 'Manage certificate templates and signatories'),
  ('finance.read',               'finance',      'View financial transactions'),
  ('finance.write',              'finance',      'Record income and expenses'),
  ('finance.post',               'finance',      'Post transactions to the books'),
  ('finance.reverse',            'finance',      'Reverse posted transactions'),
  ('finance.manage_funds',       'finance',      'Manage funds, categories and transfers'),
  ('reports.membership',         'reports',      'View membership reports'),
  ('reports.attendance',         'reports',      'View attendance reports'),
  ('reports.certificates',       'reports',      'View certificate reports'),
  ('reports.finance',            'reports',      'View financial reports'),
  ('users.manage',               'admin',        'Manage users, roles and permissions'),
  ('audit.read',                 'admin',        'View audit logs'),
  ('settings.manage',            'admin',        'Manage system settings');

insert into public.roles (key, name, description, is_system) values
  ('super_admin',        'Super Administrator',        'Full access to every module and setting.', true),
  ('church_admin',       'Church Administrator',       'Manages church records, members and attendance.', true),
  ('secretary',          'Secretary / Records Officer','Manages member and baptism records and issues certificates.', true),
  ('attendance_officer', 'Attendance Officer',         'Creates attendance sessions and records attendance.', true),
  ('treasurer',          'Treasurer',                  'Manages income, expenses, funds and financial reports.', true),
  ('pastor',             'Pastor / Church Leadership', 'Views church-wide reports and authorized records.', true);

with matrix(role_key, permission_key) as (
  values
    ('church_admin', 'members.read'), ('church_admin', 'members.write'), ('church_admin', 'members.archive'),
    ('church_admin', 'members.import'), ('church_admin', 'members.export'), ('church_admin', 'membership.status_change'),
    ('church_admin', 'baptism.write'), ('church_admin', 'attendance.read'), ('church_admin', 'attendance.write'),
    ('church_admin', 'attendance.correct'), ('church_admin', 'certificates.read'),
    ('church_admin', 'reports.membership'), ('church_admin', 'reports.attendance'), ('church_admin', 'reports.certificates'),

    ('secretary', 'members.read'), ('secretary', 'members.write'), ('secretary', 'members.archive'),
    ('secretary', 'members.import'), ('secretary', 'members.export'), ('secretary', 'membership.status_change'),
    ('secretary', 'baptism.write'), ('secretary', 'attendance.read'), ('secretary', 'certificates.read'),
    ('secretary', 'certificates.issue'), ('secretary', 'certificates.void'), ('secretary', 'certificates.templates'),
    ('secretary', 'reports.membership'), ('secretary', 'reports.certificates'),

    ('attendance_officer', 'attendance.read'), ('attendance_officer', 'attendance.write'),
    ('attendance_officer', 'attendance.correct'), ('attendance_officer', 'reports.attendance'),

    ('treasurer', 'finance.read'), ('treasurer', 'finance.write'), ('treasurer', 'finance.post'),
    ('treasurer', 'finance.reverse'), ('treasurer', 'finance.manage_funds'), ('treasurer', 'reports.finance'),

    ('pastor', 'members.read'), ('pastor', 'attendance.read'), ('pastor', 'certificates.read'),
    ('pastor', 'reports.membership'), ('pastor', 'reports.attendance'), ('pastor', 'reports.certificates'),
    ('pastor', 'reports.finance')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from matrix m
join public.roles r on r.key = m.role_key
join public.permissions p on p.key = m.permission_key;

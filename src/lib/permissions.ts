/**
 * Permission keys. Mirrors public.permissions in the database; the database
 * remains the source of truth and enforces every check through RLS and
 * SECURITY DEFINER functions. These are used for UI visibility and early
 * server-side checks.
 */
export const PERMISSIONS = [
  "members.read",
  "members.write",
  "members.archive",
  "members.import",
  "members.export",
  "membership.status_change",
  "baptism.write",
  "attendance.read",
  "attendance.write",
  "attendance.correct",
  "certificates.read",
  "certificates.issue",
  "certificates.void",
  "certificates.templates",
  "finance.read",
  "finance.write",
  "finance.post",
  "finance.reverse",
  "finance.manage_funds",
  "reports.membership",
  "reports.attendance",
  "reports.certificates",
  "reports.finance",
  "users.manage",
  "audit.read",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export type PermissionSet = ReadonlySet<Permission>;

export function hasPermission(set: PermissionSet, permission: Permission): boolean {
  return set.has(permission);
}

export function hasAnyPermission(set: PermissionSet, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => set.has(p));
}

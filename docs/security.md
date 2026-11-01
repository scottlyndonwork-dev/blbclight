# Security and data privacy

LIGHT stores **sensitive personal information** under the Philippine Data Privacy Act of 2012 (RA 10173): religious affiliation, membership, baptism and family details, contact information and giving records. This document describes the technical controls and the operational duties of the church as personal information controller.

## Technical controls

| Area | Control |
|---|---|
| Authentication | Supabase Auth, email and password. Sign-ups are disabled; accounts are created by invitation only. Passwords need at least 10 characters with letters and numbers. Sessions are refreshed by the proxy, and every server check uses a verified `getUser()`. |
| Authorization | Role-based permissions in `roles` / `permissions` / `role_permissions` / `user_roles`. `public.has_permission()` is used by **every** RLS policy and every SECURITY DEFINER function. Deactivated accounts lose all permissions immediately and are also banned in Supabase Auth. |
| Row Level Security | Enabled on every table (verified by an automated test). Sensitive tables (members, status history, attendance records, certificates, transactions, audit logs) do not allow direct inserts or updates; writes go through permission-checked functions. Column-level grants stop protected fields (member number, status, archive fields) from being edited directly. |
| Anonymous access | The `anon` role has no table privileges and can execute exactly one function, `verify_certificate` (verified by test). |
| Service role key | Used only in `src/server/supabase/admin.ts` (marked `server-only`, blocked from client code by a lint rule) for invitations, account suspension and recording failed sign-ins. |
| Integrity | Constraints, check constraints and triggers make issued certificates, posted transactions, transfers, status history and audit logs immutable. Corrections create new linked records. |
| Audit | `audit_logs` records sign-ins (successful and failed), sign-outs, password changes, every insert, update or delete of audited records with before/after values, certificate printing, imports and exports. Nobody can edit or delete it, including administrators. |
| Files | Private buckets with size and type limits enforced by Storage, plus server-side magic-byte checks. Files are served through short-lived signed URLs (2–10 minutes) and are never sent through a shared image cache. |
| Web | Strict security headers (HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy). Server Actions are protected against CSRF by origin checks. Exports set `Cache-Control: private, no-store`. Spreadsheet exports neutralize formula injection. |
| Input | Zod validation in the browser and again on the server; database constraints as the final check. Search terms are escaped before use in filters. |
| Public verification | Returns only reference number, certificate type, issue date, validity and an abbreviated name ("Juan D."). Lookup is by a 128-bit random token only. |

## Operational duties (RA 10173)

1. **Appoint a Data Protection Officer** and register with the National Privacy Commission if required.
2. **Lawful basis and notice.** Inform members why their data is collected (church records and pastoral care) and obtain consent where required. The member form displays a privacy notice.
3. **Least privilege.** Give each person only the roles their duties require. Review users and roles at least every quarter, and deactivate accounts immediately when someone leaves.
4. **Access requests and corrections.** Members may request access to or correction of their records; use the member profile and the audit log to respond.
5. **Retention.** Archive rather than delete; archived records are hidden from daily use. Define and document how long records are kept.
6. **Exports and printouts.** Exports are logged. Store exported files securely and delete them when no longer needed. Never share member lists outside authorized personnel.
7. **Breach response.** If you suspect unauthorized access, deactivate the affected accounts, rotate the Supabase keys, review the audit logs, and notify the NPC and affected members within the required period (72 hours).
8. **Backups** are encrypted (see `backup-recovery.md`). Keep the backup passphrase offline and limited to two trusted people.

## Key rotation

If the service role key or database password may have leaked: rotate the key in Supabase (*Project Settings → API*), update Vercel and `.env.local`, redeploy, rotate `SUPABASE_DB_URL` in the GitHub secrets, and review `audit_logs` for unusual activity.

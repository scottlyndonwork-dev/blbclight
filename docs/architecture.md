# LIGHT architecture

## Overview

LIGHT is a **modular monolith**: one Next.js application deployed to Vercel, backed by one Supabase project (PostgreSQL, Auth, Storage). It serves a single church; there is no tenant column.

```
Browser ──► Next.js on Vercel
             ├─ Server Components    read data with the user's session (RLS applies)
             ├─ Server Actions       validate (Zod) → authorize → call SQL functions / RLS-guarded writes
             ├─ Route Handlers       PDF certificates, report and data exports, auth email links
             └─ Proxy (src/proxy.ts) refreshes the session cookie, redirects signed-out users
          ──► Supabase
             ├─ PostgreSQL           tables, constraints, RLS, SECURITY DEFINER business functions, audit triggers
             ├─ Auth                 email/password, invitation-only
             └─ Storage              private buckets (member photos, finance attachments, church assets)
```

## Layers and responsibilities

| Layer | Location | Responsibility |
|---|---|---|
| Database | `supabase/migrations` | **Source of truth for every business rule**: constraints, permissions (`has_permission`), RLS, multi-step operations as functions, audit triggers |
| Server data access | `src/server/**` | Typed queries and reports; runs only on the server (`server-only`) |
| Server actions | `src/features/*/actions.ts` | Input validation, early permission check, calling the database, revalidating pages, returning `ActionResult` |
| UI | `src/app/**`, `src/features/*/components`, `src/components` | Server Components by default; Client Components only for interaction |
| Pure utilities | `src/lib` | Exact money math, Manila dates, permission helpers, error translation. Unit tested. |

## Key design decisions

- **Defense in depth.** The interface hides what a user cannot do; server actions re-check the permission; the database enforces it again through RLS and checks inside every SECURITY DEFINER function. The database is the real guarantee. See [ADR 0002](adr/0002-authorization-in-the-database.md).
- **Multi-step operations are SQL functions** (`register_member`, `change_member_status`, `record_attendance`, `issue_certificate`, `void_certificate`, `create_transaction`, `post_transaction`, `reverse_transaction`, `create_fund_transfer`, `import_members`, …). Each runs in one transaction, so partial writes cannot happen.
- **Gapless document numbers** (`LGT-2026-00001`, `BAP-2026-000001`, `INC-2026-000001`) come from `id_counters`, incremented under a row lock inside the same transaction as the insert.
- **History is never overwritten.** Membership status changes append to `membership_status_history`; issued certificates are immutable (void or replace); posted transactions are immutable (reverse); fund transfers are immutable (reverse); audit logs are append-only. Triggers enforce all of this.
- **Money** is `numeric(14,2)` in the database and always leaves it as **text**. TypeScript uses decimal strings and `bigint` centavos (`src/lib/money.ts`). Floats are used only to draw charts.
- **Time**: timestamps are `timestamptz`; calendar dates are `date`. "Today", reporting periods and display use **Asia/Manila**.
- **Caching**: Cache Components is enabled. Authenticated pages read the session inside `<Suspense>`, so the static shell prerenders and personal data streams per request. No member or financial data is placed in a shared cache. Mutations call `revalidatePath`.
- **Certificates are rendered from a frozen snapshot** stored at issuance (`certificates.data`), so reprints are identical even if the template, church name or signatories change later.
- **Public verification** goes through one anon-callable function, `verify_certificate(token)`. It returns only reference number, type, issue date, validity and an abbreviated name. Tokens are 128-bit random values; sequential reference numbers are never accepted as lookup keys.

## Data model (summary)

```
auth.users 1─1 profiles 1─* user_roles *─1 roles *─* permissions (role_permissions)
members *─1 membership_categories ; members *─1 membership_statuses (current)
members 1─* membership_status_history ; members 1─0..1 baptism_records
members *─* ministries (member_ministries) ; households 1─* household_members *─1 members
service_types 1─* attendance_sessions 1─* attendance_records *─1 members ; attendance_sessions 1─* visitors
certificate_types 1─* certificate_templates 1─* certificates *─0..1 members ; certificates *─* certificate_signatories
certificates 0..1─ replaces certificate
funds 1─* financial_transactions *─1 financial_categories ; financial_transactions 1─* financial_attachments
financial_transactions 0..1─ reverses transaction ; fund_transfers (from_fund → to_fund, 0..1 reverses)
audit_logs (append-only) ; church_settings (singleton) ; id_counters
```

Fund balance = opening balance + posted income − posted expenses + allocations in − allocations out. Reversal entries carry the opposite sign and are booked on their own date, so period reports show corrections in the period they were made.

## Performance

- Server-side pagination (25–50 rows) on every list; explicit column selection; no N+1 queries (embedded selects, aggregate SQL functions).
- Indexes on every foreign key and the frequent filters: trigram index for member search, partial index for active members, date indexes for sessions, certificates and transactions, and composite indexes for the audit log.
- Dashboard sections are single aggregate SQL calls executed in parallel.
- Attendance entry saves one record per keystroke-Enter without reloading the page; counters update locally.
- PDF and spreadsheet generation runs only on demand in route handlers.

## Testing strategy

- **Database tests** (`tests/db`) apply every migration to PGlite (PostgreSQL compiled to WebAssembly) with a small shim for Supabase's `auth` and `storage` schemas. They exercise RLS as each role (`set role authenticated` plus JWT claims), the anon role, constraints, triggers and business functions. They also sweep the whole schema: RLS is on everywhere, definer functions pin `search_path`, and only `verify_certificate` is callable anonymously.
- **Unit tests** cover money, dates, import parsing, certificate templating, export sanitization and PDF rendering.
- **E2E** (Playwright) smoke-tests the main flows against a test Supabase project.

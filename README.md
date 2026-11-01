# LIGHT

**Leadership Information, Governance, and Holistic Tracking**: a Church Management Information System.

LIGHT manages church membership, attendance, membership status, certificate issuance, financial records, reports, users and audit logs for a single church. It is built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui and Supabase (PostgreSQL, Auth, Storage).

- Architecture: [docs/architecture.md](docs/architecture.md)
- Security & data privacy (RA 10173): [docs/security.md](docs/security.md)
- Backup & recovery: [docs/backup-recovery.md](docs/backup-recovery.md)
- Architecture decisions: [docs/adr/](docs/adr/)

---

## 1. Requirements

- Node.js 22+ and pnpm 10+
- A Supabase project (production), and ideally a second one for testing
- A Vercel account (or any Node.js host) and a GitHub repository

## 2. Configure Supabase

1. **Create the project** at supabase.com. Choose the Southeast Asia (Singapore) region.
2. **Disable public sign-ups.** Go to *Authentication → Providers → Email* and turn off "Allow new users to sign up". LIGHT accounts are invitation-only.
3. **URL configuration.** In *Authentication → URL Configuration*:
   - Site URL: your production URL, e.g. `https://grace.yourchurch.org`
   - Redirect URLs: `https://grace.yourchurch.org/auth/confirm`, plus `http://localhost:3000/auth/confirm` for development
4. **Email templates.** In *Authentication → Email Templates*, make the links point to the confirm route:
   - Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
5. **SMTP.** For production, configure a custom SMTP server (*Project Settings → Authentication → SMTP*). Supabase's built-in mailer is rate-limited.
6. **Apply the database migrations** from this repository:
   ```bash
   pnpm install
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <your-project-ref>   # asks for the database password
   pnpm db:push                                              # applies supabase/migrations/*
   ```
   The migrations create every table, constraint, index, Row Level Security policy, function, the default roles and permissions, statuses, funds, categories, certificate templates and private storage buckets. **Do not** load `supabase/seed.sql` into production; it contains demo data.

## 3. Configure the application

Copy `.env.example` to `.env.local` and fill in the values from *Project Settings → API*:

| Variable | Where it is used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server (RLS protects data) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only: user invitations and account suspension | **Yes**, never expose |
| `NEXT_PUBLIC_SITE_URL` | Invitation links, certificate QR codes | No |

Never prefix the service role key with `NEXT_PUBLIC_`, and never commit `.env.local`.

## 4. Create the first Super Administrator

```bash
pnpm bootstrap:admin admin@yourchurch.org "Full Name"
```

This prints a one-time link (no email is sent). With the app running, open it within an hour, set a password, and sign in. Then create the other accounts under **User Management**.

Alternatively, set the password directly from your terminal (it is typed hidden and confirms the email):

```bash
pnpm set-password admin@yourchurch.org
```

## 5. Run locally

```bash
pnpm dev            # http://localhost:3000
```

Until Supabase is configured, every page redirects to `/setup` with instructions.

## 6. Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel (framework: Next.js; install command `pnpm install`).
2. Add the four environment variables above to the **Production** environment. Mark `SUPABASE_SERVICE_ROLE_KEY` as sensitive.
3. Deploy, then set the Supabase Site URL and redirect URLs to the production domain.
4. Recommended: run `pnpm db:push` against production from a trusted machine before deploying code that needs a new migration.

## 7. Testing

| Command | What it checks |
|---|---|
| `pnpm test` | Unit tests plus database tests. Every migration is applied to an in-memory PostgreSQL (PGlite), then RLS, permissions, duplicate prevention, status history, certificate numbering and immutability, financial posting and reversal, and report totals are verified. |
| `pnpm typecheck` / `pnpm lint` | Strict TypeScript and ESLint |
| `pnpm test:e2e` | Playwright smoke test against a running app connected to a **test** project (`E2E_EMAIL`, `E2E_PASSWORD`, `E2E_BASE_URL`) |
| `pnpm db:types:local` | Regenerates `src/types/database.ts` from the migrations (CI fails if it is out of date) |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the type-drift check, all tests and a production build on every push.

## 8. Operations

- **Backups:** Supabase daily backups (Pro plan and above; enable Point-in-Time Recovery if available), plus the nightly encrypted `pg_dump` workflow in `.github/workflows/backup.yml`. See [docs/backup-recovery.md](docs/backup-recovery.md) and test a restore every quarter.
- **Schema changes:** add a new timestamped file in `supabase/migrations/`. Never edit a migration that has already been applied to production. Then run `pnpm db:types:local` and `pnpm test`.
- **Audit logs** are append-only and cannot be edited or deleted by any application user.
- **Leaving staff:** deactivate the account in User Management. This blocks sign-in immediately, and their history is preserved.

## 9. Project structure

```
supabase/migrations/   Database schema, RLS, functions, reference data (source of truth)
supabase/seed.sql      Development demo data only
src/app/               Routes: (auth) sign-in pages, (app) authenticated modules, api/ exports & PDFs, verify/ public page
src/features/<module>/ Module UI components, Zod schemas and server actions
src/server/            Server-only code: Supabase clients, auth/session, queries, reports, PDF and spreadsheet generation
src/components/        Shared UI (shadcn/ui primitives and app components)
src/lib/               Pure utilities: money (exact decimals), dates (Asia/Manila), permissions, errors
tests/                 unit/, db/ (PGlite + migrations), e2e/ (Playwright)
```

## 10. Scope notes

- The finance module is a **financial records system** (cash received and disbursed per fund, allocations, reversals, reports). It is not a full double-entry accounting system and does not replace the church's official books or audit.
- Church marriage certificates produced by LIGHT are church records and do not replace PSA civil documents.

# ADR 0002: Enforce authorization and business rules in the database

**Status:** accepted · 2026-10-31

## Context
Supabase exposes the database through PostgREST using the user's JWT. Any check implemented only in the Next.js layer could be bypassed by calling the API directly with a valid session. Church records are sensitive personal information.

## Decision
- Every table has RLS enabled. Policies call `public.has_permission('<module>.<action>')`, which resolves the user's roles and permissions. Super administrators implicitly hold every permission.
- Sensitive writes are revoked from the `authenticated` role and exposed only through SECURITY DEFINER functions with `search_path = ''` that check permissions first and perform the whole operation in one transaction.
- Immutability rules (issued certificates, posted transactions, history, audit) are enforced by triggers that apply even to privileged connections.
- The application layer still validates input and checks permissions, to give clear error messages and avoid wasted round trips.

## Consequences
- The rules are tested directly at the SQL level (`tests/db`), independently of the UI.
- Schema changes need care: new tables must enable RLS and add policies (a test fails otherwise), and new SECURITY DEFINER functions must set `search_path` (also tested).

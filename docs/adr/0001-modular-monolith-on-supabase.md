# ADR 0001: Modular monolith on Next.js and Supabase

**Status:** accepted · 2026-10-31

## Context
LIGHT serves one church with a small staff. It needs strong data integrity, low operating cost and simple deployment. There is no requirement for independent scaling or separate deployment of modules.

## Decision
Build a single Next.js application organized by module (`src/features/<module>`), deployed on Vercel, with Supabase PostgreSQL as the only data store. Business rules that must hold for every caller live in PostgreSQL. No microservices, queues or extra databases.

## Consequences
- One deployment and one database to back up; transactions span modules naturally.
- Module boundaries are kept by folder structure and code review, not by network calls.
- If a future need arises (for example SMS reminders), it is added as a route handler or a scheduled job, not a separate service.

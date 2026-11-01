# ADR 0004: Cache Components with request-time private data

**Status:** accepted · 2026-10-31

## Context
Next.js 16 enables Cache Components and Partial Prefetching, and both become the default in the next major version. Almost every LIGHT page shows personal or financial data that must never be stored in a shared cache.

## Decision
- Keep `cacheComponents` and `partialPrefetching` enabled.
- Do **not** use `"use cache"` or `"use cache: remote"` for member, attendance, certificate or financial data. Pages read the session and data at request time inside `<Suspense>` boundaries, so the static shell (layout skeleton) prerenders and the content streams in.
- Per-request de-duplication uses React `cache()` (`getCurrentUser`, lookups).
- Mutations call `revalidatePath` so navigation shows fresh data.
- Private images (member photos, logo) use short-lived signed URLs rendered with `<img>`, not `next/image`, because the image optimizer cache is shared.

## Consequences
- Fast first paint from the prerendered shell, with no risk of serving one user's data to another.
- If public, non-personal content is added later (for example a church events page), it can use `"use cache"` safely.

# ADR 0003: Exact money handling and reversal-based corrections

**Status:** accepted · 2026-10-31

## Context
Financial records must be accurate to the centavo and trustworthy for church audits. JavaScript numbers are binary floating point, so 0.1 + 0.2 ≠ 0.3.

## Decision
- Amounts are stored as `numeric(14,2)`, must be positive, and are summed in SQL. Functions return money as **text**; the app keeps decimal strings and does arithmetic with `bigint` centavos (`src/lib/money.ts`). Inputs with more than two decimals are rejected, not rounded.
- Transactions start as drafts (editable, excluded from balances) and are **posted** to take effect. Numbers are assigned at posting so they are gapless.
- Posted transactions cannot be edited or deleted. A mistake is corrected by `reverse_transaction`, which records an offsetting entry on the reversal date and marks the original as reversed. Allocations between funds are separate, immutable records with their own reversal.
- The UI states that LIGHT is a financial records system, not a double-entry accounting system.

## Consequences
- Balances and reports always derive from recorded transactions; nothing is stored as a running total.
- Corrections show in the period in which they are made, which matches common church-treasury practice.

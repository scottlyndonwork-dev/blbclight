import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

describe("development seed", () => {
  it("applies cleanly, is idempotent, and only adds clearly marked demo records", async () => {
    const t = await createTestDb();
    const seed = readFileSync(path.resolve(import.meta.dirname, "../../supabase/seed.sql"), "utf8");
    await t.db.exec(seed);
    await t.db.exec(seed); // running twice must not duplicate data

    const { rows } = await t.db.query<{ members: number; demo: number; sessions: number; txns: number }>(`
      select
        (select count(*)::int from public.members) as members,
        (select count(*)::int from public.members where notes = 'DEMO DATA') as demo,
        (select count(*)::int from public.attendance_sessions) as sessions,
        (select count(*)::int from public.financial_transactions) as txns
    `);
    expect(rows[0]).toEqual({ members: 8, demo: 8, sessions: 4, txns: 3 });

    const balance = await t.db.query<{ available_balance: string }>(
      "select available_balance from public.get_fund_balances() where code = 'GENERAL'",
    ).catch(() => null);
    // get_fund_balances requires a finance permission; as superuser auth.uid() is null, so it is denied.
    expect(balance).toBeNull();
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let treasurer: string;
let pastor: string;
let secretary: string;
let general: string;
let missions: string;
let tithes: string;
let utilities: string;

async function create(data: Record<string, unknown>, post = true) {
  const { rows } = await t.db.query<{ id: string; txn_no: string | null; status: string }>(
    "select * from public.create_transaction($1, $2)",
    [data, post],
  );
  return rows[0];
}

async function balances() {
  const { rows } = await t.db.query<{
    code: string;
    cash_received: string;
    cash_disbursed: string;
    transfers_in: string;
    transfers_out: string;
    available_balance: string;
  }>("select * from public.get_fund_balances()");
  return Object.fromEntries(rows.map((r) => [r.code, r]));
}

beforeAll(async () => {
  t = await createTestDb();
  treasurer = await t.createUser("treasurer@example.com", ["treasurer"]);
  pastor = await t.createUser("pastor@example.com", ["pastor"]);
  secretary = await t.createUser("secretary@example.com", ["secretary"]);
  await t.asSuperuser();
  const ids = await t.db.query<{ k: string; id: string }>(`
    select 'general' as k, id from public.funds where code = 'GENERAL'
    union all select 'missions', id from public.funds where code = 'MISSION'
    union all select 'tithes', id from public.financial_categories where kind = 'income' and name = 'Tithes'
    union all select 'utilities', id from public.financial_categories where kind = 'expense' and name = 'Utilities'
  `);
  const map = Object.fromEntries(ids.rows.map((r) => [r.k, r.id]));
  general = map.general;
  missions = map.missions;
  tithes = map.tithes;
  utilities = map.utilities;
});

describe("funds", () => {
  it("starts with the church's two funds", async () => {
    await t.asSuperuser();
    const { rows } = await t.db.query<{ code: string; name: string; is_active: boolean }>(
      "select code, name, is_active from public.funds order by sort_order",
    );
    expect(rows).toEqual([
      { code: "GENERAL", name: "General Fund", is_active: true },
      { code: "MISSION", name: "Missions Fund", is_active: true },
    ]);
  });
});

describe("transactions", () => {
  it("records exact decimal amounts and numbers posted transactions", async () => {
    await t.asUser(treasurer);
    const income = await create({ kind: "income", fund_id: general, category_id: tithes, amount: "1000.10", txn_date: "2025-01-05", description: "Tithes" });
    await create({ kind: "income", fund_id: general, category_id: tithes, amount: "0.20", txn_date: "2025-01-05", description: "Tithes" });
    await create({ kind: "expense", fund_id: general, category_id: utilities, amount: "250.15", txn_date: "2025-01-10", description: "Electricity" });
    expect(income.txn_no).toMatch(/^INC-\d{4}-000001$/);
    const b = await balances();
    expect(b.GENERAL.cash_received).toBe("1000.30");
    expect(b.GENERAL.cash_disbursed).toBe("250.15");
    expect(b.GENERAL.available_balance).toBe("750.15");
  });

  it("rejects invalid amounts and mismatched categories", async () => {
    await t.asUser(treasurer);
    await expect(create({ kind: "income", fund_id: general, category_id: tithes, amount: "0", txn_date: "2025-01-05", description: "x" })).rejects.toThrow(
      /greater than zero/,
    );
    await expect(create({ kind: "income", fund_id: general, category_id: tithes, amount: "10.005", txn_date: "2025-01-05", description: "x" })).rejects.toThrow(
      /two decimal places/,
    );
    await expect(create({ kind: "expense", fund_id: general, category_id: tithes, amount: "10", txn_date: "2025-01-05", description: "x" })).rejects.toThrow(
      /category does not match/,
    );
    await expect(create({ kind: "income", fund_id: general, category_id: tithes, amount: "10", txn_date: "2999-01-01", description: "x" })).rejects.toThrow(
      /future/,
    );
  });

  it("keeps drafts out of balances until posted", async () => {
    await t.asUser(treasurer);
    const before = (await balances()).GENERAL.available_balance;
    const draft = await create({ kind: "income", fund_id: general, category_id: tithes, amount: "500", txn_date: "2025-01-12", description: "Draft" }, false);
    expect(draft.status).toBe("draft");
    expect(draft.txn_no).toBeNull();
    expect((await balances()).GENERAL.available_balance).toBe(before);
    await t.db.query("select public.post_transaction($1)", [draft.id]);
    expect((await balances()).GENERAL.available_balance).toBe("1250.15");
  });

  it("prevents editing or deleting posted transactions", async () => {
    await t.asUser(treasurer);
    const posted = await create({ kind: "income", fund_id: general, category_id: tithes, amount: "50", txn_date: "2025-01-12", description: "Posted" });
    await expect(t.db.query("select public.update_draft_transaction($1, $2)", [posted.id, { kind: "income", fund_id: general, category_id: tithes, amount: "5", txn_date: "2025-01-12", description: "x" }])).rejects.toThrow(
      /Only draft/,
    );
    await expect(t.db.query("select public.delete_draft_transaction($1)", [posted.id])).rejects.toThrow(/Only draft/);
    await t.asSuperuser();
    await expect(t.db.query("update public.financial_transactions set amount = 1 where id = $1", [posted.id])).rejects.toThrow(/cannot be edited/);
    await expect(t.db.query("delete from public.financial_transactions where id = $1", [posted.id])).rejects.toThrow(/cannot be deleted/);
  });

  it("reverses a transaction with an offsetting entry", async () => {
    await t.asUser(treasurer);
    const before = (await balances()).GENERAL.available_balance;
    const wrong = await create({ kind: "expense", fund_id: general, category_id: utilities, amount: "99.99", txn_date: "2025-01-15", description: "Wrong entry" });
    // Reversals are booked on their own date; use the same month here.
    await t.db.query("select * from public.reverse_transaction($1, 'Entered twice', '2025-01-16')", [wrong.id]);
    expect((await balances()).GENERAL.available_balance).toBe(before);

    const { rows } = await t.db.query<{ status: string }>("select status from public.financial_transactions where id = $1", [wrong.id]);
    expect(rows[0].status).toBe("reversed");
    await expect(t.db.query("select * from public.reverse_transaction($1, 'Again')", [wrong.id])).rejects.toThrow(/Only a posted original/);
  });

  it("does not let non-finance roles record or read transactions", async () => {
    await t.asUser(secretary);
    await expect(create({ kind: "income", fund_id: general, category_id: tithes, amount: "1", txn_date: "2025-01-05", description: "x" })).rejects.toThrow(/permission/);
    const { rows } = await t.db.query("select * from public.financial_transactions");
    expect(rows).toHaveLength(0);
    await expect(t.db.query("select * from public.get_fund_balances()")).rejects.toThrow(/permission/);
  });
});

describe("fund transfers and reports", () => {
  it("moves allocations between funds without changing cash totals", async () => {
    await t.asUser(treasurer);
    const before = await balances();
    const { rows } = await t.db.query<{ id: string }>("select * from public.create_fund_transfer($1, $2, '100.00', '2025-01-20', 'Allocate to missions')", [general, missions]);
    const after = await balances();
    expect(after.GENERAL.transfers_out).toBe("100.00");
    expect(after.MISSION.transfers_in).toBe("100.00");
    expect(after.GENERAL.cash_received).toBe(before.GENERAL.cash_received);

    await t.db.query("select * from public.reverse_fund_transfer($1, 'Not approved')", [rows[0].id]);
    const reverted = await balances();
    expect(reverted.GENERAL.available_balance).toBe(before.GENERAL.available_balance);
    expect(reverted.MISSION.available_balance).toBe(before.MISSION.available_balance);
  });

  it("produces accurate category and monthly summaries", async () => {
    await t.asUser(treasurer);
    const cat = await t.db.query<{ category_name: string; total: string }>(
      "select * from public.get_finance_category_summary('2025-01-01', '2025-01-31')",
    );
    const totals = Object.fromEntries(cat.rows.map((r) => [r.category_name, r.total]));
    expect(totals.Tithes).toBe("1550.30");
    expect(totals.Utilities).toBe("250.15");

    const monthly = await t.db.query<{ income: string; expense: string; net: string }>(
      "select * from public.get_finance_monthly_summary('2025-01-01', '2025-02-28')",
    );
    expect(monthly.rows).toHaveLength(2);
    expect(monthly.rows[0]).toMatchObject({ income: "1550.30", expense: "250.15", net: "1300.15" });
    expect(monthly.rows[1]).toMatchObject({ income: "0.00", expense: "0.00" });
  });

  it("gives leadership aggregate reports but not individual transactions", async () => {
    await t.asUser(pastor);
    const stats = await t.db.query<{ s: { income: string } }>("select public.get_finance_stats('2025-01-01', '2025-01-31') as s");
    expect(stats.rows[0].s.income).toBe("1550.30");
    const { rows } = await t.db.query("select * from public.financial_transactions");
    expect(rows).toHaveLength(0);
  });
});

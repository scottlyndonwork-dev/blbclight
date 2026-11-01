import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

describe("database security baseline", () => {
  it("enables row level security on every public table", async () => {
    await t.asSuperuser();
    const { rows } = await t.db.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("pins search_path on every SECURITY DEFINER function", async () => {
    await t.asSuperuser();
    const { rows } = await t.db.query<{ proname: string }>(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
    `);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("has a policy on every table that API users can write to directly", async () => {
    await t.asSuperuser();
    const { rows } = await t.db.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (has_table_privilege('authenticated', c.oid, 'insert')
             or has_table_privilege('authenticated', c.oid, 'update')
             or has_table_privilege('authenticated', c.oid, 'delete'))
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('a', 'w', 'd', '*'))
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("protects built-in lookup rows from modification", async () => {
    const admin = await t.createUser("settings-admin@example.com", ["super_admin"]);
    await t.asUser(admin);
    const { rows } = await t.db.query("update public.membership_statuses set name = 'Hacked' where key = 'active' returning id");
    expect(rows).toHaveLength(0);
    const roles = await t.db.query("update public.roles set name = 'Hacked' where key = 'super_admin' returning id");
    expect(roles.rows).toHaveLength(0);
  });

  it("gives the anonymous role no table access", async () => {
    await t.asAnon();
    await expect(t.db.query("select * from public.members")).rejects.toThrow(/permission denied/);
    await expect(t.db.query("select * from public.financial_transactions")).rejects.toThrow(/permission denied/);
    await expect(t.db.query("select * from public.certificates")).rejects.toThrow(/permission denied/);
    await expect(t.db.query("select * from public.audit_logs")).rejects.toThrow(/permission denied/);
  });

  it("only exposes certificate verification to the anonymous role", async () => {
    await t.asSuperuser();
    const { rows } = await t.db.query<{ proname: string }>(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      order by 1
    `);
    expect(rows.map((r) => r.proname)).toEqual(["verify_certificate"]);
  });

  it("keeps internal helper functions away from API users", async () => {
    const uid = await t.createUser("helper-check@example.com", ["super_admin"]);
    await t.asUser(uid);
    await expect(
      t.db.query("select public.next_document_number('member', 'X', 3)"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.db.query("select public._insert_member('{}'::jsonb, gen_random_uuid(), 'x')"),
    ).rejects.toThrow(/permission denied/);
  });

  it("prevents anyone from editing or deleting audit logs", async () => {
    const uid = await t.createUser("auditor@example.com", ["super_admin"]);
    await t.asUser(uid);
    await t.db.query("select public.record_sign_in('{}'::jsonb)");
    await expect(t.db.query("delete from public.audit_logs")).rejects.toThrow(/permission denied/);
    await expect(t.db.query("update public.audit_logs set action = 'x'")).rejects.toThrow(/permission denied/);

    await t.asSuperuser();
    await expect(t.db.query("delete from public.audit_logs")).rejects.toThrow(/cannot be modified/);
  });

  it("restricts audit log reading to audit.read holders", async () => {
    const treasurer = await t.createUser("treasurer-audit@example.com", ["treasurer"]);
    await t.asUser(treasurer);
    const { rows } = await t.db.query("select * from public.audit_logs");
    expect(rows).toHaveLength(0);
  });

  it("records sign-ins in the audit log with the caller as actor", async () => {
    const uid = await t.createUser("signin@example.com", ["pastor"]);
    await t.asUser(uid);
    await t.db.query("select public.record_sign_in($1)", [{ user_agent: "test" }]);
    await t.asSuperuser();
    const { rows } = await t.db.query<{ actor_id: string; action: string }>(
      "select actor_id, action from public.audit_logs where action = 'auth.login' and actor_id = $1",
      [uid],
    );
    expect(rows).toHaveLength(1);
  });

  it("rejects unsupported event names in log_event", async () => {
    const uid = await t.createUser("events@example.com", ["pastor"]);
    await t.asUser(uid);
    await expect(
      t.db.query("select public.log_event('member.delete', 'member')"),
    ).rejects.toThrow(/Unsupported audit action/);
    await t.db.query("select public.log_event('export.members', 'member', null, 'Exported 10 rows')");
  });

  it("never lets the last super administrator be removed or deactivated", async () => {
    const fresh = await createTestDb();
    const admin = await fresh.createUser("only-admin@example.com", ["super_admin"]);
    await fresh.asUser(admin);
    await expect(
      fresh.db.query(
        "delete from public.user_roles where user_id = $1 and role_id = (select id from public.roles where key = 'super_admin')",
        [admin],
      ),
    ).rejects.toThrow(/At least one active Super Administrator/);
    await expect(
      fresh.db.query("update public.profiles set is_active = false where id = $1", [admin]),
    ).rejects.toThrow(/At least one active Super Administrator/);
  });

  it("only lets users.manage holders assign roles", async () => {
    const secretary = await t.createUser("sec-roles@example.com", ["secretary"]);
    const other = await t.createUser("target@example.com");
    await t.asUser(secretary);
    await expect(
      t.db.query(
        "insert into public.user_roles (user_id, role_id) select $1, id from public.roles where key = 'super_admin'",
        [other],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("treats deactivated users as having no permissions", async () => {
    const uid = await t.createUser("deactivated@example.com", ["church_admin"]);
    await t.asSuperuser();
    await t.db.query("update public.profiles set is_active = false where id = $1", [uid]);
    await t.asUser(uid);
    const { rows } = await t.db.query<{ ok: boolean }>("select public.has_permission('members.read') as ok");
    expect(rows[0].ok).toBe(false);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let secretary: string;
let attendanceOfficer: string;
let member: string;
let template: string;
let signatory: string;

async function issue(overrides: { replaces?: string; reason?: string } = {}) {
  const { rows } = await t.db.query<{ id: string; reference_no: string; verification_token: string }>(
    "select * from public.issue_certificate($1, $2, $3, $4, $5, $6, $7, $8)",
    [
      template,
      member,
      "Juan Santos Dela Cruz",
      "2025-03-01",
      { body: "Juan Santos Dela Cruz was baptized.", fields: {} },
      [signatory],
      overrides.replaces ?? null,
      overrides.reason ?? null,
    ],
  );
  return rows[0];
}

beforeAll(async () => {
  t = await createTestDb();
  secretary = await t.createUser("records@example.com", ["secretary"]);
  attendanceOfficer = await t.createUser("att@example.com", ["attendance_officer"]);

  await t.asUser(secretary);
  const m = await t.db.query<{ id: string }>(
    "select id from public.register_member($1, (select id from public.membership_statuses where key = 'active'))",
    [{ first_name: "Juan", last_name: "Dela Cruz" }],
  );
  member = m.rows[0].id;
  const tpl = await t.db.query<{ id: string }>(
    "select t.id from public.certificate_templates t join public.certificate_types ct on ct.id = t.type_id where ct.code = 'baptismal'",
  );
  template = tpl.rows[0].id;
  const sig = await t.db.query<{ id: string }>(
    "insert into public.certificate_signatories (full_name, title) values ('Rev. Jose Ramos', 'Senior Pastor') returning id",
  );
  signatory = sig.rows[0].id;
});

describe("certificate issuance", () => {
  it("assigns unique sequential reference numbers and tokens", async () => {
    await t.asUser(secretary);
    const a = await issue();
    const b = await issue();
    expect(a.reference_no).toMatch(/^BAP-\d{4}-000001$/);
    expect(b.reference_no).toMatch(/^BAP-\d{4}-000002$/);
    expect(a.verification_token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.verification_token).not.toBe(b.verification_token);
  });

  it("snapshots template, church and signatory details", async () => {
    await t.asUser(secretary);
    const c = await issue();
    const { rows } = await t.db.query<{ data: { title: string; signatories: { full_name: string }[]; type_name: string } }>(
      "select data from public.certificates where id = $1",
      [c.id],
    );
    expect(rows[0].data.title).toBe("Certificate of Baptism");
    expect(rows[0].data.type_name).toBe("Baptismal Certificate");
    expect(rows[0].data.signatories[0].full_name).toBe("Rev. Jose Ramos");
  });

  it("only allows authorized personnel to issue", async () => {
    await t.asUser(attendanceOfficer);
    await expect(issue()).rejects.toThrow(/permission/);
  });

  it("rejects future dates and missing signatories", async () => {
    await t.asUser(secretary);
    await expect(
      t.db.query("select * from public.issue_certificate($1, $2, 'X', '2999-01-01', $3, $4)", [template, member, { body: "x" }, [signatory]]),
    ).rejects.toThrow(/future/);
    await expect(
      t.db.query("select * from public.issue_certificate($1, $2, 'X', '2025-01-01', $3, $4)", [template, member, { body: "x" }, []]),
    ).rejects.toThrow(/signatory/);
  });

  it("makes issued certificates immutable", async () => {
    await t.asUser(secretary);
    const c = await issue();
    await t.asSuperuser();
    await expect(t.db.query("update public.certificates set recipient_name = 'Someone Else' where id = $1", [c.id])).rejects.toThrow(
      /cannot be edited/,
    );
    await expect(t.db.query("delete from public.certificates where id = $1", [c.id])).rejects.toThrow(/cannot be deleted/);
  });
});

describe("voiding and replacement", () => {
  it("voids with a reason and keeps the record", async () => {
    await t.asUser(secretary);
    const c = await issue();
    await t.db.query("select public.void_certificate($1, 'Issued in error')", [c.id]);
    const { rows } = await t.db.query<{ status: string; void_reason: string }>(
      "select status, void_reason from public.certificates where id = $1",
      [c.id],
    );
    expect(rows[0]).toEqual({ status: "voided", void_reason: "Issued in error" });
    await expect(t.db.query("select public.void_certificate($1, 'again')", [c.id])).rejects.toThrow(/Only an issued/);
  });

  it("replaces a certificate and links the two records", async () => {
    await t.asUser(secretary);
    const original = await issue();
    const replacement = await issue({ replaces: original.id, reason: "Misspelled name" });
    const { rows } = await t.db.query<{ status: string; void_reason: string }>(
      "select status, void_reason from public.certificates where id = $1",
      [original.id],
    );
    expect(rows[0].status).toBe("replaced");
    expect(rows[0].void_reason).toContain(replacement.reference_no);
    await expect(issue({ replaces: original.id, reason: "Twice" })).rejects.toThrow(/Only an issued certificate can be replaced/);
  });
});

describe("public verification", () => {
  it("reveals only minimal information", async () => {
    await t.asUser(secretary);
    const c = await issue();
    await t.asAnon();
    const { rows } = await t.db.query<Record<string, unknown>>("select * from public.verify_certificate($1)", [c.verification_token]);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["certificate_type", "church_name", "issued_on", "recipient_display_name", "reference_no", "status"].sort(),
    );
    expect(rows[0].recipient_display_name).toBe("Juan C.");
  });

  it("returns nothing for unknown or malformed tokens", async () => {
    await t.asAnon();
    const unknown = await t.db.query("select * from public.verify_certificate($1)", ["0".repeat(32)]);
    expect(unknown.rows).toHaveLength(0);
    const malformed = await t.db.query("select * from public.verify_certificate($1)", ["' or 1=1 --"]);
    expect(malformed.rows).toHaveLength(0);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let secretary: string;
let attendanceOfficer: string;
let pastor: string;
let activeId: string;
let inactiveId: string;

async function statusId(key: string) {
  const { rows } = await t.db.query<{ id: string }>("select id from public.membership_statuses where key = $1", [key]);
  return rows[0].id;
}

async function register(member: Record<string, unknown>, statusKey = "active", baptism: unknown = null) {
  const { rows } = await t.db.query<{ id: string; member_no: string }>(
    "select * from public.register_member($1, $2, $3)",
    [member, await statusId(statusKey), baptism],
  );
  return rows[0];
}

beforeAll(async () => {
  t = await createTestDb();
  secretary = await t.createUser("secretary@example.com", ["secretary"]);
  attendanceOfficer = await t.createUser("attendance@example.com", ["attendance_officer"]);
  pastor = await t.createUser("pastor@example.com", ["pastor"]);
  await t.asSuperuser();
  activeId = await statusId("active");
  inactiveId = await statusId("inactive");
});

describe("member registration", () => {
  it("assigns sequential, unique member numbers", async () => {
    await t.asUser(secretary);
    const a = await register({ first_name: "Juan", last_name: "Dela Cruz", birthdate: "1990-05-01" });
    const b = await register({ first_name: "Maria", last_name: "Santos" });
    const year = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", year: "numeric" });
    expect(a.member_no).toBe(`LGT-${year}-00001`);
    expect(b.member_no).toBe(`LGT-${year}-00002`);
  });

  it("records the initial status in the history", async () => {
    await t.asUser(secretary);
    const m = await register({ first_name: "Pedro", last_name: "Reyes" }, "pending");
    const { rows } = await t.db.query<{ reason: string; previous_status_id: string | null }>(
      "select reason, previous_status_id from public.membership_status_history where member_id = $1",
      [m.id],
    );
    expect(rows).toEqual([{ reason: "Initial registration", previous_status_id: null }]);
  });

  it("stores baptism details when provided", async () => {
    await t.asUser(secretary);
    const m = await register({ first_name: "Ana", last_name: "Lopez" }, "active", {
      baptism_date: "2020-01-12",
      location: "Main Sanctuary",
    });
    const { rows } = await t.db.query("select is_baptized, baptism_date from public.member_list where id = $1", [m.id]);
    expect(rows[0]).toMatchObject({ is_baptized: true });
  });

  it("rejects invalid data with database constraints", async () => {
    await t.asUser(secretary);
    await expect(register({ first_name: "", last_name: "X" })).rejects.toThrow(/check constraint/);
    await expect(register({ first_name: "A", last_name: "B", email: "not-an-email" })).rejects.toThrow(/check constraint/);
    await expect(register({ first_name: "A", last_name: "B", birthdate: "2999-01-01" })).rejects.toThrow(/check constraint/);
  });

  it("does not allow roles without members.write to register", async () => {
    await t.asUser(attendanceOfficer);
    await expect(register({ first_name: "No", last_name: "Access" })).rejects.toThrow(/permission/);
    await t.asUser(pastor);
    await expect(register({ first_name: "No", last_name: "Access" })).rejects.toThrow(/permission/);
  });

  it("blocks direct inserts and edits of protected columns", async () => {
    await t.asUser(secretary);
    await expect(
      t.db.query("insert into public.members (member_no, first_name, last_name, current_status_id) values ('X', 'a', 'b', $1)", [activeId]),
    ).rejects.toThrow(/permission denied/);
    await expect(t.db.query("update public.members set member_no = 'HACK'")).rejects.toThrow(/permission denied/);
    await expect(t.db.query("update public.members set current_status_id = $1", [inactiveId])).rejects.toThrow(/permission denied/);
    await expect(t.db.query("delete from public.members")).rejects.toThrow(/permission denied/);
  });

  it("imports all rows or none", async () => {
    await t.asUser(secretary);
    const before = await t.db.query<{ n: number }>("select count(*)::int as n from public.members");
    await expect(
      t.db.query("select public.import_members($1, $2)", [
        [{ first_name: "Ok", last_name: "Row" }, { first_name: "", last_name: "Bad" }],
        activeId,
      ]),
    ).rejects.toThrow();
    const after = await t.db.query<{ n: number }>("select count(*)::int as n from public.members");
    expect(after.rows[0].n).toBe(before.rows[0].n);

    const { rows } = await t.db.query<{ n: number }>("select public.import_members($1, $2) as n", [
      [{ first_name: "Imported", last_name: "One" }, { first_name: "Imported", last_name: "Two" }],
      activeId,
    ]);
    expect(rows[0].n).toBe(2);
  });
});

describe("membership status history", () => {
  it("appends history and preserves the previous status", async () => {
    await t.asUser(secretary);
    const m = await register({ first_name: "Status", last_name: "Tester", date_registered: "2024-01-01" });
    await t.db.query("select public.change_member_status($1, $2, $3, $4)", [m.id, inactiveId, "2025-02-01", "Moved away"]);

    const { rows } = await t.db.query<{ status: string; previous: string | null; reason: string }>(
      `select s.key as status, p.key as previous, h.reason
       from public.membership_status_history h
       join public.membership_statuses s on s.id = h.status_id
       left join public.membership_statuses p on p.id = h.previous_status_id
       where h.member_id = $1 order by h.effective_date, h.created_at`,
      [m.id],
    );
    expect(rows).toEqual([
      { status: "active", previous: null, reason: "Initial registration" },
      { status: "inactive", previous: "active", reason: "Moved away" },
    ]);
    const current = await t.db.query<{ key: string }>(
      "select s.key from public.members m join public.membership_statuses s on s.id = m.current_status_id where m.id = $1",
      [m.id],
    );
    expect(current.rows[0].key).toBe("inactive");
  });

  it("validates reason, effective date and no-op changes", async () => {
    await t.asUser(secretary);
    const m = await register({ first_name: "Rules", last_name: "Check", date_registered: "2024-01-01" });
    await expect(
      t.db.query("select public.change_member_status($1, $2, $3, $4)", [m.id, inactiveId, "2025-01-01", ""]),
    ).rejects.toThrow(/reason/);
    await expect(
      t.db.query("select public.change_member_status($1, $2, $3, $4)", [m.id, activeId, "2025-01-01", "Same status"]),
    ).rejects.toThrow(/already has this status/);
    await expect(
      t.db.query("select public.change_member_status($1, $2, $3, $4)", [m.id, inactiveId, "2999-01-01", "Future date"]),
    ).rejects.toThrow(/future/);
    await expect(
      t.db.query("select public.change_member_status($1, $2, $3, $4)", [m.id, inactiveId, "2020-01-01", "Before registration"]),
    ).rejects.toThrow(/earlier than the previous/);
  });

  it("never allows history rows to be edited or deleted", async () => {
    await t.asSuperuser();
    await expect(t.db.query("update public.membership_status_history set reason = 'changed'")).rejects.toThrow(/cannot be modified/);
    await expect(t.db.query("delete from public.membership_status_history")).rejects.toThrow(/cannot be modified/);
  });

  it("writes an audit log entry for status changes", async () => {
    await t.asSuperuser();
    const { rows } = await t.db.query<{ n: number }>(
      "select count(*)::int as n from public.audit_logs where action = 'membership_status.insert'",
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("member access", () => {
  it("hides member records from roles without members.read", async () => {
    await t.asUser(attendanceOfficer);
    const { rows } = await t.db.query("select * from public.members");
    expect(rows).toHaveLength(0);
  });

  it("lets attendance officers look up members by name or number only", async () => {
    await t.asUser(attendanceOfficer);
    const { rows } = await t.db.query<Record<string, unknown>>("select * from public.member_lookup('dela', 10)");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["full_name", "id", "member_no", "status_name"]);
  });

  it("archives and restores without deleting", async () => {
    await t.asUser(secretary);
    const m = await register({ first_name: "Archive", last_name: "Me" });
    await t.db.query("select public.archive_member($1, $2)", [m.id, "Duplicate record"]);
    const lookup = await t.db.query("select * from public.member_lookup('archive', 10)");
    expect(lookup.rows).toHaveLength(0);
    await t.db.query("select public.restore_member($1)", [m.id]);
    const again = await t.db.query("select * from public.member_lookup('archive', 10)");
    expect(again.rows).toHaveLength(1);
  });
});

describe("duplicate detection", () => {
  it("flags similar names and matching contact details", async () => {
    await t.asUser(secretary);
    const similar = await t.db.query<{ member_no: string; reason: string }>(
      "select * from public.find_possible_member_duplicates('Juan', 'Dela Crus', '1990-05-01')",
    );
    expect(similar.rows[0]?.reason).toBe("Similar name and same birthdate");

    await register({ first_name: "Contact", last_name: "Person", email: "contact@example.com" });
    const byEmail = await t.db.query<{ reason: string }>(
      "select * from public.find_possible_member_duplicates('Totally', 'Different', null, 'CONTACT@example.com')",
    );
    expect(byEmail.rows[0]?.reason).toBe("Same email address");

    const none = await t.db.query("select * from public.find_possible_member_duplicates('Zzyzx', 'Qwerty')");
    expect(none.rows).toHaveLength(0);
  });
});

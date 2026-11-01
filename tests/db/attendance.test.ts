import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let officer: string;
let admin: string;
let memberA: string;
let memberB: string;
let memberInactive: string;
let session: string;

async function createSession(date: string, time = "09:00") {
  const { rows } = await t.db.query<{ id: string }>(
    `insert into public.attendance_sessions (service_type_id, session_date, start_time)
     select id, $1, $2 from public.service_types where code = 'sunday_morning' returning id`,
    [date, time],
  );
  return rows[0].id;
}

beforeAll(async () => {
  t = await createTestDb();
  officer = await t.createUser("officer@example.com", ["attendance_officer"]);
  admin = await t.createUser("admin@example.com", ["church_admin"]);
  const secretary = await t.createUser("sec@example.com", ["secretary"]);

  await t.asUser(secretary);
  const reg = async (first: string, status = "active") => {
    const { rows } = await t.db.query<{ id: string }>(
      `select id from public.register_member($1, (select id from public.membership_statuses where key = $2))`,
      [{ first_name: first, last_name: "Member", date_registered: "2024-01-01" }, status],
    );
    return rows[0].id;
  };
  memberA = await reg("Alpha");
  memberB = await reg("Bravo");
  memberInactive = await reg("Charlie", "inactive");

  await t.asUser(officer);
  session = await createSession("2025-06-01");
});

describe("attendance recording", () => {
  it("records attendance and prevents duplicate entries", async () => {
    await t.asUser(officer);
    const first = await t.db.query<{ created: boolean }>("select * from public.record_attendance($1, $2)", [session, memberA]);
    expect(first.rows[0].created).toBe(true);

    const second = await t.db.query<{ created: boolean; previous_status: string }>(
      "select * from public.record_attendance($1, $2)",
      [session, memberA],
    );
    expect(second.rows[0]).toMatchObject({ created: false, previous_status: "present" });

    const { rows } = await t.db.query<{ n: number }>(
      "select count(*)::int as n from public.attendance_records where session_id = $1 and member_id = $2",
      [session, memberA],
    );
    expect(rows[0].n).toBe(1);
  });

  it("enforces the unique constraint even for privileged writes", async () => {
    await t.asSuperuser();
    await expect(
      t.db.query("insert into public.attendance_records (session_id, member_id) values ($1, $2)", [session, memberA]),
    ).rejects.toThrow(/attendance_records_unique_member/);
  });

  it("prevents duplicate sessions for the same service and time", async () => {
    await t.asUser(officer);
    await expect(createSession("2025-06-01")).rejects.toThrow(/duplicate key/);
  });

  it("marks remaining active members absent", async () => {
    await t.asUser(officer);
    const { rows } = await t.db.query<{ n: number }>("select public.mark_remaining_absent($1) as n", [session]);
    expect(rows[0].n).toBe(1); // memberB only; the inactive member is excluded
    const list = await t.db.query<{ member_id: string; status: string }>(
      "select member_id, status from public.session_attendance($1)",
      [session],
    );
    expect(list.rows.find((r) => r.member_id === memberB)?.status).toBe("absent");
    expect(list.rows.find((r) => r.member_id === memberInactive)).toBeUndefined();
  });

  it("requires attendance.correct to change a closed session, and audits corrections", async () => {
    await t.asUser(officer);
    await t.db.query("select public.set_session_status($1, 'closed')", [session]);

    const viewerOnly = await t.createUser("viewer@example.com", ["pastor"]);
    await t.asUser(viewerOnly);
    await expect(t.db.query("select * from public.record_attendance($1, $2)", [session, memberB])).rejects.toThrow(/permission/);

    await t.asUser(admin);
    const { rows } = await t.db.query<{ record_id: string }>(
      "select record_id from public.session_attendance($1) where member_id = $2",
      [session, memberB],
    );
    await t.db.query("select public.correct_attendance($1, 'excused', 'Was sick, informed the pastor')", [rows[0].record_id]);

    await t.asSuperuser();
    const audit = await t.db.query<{ before_data: { status: string }; after_data: { status: string } }>(
      "select before_data, after_data from public.audit_logs where action = 'attendance.update' and entity_id = $1",
      [rows[0].record_id],
    );
    expect(audit.rows.at(-1)?.before_data.status).toBe("absent");
    expect(audit.rows.at(-1)?.after_data.status).toBe("excused");
  });

  it("does not allow direct writes to attendance records", async () => {
    await t.asUser(officer);
    await expect(
      t.db.query("insert into public.attendance_records (session_id, member_id) values ($1, $2)", [session, memberB]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("attendance statistics", () => {
  it("counts active members as of a date from status history", async () => {
    await t.asUser(officer);
    const { rows } = await t.db.query<{ n: number }>("select public.active_member_count_as_of('2025-06-01') as n");
    expect(rows[0].n).toBe(2);
    const before = await t.db.query<{ n: number }>("select public.active_member_count_as_of('2023-12-31') as n");
    expect(before.rows[0].n).toBe(0);
  });

  it("reports attendance grouped by month", async () => {
    await t.asUser(officer);
    const s2 = await createSession("2025-06-08");
    await t.db.query("select * from public.record_attendance($1, $2, 'late')", [s2, memberB]);
    const { rows } = await t.db.query<{ sessions: number; present: number; late: number; excused: number }>(
      "select * from public.get_attendance_report('2025-06-01', '2025-06-30', 'month')",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessions: 2, present: 1, late: 1, excused: 1 });
  });

  it("computes dashboard attendance percentages", async () => {
    await t.asUser(officer);
    const { rows } = await t.db.query<{ s: { session_count: number; latest: { attended: number; percentage: number } } }>(
      "select public.get_attendance_stats('2025-06-01', '2025-06-30') as s",
    );
    expect(rows[0].s.session_count).toBe(2);
    expect(rows[0].s.latest.attended).toBe(1);
    expect(Number(rows[0].s.latest.percentage)).toBe(50);
  });
});

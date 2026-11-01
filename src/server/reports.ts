import "server-only";
import { format, parseISO } from "date-fns";
import { formatDate, resolveDateRange, type DateRange } from "@/lib/dates";
import { hasAnyPermission, type Permission, type PermissionSet } from "@/lib/permissions";
import { normalizeMoney, subtractMoney, sumMoney } from "@/lib/money";
import { createClient } from "@/server/supabase/server";

/*
 * Report definitions. Each report produces a plain table (headers, rows,
 * optional totals) that is rendered on screen and exported to Excel, CSV and
 * PDF from the same data, so on-screen and exported figures always match.
 * Values are strings; money columns hold exact decimal strings.
 */

export type ReportColumn = { header: string; align?: "left" | "right"; money?: boolean };
export type ReportTable = {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: string[][];
  totals?: string[];
  chart?: { kind: "attendance" | "finance"; points: Array<Record<string, string | number>> };
};

export type ReportKey =
  | "membership-directory"
  | "membership-new"
  | "membership-baptism"
  | "membership-changes"
  | "attendance-summary"
  | "attendance-service"
  | "attendance-member"
  | "certificates-issued"
  | "certificates-by-type"
  | "finance-income"
  | "finance-expense"
  | "finance-monthly"
  | "finance-funds";

export type ReportGroup = "membership" | "attendance" | "certificates" | "finance";

export const REPORTS: Record<ReportKey, { group: ReportGroup; label: string; requires: Permission[][] ; usesRange: boolean }> = {
  "membership-directory": { group: "membership", label: "Member directory", requires: [["reports.membership"], ["members.read"]], usesRange: false },
  "membership-new": { group: "membership", label: "New registrations", requires: [["reports.membership"], ["members.read"]], usesRange: true },
  "membership-baptism": { group: "membership", label: "Baptized and not baptized", requires: [["reports.membership"], ["members.read"]], usesRange: false },
  "membership-changes": { group: "membership", label: "Membership changes", requires: [["reports.membership"], ["members.read"]], usesRange: true },
  "attendance-summary": { group: "attendance", label: "Attendance by period", requires: [["reports.attendance"]], usesRange: true },
  "attendance-service": { group: "attendance", label: "Attendance per service", requires: [["reports.attendance"]], usesRange: true },
  "attendance-member": { group: "attendance", label: "Individual attendance", requires: [["reports.attendance"], ["attendance.read"]], usesRange: true },
  "certificates-issued": { group: "certificates", label: "Certificates issued", requires: [["reports.certificates"], ["certificates.read", "certificates.issue"]], usesRange: true },
  "certificates-by-type": { group: "certificates", label: "Certificates by type", requires: [["reports.certificates"]], usesRange: true },
  "finance-income": { group: "finance", label: "Income summary", requires: [["reports.finance"]], usesRange: true },
  "finance-expense": { group: "finance", label: "Expense summary", requires: [["reports.finance"]], usesRange: true },
  "finance-monthly": { group: "finance", label: "Income vs expenses (monthly)", requires: [["reports.finance"]], usesRange: true },
  "finance-funds": { group: "finance", label: "Fund balances", requires: [["reports.finance"]], usesRange: true },
};

export function isReportKey(v: string): v is ReportKey {
  return v in REPORTS;
}

/** Every requirement group must be satisfied by at least one permission. */
export function canViewReport(key: ReportKey, permissions: PermissionSet): boolean {
  return REPORTS[key].requires.every((group) => hasAnyPermission(permissions, group));
}

export type ReportParams = {
  range: DateRange;
  status?: string;
  baptized?: "yes" | "no";
  group?: "day" | "week" | "month" | "year";
  serviceTypeId?: string;
  memberId?: string;
  typeId?: string;
  fundId?: string;
};

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const UUID = /^[0-9a-f-]{36}$/i;

export function parseReportParams(params: Record<string, Param>, key: ReportKey): ReportParams {
  const group = first(params.group);
  const baptized = first(params.baptized);
  const uuid = (v: Param) => {
    const s = first(v);
    return s && UUID.test(s) ? s : undefined;
  };
  return {
    range: resolveDateRange(params, key.startsWith("finance") || key.startsWith("certificates") ? "this_year" : "last_90_days"),
    status: first(params.status)?.replace(/[^a-z_]/g, ""),
    baptized: baptized === "yes" || baptized === "no" ? baptized : undefined,
    group: group === "day" || group === "week" || group === "month" || group === "year" ? group : "week",
    serviceTypeId: uuid(params.service),
    memberId: uuid(params.member),
    typeId: uuid(params.type),
    fundId: uuid(params.fund),
  };
}

const periodText = (r: DateRange) => `${formatDate(r.from)} – ${formatDate(r.to)}`;
const count = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-PH");

export async function buildReport(key: ReportKey, p: ReportParams): Promise<ReportTable> {
  const supabase = await createClient();
  const { range } = p;

  switch (key) {
    case "membership-directory":
    case "membership-baptism": {
      let q = supabase
        .from("member_list")
        .select("member_no, last_name, first_name, middle_name, status_name, category_name, is_baptized, baptism_date, contact_number, date_registered")
        .is("archived_at", null)
        .order("last_name")
        .order("first_name")
        .limit(10_000);
      if (p.status) q = q.eq("status_key", p.status);
      if (key === "membership-baptism" && p.baptized) q = q.eq("is_baptized", p.baptized === "yes");
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []).map((m) => [
        m.member_no ?? "",
        `${m.last_name}, ${m.first_name}${m.middle_name ? ` ${m.middle_name[0]}.` : ""}`,
        m.status_name ?? "",
        m.category_name ?? "",
        m.is_baptized ? (m.baptism_date ? formatDate(m.baptism_date) : "Yes") : "No",
        m.contact_number ?? "",
        formatDate(m.date_registered),
      ]);
      const baptizedCount = (data ?? []).filter((m) => m.is_baptized).length;
      return {
        title: key === "membership-directory" ? "Member Directory" : "Baptism Status Report",
        subtitle:
          key === "membership-directory"
            ? `${count(rows.length)} current members`
            : `${count(baptizedCount)} baptized · ${count(rows.length - baptizedCount)} not baptized`,
        columns: [{ header: "Member ID" }, { header: "Name" }, { header: "Status" }, { header: "Category" }, { header: "Baptized" }, { header: "Contact" }, { header: "Registered" }],
        rows,
      };
    }

    case "membership-new": {
      const { data, error } = await supabase
        .from("member_list")
        .select("member_no, full_name, date_registered, status_name, category_name, city")
        .gte("date_registered", range.from)
        .lte("date_registered", range.to)
        .order("date_registered", { ascending: false })
        .limit(10_000);
      if (error) throw error;
      return {
        title: "New Member Registrations",
        subtitle: `${periodText(range)} · ${count(data?.length)} registrations`,
        columns: [{ header: "Registered" }, { header: "Member ID" }, { header: "Name" }, { header: "Status" }, { header: "Category" }, { header: "City" }],
        rows: (data ?? []).map((m) => [formatDate(m.date_registered), m.member_no ?? "", m.full_name ?? "", m.status_name ?? "", m.category_name ?? "", m.city ?? ""]),
      };
    }

    case "membership-changes": {
      const { data, error } = await supabase
        .from("membership_status_history")
        .select(
          "effective_date, reason, members(member_no, first_name, last_name), status:membership_statuses!membership_status_history_status_id_fkey(name), previous:membership_statuses!membership_status_history_previous_status_id_fkey(name)",
        )
        .gte("effective_date", range.from)
        .lte("effective_date", range.to)
        .order("effective_date", { ascending: false })
        .limit(10_000);
      if (error) throw error;
      return {
        title: "Membership Changes",
        subtitle: `${periodText(range)} · ${count(data?.length)} changes`,
        columns: [{ header: "Effective" }, { header: "Member ID" }, { header: "Name" }, { header: "From" }, { header: "To" }, { header: "Reason" }],
        rows: (data ?? []).map((h) => [
          formatDate(h.effective_date),
          h.members?.member_no ?? "",
          `${h.members?.last_name ?? ""}, ${h.members?.first_name ?? ""}`,
          h.previous?.name ?? "New registration",
          h.status?.name ?? "",
          h.reason,
        ]),
      };
    }

    case "attendance-summary": {
      const { data, error } = await supabase.rpc("get_attendance_report", {
        p_from: range.from,
        p_to: range.to,
        p_group: p.group ?? "week",
        p_service_type_id: p.serviceTypeId,
      });
      if (error) throw error;
      const rows = data ?? [];
      const label = (d: string) =>
        p.group === "year" ? d.slice(0, 4) : p.group === "month" ? format(parseISO(d), "MMMM yyyy") : p.group === "week" ? `Week of ${formatDate(d)}` : formatDate(d, "EEE, MMM d, yyyy");
      const sum = (k: "sessions" | "present" | "late" | "excused" | "absent" | "visitors") => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
      return {
        title: "Attendance Report",
        subtitle: `${periodText(range)} · grouped by ${p.group}`,
        columns: [
          { header: "Period" },
          { header: "Sessions", align: "right" },
          { header: "Present", align: "right" },
          { header: "Late", align: "right" },
          { header: "Excused", align: "right" },
          { header: "Absent", align: "right" },
          { header: "Visitors", align: "right" },
          { header: "Avg. attendance", align: "right" },
        ],
        rows: rows.map((r) => [label(r.period), count(r.sessions), count(r.present), count(r.late), count(r.excused), count(r.absent), count(r.visitors), String(r.average_attendance ?? 0)]),
        totals: ["Total", count(sum("sessions")), count(sum("present")), count(sum("late")), count(sum("excused")), count(sum("absent")), count(sum("visitors")), ""],
        chart: { kind: "attendance", points: rows.map((r) => ({ label: label(r.period), attended: (r.present ?? 0) + (r.late ?? 0), sessions: r.sessions ?? 0 })) },
      };
    }

    case "attendance-service": {
      const { data, error } = await supabase
        .from("attendance_session_summary")
        .select("service_type_name, present_count, late_count, excused_count, absent_count, visitor_count")
        .gte("session_date", range.from)
        .lte("session_date", range.to)
        .limit(10_000);
      if (error) throw error;
      const byService = new Map<string, { sessions: number; attended: number; excused: number; absent: number; visitors: number }>();
      for (const s of data ?? []) {
        const k = s.service_type_name ?? "Other";
        const cur = byService.get(k) ?? { sessions: 0, attended: 0, excused: 0, absent: 0, visitors: 0 };
        cur.sessions++;
        cur.attended += (s.present_count ?? 0) + (s.late_count ?? 0);
        cur.excused += s.excused_count ?? 0;
        cur.absent += s.absent_count ?? 0;
        cur.visitors += s.visitor_count ?? 0;
        byService.set(k, cur);
      }
      return {
        title: "Attendance per Service",
        subtitle: periodText(range),
        columns: [
          { header: "Service" },
          { header: "Sessions", align: "right" },
          { header: "Total attended", align: "right" },
          { header: "Average per session", align: "right" },
          { header: "Excused", align: "right" },
          { header: "Absent", align: "right" },
          { header: "Visitors", align: "right" },
        ],
        rows: [...byService.entries()].map(([name, v]) => [
          name,
          count(v.sessions),
          count(v.attended),
          (Math.round((v.attended / Math.max(v.sessions, 1)) * 10) / 10).toString(),
          count(v.excused),
          count(v.absent),
          count(v.visitors),
        ]),
      };
    }

    case "attendance-member": {
      if (!p.memberId) return { title: "Individual Attendance", subtitle: "Select a member to view their attendance history.", columns: [{ header: "Date" }], rows: [] };
      const [member, records] = await Promise.all([
        supabase.from("members").select("member_no, first_name, last_name").eq("id", p.memberId).maybeSingle(),
        supabase
          .from("attendance_records")
          .select("status, checked_in_at, attendance_sessions!inner(session_date, start_time, title, service_types(name))")
          .eq("member_id", p.memberId)
          .gte("attendance_sessions.session_date", range.from)
          .lte("attendance_sessions.session_date", range.to)
          .limit(5_000),
      ]);
      if (records.error) throw records.error;
      const rows = [...(records.data ?? [])].sort((a, b) => b.attendance_sessions.session_date.localeCompare(a.attendance_sessions.session_date));
      const tally = { present: 0, late: 0, excused: 0, absent: 0 };
      for (const r of rows) tally[r.status]++;
      const name = member.data ? `${member.data.first_name} ${member.data.last_name} (${member.data.member_no})` : "Member";
      return {
        title: `Attendance of ${name}`,
        subtitle: `${periodText(range)} · present ${tally.present}, late ${tally.late}, excused ${tally.excused}, absent ${tally.absent}`,
        columns: [{ header: "Date" }, { header: "Service" }, { header: "Status" }],
        rows: rows.map((r) => [
          formatDate(r.attendance_sessions.session_date),
          r.attendance_sessions.title || r.attendance_sessions.service_types?.name || "",
          r.status[0].toUpperCase() + r.status.slice(1),
        ]),
      };
    }

    case "certificates-issued": {
      let q = supabase
        .from("certificates")
        .select("reference_no, recipient_name, issued_on, status, certificate_types(name), issued_by_profile:profiles!certificates_issued_by_fkey(full_name)")
        .gte("issued_on", range.from)
        .lte("issued_on", range.to)
        .order("issued_on", { ascending: false })
        .limit(10_000);
      if (p.typeId) q = q.eq("type_id", p.typeId);
      const { data, error } = await q;
      if (error) throw error;
      return {
        title: "Certificates Issued",
        subtitle: `${periodText(range)} · ${count(data?.length)} certificates`,
        columns: [{ header: "Issued" }, { header: "Reference" }, { header: "Type" }, { header: "Recipient" }, { header: "Status" }, { header: "Issued by" }],
        rows: (data ?? []).map((c) => [
          formatDate(c.issued_on),
          c.reference_no,
          c.certificate_types?.name ?? "",
          c.recipient_name,
          c.status[0].toUpperCase() + c.status.slice(1),
          c.issued_by_profile?.full_name ?? "",
        ]),
      };
    }

    case "certificates-by-type": {
      const { data, error } = await supabase.rpc("get_certificate_stats", { p_from: range.from, p_to: range.to });
      if (error) throw error;
      const stats = data as { by_type?: Array<{ name: string; count: number }>; issued_in_period?: number; voided_in_period?: number } | null;
      const rows = (stats?.by_type ?? []).map((t) => [t.name, count(t.count)]);
      return {
        title: "Certificates by Type",
        subtitle: `${periodText(range)} · ${count(stats?.issued_in_period)} issued, ${count(stats?.voided_in_period)} voided`,
        columns: [{ header: "Certificate type" }, { header: "Valid certificates issued", align: "right" }],
        rows,
        totals: ["Total", count((stats?.by_type ?? []).reduce((a, t) => a + t.count, 0))],
      };
    }

    case "finance-income":
    case "finance-expense": {
      const kind = key === "finance-income" ? "income" : "expense";
      const { data, error } = await supabase.rpc("get_finance_category_summary", { p_from: range.from, p_to: range.to, p_fund_id: p.fundId });
      if (error) throw error;
      const rows = (data ?? []).filter((c) => c.kind === kind);
      return {
        title: kind === "income" ? "Income Summary" : "Expense Summary",
        subtitle: `${periodText(range)} · posted transactions, reversals netted`,
        columns: [{ header: "Category" }, { header: "Entries", align: "right" }, { header: "Total (PHP)", align: "right", money: true }],
        rows: rows.map((c) => [c.category_name, count(c.entry_count), normalizeMoney(c.total)]),
        totals: ["Total", count(rows.reduce((a, c) => a + c.entry_count, 0)), sumMoney(rows.map((c) => c.total))],
      };
    }

    case "finance-monthly": {
      const { data, error } = await supabase.rpc("get_finance_monthly_summary", { p_from: range.from, p_to: range.to, p_fund_id: p.fundId });
      if (error) throw error;
      const rows = data ?? [];
      const income = sumMoney(rows.map((r) => r.income));
      const expense = sumMoney(rows.map((r) => r.expense));
      return {
        title: "Income vs Expenses",
        subtitle: `${periodText(range)} · monthly totals of posted transactions`,
        columns: [{ header: "Month" }, { header: "Income (PHP)", align: "right", money: true }, { header: "Expenses (PHP)", align: "right", money: true }, { header: "Net (PHP)", align: "right", money: true }],
        rows: rows.map((r) => [format(parseISO(r.month), "MMMM yyyy"), normalizeMoney(r.income), normalizeMoney(r.expense), normalizeMoney(r.net)]),
        totals: ["Total", income, expense, subtractMoney(income, expense)],
        chart: { kind: "finance", points: rows.map((r) => ({ label: format(parseISO(r.month), "MMM yyyy"), income: r.income, expense: r.expense })) },
      };
    }

    case "finance-funds": {
      const { data, error } = await supabase.rpc("get_fund_balances", { p_as_of: range.to });
      if (error) throw error;
      const rows = data ?? [];
      const col = (k: "opening_balance" | "cash_received" | "cash_disbursed" | "transfers_in" | "transfers_out" | "available_balance") => sumMoney(rows.map((r) => r[k]));
      return {
        title: "Fund Balances",
        subtitle: `As of ${formatDate(range.to)} · all posted transactions to date`,
        columns: [
          { header: "Fund" },
          { header: "Opening", align: "right", money: true },
          { header: "Cash received", align: "right", money: true },
          { header: "Cash disbursed", align: "right", money: true },
          { header: "Allocations in", align: "right", money: true },
          { header: "Allocations out", align: "right", money: true },
          { header: "Available balance", align: "right", money: true },
        ],
        rows: rows.map((r) => [r.name, r.opening_balance, r.cash_received, r.cash_disbursed, r.transfers_in, r.transfers_out, r.available_balance]),
        totals: ["All funds", col("opening_balance"), col("cash_received"), col("cash_disbursed"), col("transfers_in"), col("transfers_out"), col("available_balance")],
      };
    }
  }
}

import "server-only";
import { z } from "zod";
import { previousRange, type DateRange } from "@/lib/dates";
import { hasAnyPermission, type PermissionSet } from "@/lib/permissions";
import { createClient } from "@/server/supabase/server";

const membershipStatsSchema = z.object({
  total: z.number(),
  active: z.number(),
  inactive: z.number(),
  pending: z.number(),
  transferred: z.number(),
  new_members: z.number(),
  baptized: z.number(),
  by_status: z.array(z.object({ key: z.string(), name: z.string(), color: z.string(), count: z.number() })),
});

const attendanceStatsSchema = z.object({
  session_count: z.number(),
  average_attendance: z.coerce.number(),
  average_percentage: z.coerce.number(),
  latest: z
    .object({
      session_id: z.string(),
      session_date: z.string(),
      service_name: z.string(),
      attended: z.number(),
      active_members: z.number(),
      percentage: z.coerce.number().nullable(),
    })
    .nullable(),
  weekly: z.array(z.object({ week: z.string(), attended: z.number(), sessions: z.number() })),
});

const certificateStatsSchema = z.object({
  total_all_time: z.number(),
  issued_in_period: z.number(),
  voided_in_period: z.number(),
  by_type: z.array(z.object({ code: z.string(), name: z.string(), count: z.number() })),
});

const financeStatsSchema = z.object({
  income: z.string(),
  expense: z.string(),
  net: z.string(),
  tithes: z.string(),
  offerings: z.string(),
});

export type MembershipStats = z.infer<typeof membershipStatsSchema>;
export type AttendanceStats = z.infer<typeof attendanceStatsSchema>;
export type CertificateStats = z.infer<typeof certificateStatsSchema>;
export type FinanceStats = z.infer<typeof financeStatsSchema>;

function parseOrNull<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Loads every dashboard section in one parallel batch. Sections the user
 * may not see are skipped (and the database would return null anyway).
 */
export async function getDashboardData(range: DateRange, permissions: PermissionSet) {
  const supabase = await createClient();
  const canMembers = hasAnyPermission(permissions, ["members.read", "reports.membership"]);
  const canMemberList = permissions.has("members.read");
  const canAttendance = hasAnyPermission(permissions, ["attendance.read", "reports.attendance"]);
  const canSessions = hasAnyPermission(permissions, ["attendance.read", "attendance.write"]);
  const canCertificates = hasAnyPermission(permissions, ["certificates.read", "reports.certificates"]);
  const canCertificateList = hasAnyPermission(permissions, ["certificates.read", "certificates.issue"]);
  const canFinanceReports = hasAnyPermission(permissions, ["finance.read", "reports.finance"]);
  const canTransactions = permissions.has("finance.read");
  const args = { p_from: range.from, p_to: range.to };
  const previous = previousRange(range);

  const skip = Promise.resolve({ data: null, error: null });

  const [membership, previousMembership, attendance, certificates, finance, funds, monthly, recentMembers, recentSessions, recentCertificates, recentTransactions] =
    await Promise.all([
      canMembers ? supabase.rpc("get_membership_stats", args) : skip,
      canMembers ? supabase.rpc("get_membership_stats", { p_from: previous.from, p_to: previous.to }) : skip,
      canAttendance ? supabase.rpc("get_attendance_stats", args) : skip,
      canCertificates ? supabase.rpc("get_certificate_stats", args) : skip,
      canFinanceReports ? supabase.rpc("get_finance_stats", args) : skip,
      canFinanceReports ? supabase.rpc("get_fund_balances", { p_as_of: range.to }) : skip,
      canFinanceReports ? supabase.rpc("get_finance_monthly_summary", args) : skip,
      canMemberList
        ? supabase
            .from("member_list")
            .select("id, member_no, full_name, status_name, status_color, date_registered")
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(5)
        : skip,
      canSessions
        ? supabase
            .from("attendance_session_summary")
            .select("id, session_date, start_time, service_type_name, title, present_count, late_count, visitor_count")
            .order("session_date", { ascending: false })
            .order("start_time", { ascending: false })
            .limit(5)
        : skip,
      canCertificateList
        ? supabase
            .from("certificates")
            .select("id, reference_no, recipient_name, issued_on, status, certificate_types(name)")
            .order("created_at", { ascending: false })
            .limit(5)
        : skip,
      canTransactions
        ? supabase
            .from("financial_transactions")
            .select("id, txn_no, kind, amount::text, txn_date, description, status, reverses_transaction_id")
            .neq("status", "draft")
            .order("posted_at", { ascending: false })
            .limit(5)
        : skip,
    ]);

  const failed = [membership, attendance, certificates, finance, funds, monthly, recentMembers, recentSessions, recentCertificates, recentTransactions].some(
    (r) => r.error,
  );

  return {
    failed,
    membership: parseOrNull(membershipStatsSchema, membership.data),
    /** New registrations in the period of equal length just before `range`. */
    previousNewMembers: parseOrNull(membershipStatsSchema, previousMembership.data)?.new_members ?? null,
    attendance: parseOrNull(attendanceStatsSchema, attendance.data),
    certificates: parseOrNull(certificateStatsSchema, certificates.data),
    finance: parseOrNull(financeStatsSchema, finance.data),
    funds: funds.data ?? null,
    monthly: monthly.data ?? null,
    recentMembers: recentMembers.data ?? null,
    recentSessions: recentSessions.data ?? null,
    recentCertificates: recentCertificates.data ?? null,
    recentTransactions: recentTransactions.data ?? null,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

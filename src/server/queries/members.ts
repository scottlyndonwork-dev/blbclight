import "server-only";
import { cache } from "react";
import { parseDateOnly } from "@/lib/dates";
import type { PermissionSet } from "@/lib/permissions";
import { createClient } from "@/server/supabase/server";

export const MEMBERS_PAGE_SIZE = 25;

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const UUID = /^[0-9a-f-]{36}$/i;

export type MemberFilters = {
  q?: string;
  status?: string;
  category?: string;
  ministry?: string;
  baptized?: "yes" | "no";
  from?: string;
  to?: string;
  archived?: boolean;
  sort: MemberSort;
  page: number;
};

export const MEMBER_SORTS = {
  name: { column: "last_name", ascending: true, label: "Name (A–Z)" },
  member_no: { column: "member_no", ascending: true, label: "Member ID" },
  newest: { column: "date_registered", ascending: false, label: "Newest registrations" },
  oldest: { column: "date_registered", ascending: true, label: "Oldest registrations" },
} as const;

export type MemberSort = keyof typeof MEMBER_SORTS;

/** Parses and sanitizes member directory filters from URL search params. */
export function parseMemberFilters(params: Record<string, Param>): MemberFilters {
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  const baptized = first(params.baptized);
  const category = first(params.category);
  const ministry = first(params.ministry);
  const from = first(params.from);
  const to = first(params.to);
  return {
    q: first(params.q)?.slice(0, 100),
    status: first(params.status)?.replace(/[^a-z_]/g, "") || undefined,
    category: category && UUID.test(category) ? category : undefined,
    ministry: ministry && UUID.test(ministry) ? ministry : undefined,
    baptized: baptized === "yes" || baptized === "no" ? baptized : undefined,
    from: parseDateOnly(from) ? from : undefined,
    to: parseDateOnly(to) ? to : undefined,
    archived: first(params.view) === "archived",
    sort: (first(params.sort) ?? "name") in MEMBER_SORTS ? (first(params.sort) as MemberSort) ?? "name" : "name",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

const LIST_COLUMNS =
  "id, member_no, full_name, first_name, last_name, gender, birthdate, contact_number, email, city, date_registered, membership_date, category_name, status_key, status_name, status_color, is_baptized, archived_at";

function applyFilters<T extends { ilike: (c: string, v: string) => T; eq: (c: string, v: string | boolean) => T; is: (c: string, v: null) => T; not: (c: string, op: string, v: null) => T; gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; contains: (c: string, v: string[]) => T }>(
  query: T,
  f: Omit<MemberFilters, "page" | "sort">,
): T {
  let q = query;
  if (f.q) {
    const term = f.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`);
    q = q.ilike("search_text", `%${term}%`);
  }
  if (f.status) q = q.eq("status_key", f.status);
  if (f.category) q = q.eq("category_id", f.category);
  if (f.ministry) q = q.contains("ministry_ids", [f.ministry]);
  if (f.baptized) q = q.eq("is_baptized", f.baptized === "yes");
  if (f.from) q = q.gte("date_registered", f.from);
  if (f.to) q = q.lte("date_registered", f.to);
  q = f.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  return q;
}

export async function listMembers(filters: MemberFilters) {
  const supabase = await createClient();
  const offset = (filters.page - 1) * MEMBERS_PAGE_SIZE;
  const sort = MEMBER_SORTS[filters.sort];
  const query = applyFilters(supabase.from("member_list").select(LIST_COLUMNS, { count: "exact" }), filters)
    .order(sort.column, { ascending: sort.ascending })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(offset, offset + MEMBERS_PAGE_SIZE - 1);
  const { data, count, error } = await query;
  return { rows: data ?? [], total: count ?? 0, error };
}

/** All members matching the filters (for exports), capped for safety. */
export async function listMembersForExport(filters: Omit<MemberFilters, "page" | "sort">, limit = 10_000) {
  const supabase = await createClient();
  const { data, error } = await applyFilters(
    supabase
      .from("member_list")
      .select(
        "member_no, last_name, first_name, middle_name, suffix, gender, birthdate, contact_number, email, city, date_registered, membership_date, category_name, status_name, is_baptized, baptism_date",
      ),
    filters,
  )
    .order("last_name")
    .order("first_name")
    .limit(limit);
  return { rows: data ?? [], error };
}

export const getMemberLookups = cache(async () => {
  const supabase = await createClient();
  const [statuses, categories, ministries] = await Promise.all([
    supabase.from("membership_statuses").select("id, key, name, color, counts_as_active, is_active").order("sort_order"),
    supabase.from("membership_categories").select("id, name, is_active").order("sort_order"),
    supabase.from("ministries").select("id, name, is_active").order("name"),
  ]);
  return {
    statuses: statuses.data ?? [],
    categories: categories.data ?? [],
    ministries: ministries.data ?? [],
  };
});

export async function getMember(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select(
      "*, membership_categories(name), membership_statuses(id, key, name, color), baptism_records(*), created_by_profile:profiles!members_created_by_fkey(full_name), updated_by_profile:profiles!members_updated_by_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

export type MemberDetail = NonNullable<Awaited<ReturnType<typeof getMember>>>;

/** Everything the member profile tabs need, loaded in parallel and filtered by permission. */
export async function getMemberProfileData(memberId: string, permissions: PermissionSet) {
  const supabase = await createClient();
  const canAttendance = permissions.has("attendance.read") || permissions.has("attendance.write");
  const canCertificates = permissions.has("certificates.read") || permissions.has("certificates.issue");
  const skip = Promise.resolve({ data: null, error: null });

  const [history, ministries, household, attendance, certificates] = await Promise.all([
    supabase
      .from("membership_status_history")
      .select(
        "id, effective_date, reason, created_at, status:membership_statuses!membership_status_history_status_id_fkey(name, color), previous:membership_statuses!membership_status_history_previous_status_id_fkey(name), changed_by_profile:profiles(full_name)",
      )
      .eq("member_id", memberId)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("member_ministries")
      .select("id, role, start_date, end_date, ministries(id, name)")
      .eq("member_id", memberId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("household_members")
      .select("id, relationship, households(id, name, address, household_members(id, relationship, members(id, member_no, first_name, last_name, suffix)))")
      .eq("member_id", memberId)
      .maybeSingle(),
    canAttendance
      ? supabase
          .from("attendance_records")
          .select("id, status, checked_in_at, method, attendance_sessions(id, session_date, start_time, title, service_types(name))")
          .eq("member_id", memberId)
          .order("checked_in_at", { ascending: false })
          .limit(100)
      : skip,
    canCertificates
      ? supabase
          .from("certificates")
          .select("id, reference_no, issued_on, status, certificate_types(name)")
          .eq("member_id", memberId)
          .order("issued_on", { ascending: false })
      : skip,
  ]);

  return {
    history: history.data ?? [],
    ministries: ministries.data ?? [],
    household: household.data ?? null,
    attendance: attendance.data,
    certificates: certificates.data,
  };
}

export async function listHouseholds(search?: string) {
  const supabase = await createClient();
  let q = supabase.from("households").select("id, name, address").order("name").limit(20);
  if (search) q = q.ilike("name", `%${search.replace(/[%_\\]/g, "")}%`);
  const { data } = await q;
  return data ?? [];
}

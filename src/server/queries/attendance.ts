import "server-only";
import { cache } from "react";
import type { DateRange } from "@/lib/dates";
import { createClient } from "@/server/supabase/server";

export const SESSIONS_PAGE_SIZE = 20;

export const getServiceTypes = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("service_types").select("id, code, name, default_start_time, is_active, sort_order").order("sort_order");
  return data ?? [];
});

export async function listSessions(options: { range: DateRange; serviceTypeId?: string; page: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("attendance_session_summary")
    .select("id, session_date, start_time, title, status, service_type_id, service_type_name, present_count, late_count, excused_count, absent_count, visitor_count", {
      count: "exact",
    })
    .gte("session_date", options.range.from)
    .lte("session_date", options.range.to)
    .order("session_date", { ascending: false })
    .order("start_time", { ascending: false })
    .range((options.page - 1) * SESSIONS_PAGE_SIZE, options.page * SESSIONS_PAGE_SIZE - 1);
  if (options.serviceTypeId) q = q.eq("service_type_id", options.serviceTypeId);
  const { data, count, error } = await q;
  return { rows: data ?? [], total: count ?? 0, error };
}

export async function getSessionDetail(sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const supabase = await createClient();
  const [session, records, visitors] = await Promise.all([
    supabase
      .from("attendance_sessions")
      .select("id, service_type_id, session_date, start_time, title, notes, status, closed_at, created_at, service_types(name), created_by_profile:profiles!attendance_sessions_created_by_fkey(full_name), closed_by_profile:profiles!attendance_sessions_closed_by_fkey(full_name)")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.rpc("session_attendance", { p_session_id: sessionId }),
    supabase
      .from("visitors")
      .select("id, full_name, contact_number, address, is_first_time, notes, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
  ]);
  if (!session.data) return null;
  const activeAsOf = await supabase.rpc("active_member_count_as_of", { p_date: session.data.session_date });
  return {
    session: session.data,
    records: records.data ?? [],
    visitors: visitors.data ?? [],
    activeMembers: activeAsOf.data ?? 0,
    error: session.error ?? records.error ?? visitors.error,
  };
}

export type SessionDetail = NonNullable<Awaited<ReturnType<typeof getSessionDetail>>>;

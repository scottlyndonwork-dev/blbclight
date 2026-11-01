"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { todayManila } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import type { Enums } from "@/types/database";
import { authorizeAction } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export type AttendanceStatus = Enums<"attendance_status">;
const statusSchema = z.enum(["present", "late", "excused", "absent"]);
const idSchema = z.uuid();

function revalidateSession(sessionId?: string) {
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  if (sessionId) revalidatePath(`/attendance/${sessionId}`);
}

const sessionSchema = z.object({
  service_type_id: z.uuid("Select the service or activity."),
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Select the date.")
    .refine((v) => v <= todayManila(), "Attendance cannot be recorded for a future date."),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter the start time."),
  title: z.string().trim().max(150),
  notes: z.string().trim().max(2000),
});

export type SessionInput = z.input<typeof sessionSchema>;

export async function createSessionAction(input: SessionInput): Promise<ActionResult<{ id: string }>> {
  const { denied } = await authorizeAction(["attendance.write"]);
  if (denied) return denied;
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .insert({ ...parsed.data, title: parsed.data.title || null, notes: parsed.data.notes || null })
    .select("id")
    .single();
  if (error || !data) return fail(friendlyDbError(error, "The session could not be created."));
  revalidateSession();
  return ok({ id: data.id }, "Attendance session created.");
}

export async function updateSessionAction(sessionId: string, input: SessionInput): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["attendance.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(sessionId).success) return fail("Invalid session.");
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .update({ ...parsed.data, title: parsed.data.title || null, notes: parsed.data.notes || null })
    .eq("id", sessionId)
    .select("id");
  if (error) return fail(friendlyDbError(error, "The session could not be updated."));
  if (!data?.length) return fail("Closed sessions cannot be edited. Reopen the session first.");
  revalidateSession(sessionId);
  return ok(null, "Session updated.");
}

export async function deleteSessionAction(sessionId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["attendance.correct"]);
  if (denied) return denied;
  if (!idSchema.safeParse(sessionId).success) return fail("Invalid session.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("attendance_sessions").delete().eq("id", sessionId).select("id");
  if (error) return fail(friendlyDbError(error, "The session could not be deleted."));
  if (!data?.length) return fail("Only sessions without attendance records can be deleted.");
  revalidateSession();
  return ok(null, "Session deleted.");
}

export type RecordedAttendance = {
  recordId: string;
  created: boolean;
  previousStatus: AttendanceStatus | null;
  status: AttendanceStatus;
};

export async function recordAttendanceAction(
  sessionId: string,
  memberId: string,
  status: AttendanceStatus = "present",
  method: "manual" | "qr" = "manual",
): Promise<ActionResult<RecordedAttendance>> {
  const { denied } = await authorizeAction(["attendance.write", "attendance.correct"]);
  if (denied) return denied;
  if (!idSchema.safeParse(sessionId).success || !idSchema.safeParse(memberId).success) return fail("Invalid member or session.");
  if (!statusSchema.safeParse(status).success) return fail("Invalid attendance status.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_attendance", {
    p_session_id: sessionId,
    p_member_id: memberId,
    p_status: status,
    p_method: method,
  });
  const row = data?.[0];
  if (error || !row) return fail(friendlyDbError(error, "Attendance could not be recorded."));
  return ok({ recordId: row.record_id, created: row.created, previousStatus: row.previous_status, status: row.status });
}

/** Used by QR scanning: resolves a scanned member number then records attendance. */
export async function recordByMemberNoAction(
  sessionId: string,
  scanned: string,
): Promise<ActionResult<RecordedAttendance & { memberId: string; memberNo: string; fullName: string }>> {
  const { denied } = await authorizeAction(["attendance.write", "attendance.correct"]);
  if (denied) return denied;
  const memberNo = scanned.trim().replace(/^LIGHT-MEMBER:/i, "").toUpperCase();
  if (!/^[A-Z]{2,6}-\d{4}-\d{3,}$/.test(memberNo)) return fail("This QR code is not a LIGHT member code.");
  const supabase = await createClient();
  const { data: matches, error: lookupError } = await supabase.rpc("member_lookup", { p_query: memberNo, p_limit: 2 });
  const member = matches?.find((m) => m.member_no === memberNo);
  if (lookupError || !member) return fail(`No active member found for ${memberNo}.`);
  const result = await recordAttendanceAction(sessionId, member.id, "present", "qr");
  if (!result.ok) return result;
  return ok({ ...result.data, memberId: member.id, memberNo: member.member_no, fullName: member.full_name });
}

export async function correctAttendanceAction(recordId: string, status: AttendanceStatus, reason: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["attendance.write", "attendance.correct"]);
  if (denied) return denied;
  if (!idSchema.safeParse(recordId).success || !statusSchema.safeParse(status).success) return fail("Invalid attendance record.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_attendance", { p_record_id: recordId, p_status: status, p_reason: reason.slice(0, 500) });
  if (error) return fail(friendlyDbError(error, "The correction could not be saved."));
  return ok(null, "Attendance corrected.");
}

export async function removeAttendanceAction(recordId: string, reason: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["attendance.write", "attendance.correct"]);
  if (denied) return denied;
  if (!idSchema.safeParse(recordId).success) return fail("Invalid attendance record.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_attendance", { p_record_id: recordId, p_reason: reason.slice(0, 500) });
  if (error) return fail(friendlyDbError(error, "The entry could not be removed."));
  return ok(null, "Attendance entry removed.");
}

export async function markRemainingAbsentAction(sessionId: string): Promise<ActionResult<{ count: number }>> {
  const { denied } = await authorizeAction(["attendance.write", "attendance.correct"]);
  if (denied) return denied;
  if (!idSchema.safeParse(sessionId).success) return fail("Invalid session.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_remaining_absent", { p_session_id: sessionId });
  if (error) return fail(friendlyDbError(error));
  revalidateSession(sessionId);
  return ok({ count: data ?? 0 }, `${data ?? 0} active members marked absent.`);
}

export async function setSessionStatusAction(sessionId: string, status: "open" | "closed"): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(status === "closed" ? ["attendance.write"] : ["attendance.correct"]);
  if (denied) return denied;
  if (!idSchema.safeParse(sessionId).success) return fail("Invalid session.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_session_status", { p_session_id: sessionId, p_status: status });
  if (error) return fail(friendlyDbError(error));
  revalidateSession(sessionId);
  return ok(null, status === "closed" ? "Session closed. Further changes require correction permission." : "Session reopened.");
}

const visitorSchema = z.object({
  full_name: z.string().trim().min(1, "Enter the visitor's name.").max(150),
  contact_number: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+()\- ]{7,20}$/.test(v), "Enter a valid contact number."),
  address: z.string().trim().max(200),
  invited_by_member_id: z.string().refine((v) => v === "" || idSchema.safeParse(v).success),
  is_first_time: z.boolean(),
  notes: z.string().trim().max(1000),
});

export type VisitorInput = z.input<typeof visitorSchema>;

export async function addVisitorAction(sessionId: string, input: VisitorInput): Promise<ActionResult<{ id: string }>> {
  const { denied } = await authorizeAction(["attendance.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(sessionId).success) return fail("Invalid session.");
  const parsed = visitorSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visitors")
    .insert({
      session_id: sessionId,
      full_name: v.full_name,
      contact_number: v.contact_number || null,
      address: v.address || null,
      invited_by_member_id: v.invited_by_member_id || null,
      is_first_time: v.is_first_time,
      notes: v.notes || null,
    })
    .select("id")
    .single();
  if (error || !data) return fail(friendlyDbError(error, "The visitor could not be added."));
  revalidateSession(sessionId);
  return ok({ id: data.id }, `${v.full_name} recorded as a visitor.`);
}

export async function removeVisitorAction(sessionId: string, visitorId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["attendance.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(visitorId).success) return fail("Invalid visitor.");
  const supabase = await createClient();
  const { error } = await supabase.from("visitors").delete().eq("id", visitorId).eq("session_id", sessionId);
  if (error) return fail(friendlyDbError(error));
  revalidateSession(sessionId);
  return ok(null, "Visitor removed.");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import type { Json } from "@/types/database";
import { authorizeAction } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";
import {
  baptismSchema,
  emptyToNull,
  memberCreateSchema,
  memberUpdateSchema,
  statusChangeSchema,
  type BaptismInput,
  type MemberCreateInput,
  type MemberUpdateInput,
  type StatusChangeInput,
} from "./schemas";

const idSchema = z.uuid();

function memberPayload(values: z.output<typeof memberUpdateSchema>) {
  const v = emptyToNull(values);
  return {
    first_name: values.first_name,
    middle_name: v.middle_name,
    last_name: values.last_name,
    suffix: v.suffix,
    gender: (v.gender || null) as "male" | "female" | null,
    civil_status: (v.civil_status || null) as "single" | "married" | "widowed" | "separated" | "annulled" | null,
    birthdate: v.birthdate,
    contact_number: v.contact_number,
    email: v.email,
    address_line: v.address_line,
    barangay: v.barangay,
    city: v.city,
    province: v.province,
    postal_code: v.postal_code,
    date_registered: values.date_registered,
    membership_date: v.membership_date,
    category_id: v.category_id,
    previous_church: v.previous_church,
    notes: v.notes,
  };
}

function revalidateMembers(memberId?: string) {
  revalidatePath("/members");
  revalidatePath("/dashboard");
  revalidatePath("/membership-status");
  if (memberId) revalidatePath(`/members/${memberId}`);
}

export async function registerMemberAction(input: MemberCreateInput): Promise<ActionResult<{ id: string; memberNo: string }>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;

  const parsed = memberCreateSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);

  const { status_id, is_baptized, baptism, ...member } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_member", {
    p_member: memberPayload(member) as Json,
    p_status_id: status_id,
    p_baptism: is_baptized ? (emptyToNull(baptism) as Json) : undefined,
  });
  if (error || !data?.[0]) return fail(friendlyDbError(error, "The member could not be registered."));

  revalidateMembers();
  return ok({ id: data[0].id, memberNo: data[0].member_no }, `Registered ${member.first_name} ${member.last_name} as ${data[0].member_no}.`);
}

export async function updateMemberAction(memberId: string, input: MemberUpdateInput): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");

  const parsed = memberUpdateSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.from("members").update(memberPayload(parsed.data)).eq("id", memberId).select("id");
  if (error) return fail(friendlyDbError(error, "The changes could not be saved."));
  if (!data || data.length === 0) return fail("The member was not found, is archived, or you cannot edit it.");

  revalidateMembers(memberId);
  return ok(null, "Member information updated.");
}

export type DuplicateCandidate = { id: string; member_no: string; full_name: string; birthdate: string | null; reason: string };

export async function findDuplicatesAction(input: {
  first_name: string;
  last_name: string;
  birthdate?: string;
  email?: string;
  contact_number?: string;
  exclude_id?: string;
}): Promise<ActionResult<DuplicateCandidate[]>> {
  const { denied } = await authorizeAction(["members.read"]);
  if (denied) return denied;
  const first = input.first_name.trim();
  const last = input.last_name.trim();
  if (first.length < 2 || last.length < 2) return ok([]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_possible_member_duplicates", {
    p_first_name: first.slice(0, 100),
    p_last_name: last.slice(0, 100),
    p_birthdate: input.birthdate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthdate) ? input.birthdate : undefined,
    p_email: input.email?.trim() || undefined,
    p_contact_number: input.contact_number?.trim() || undefined,
    p_exclude_id: input.exclude_id && idSchema.safeParse(input.exclude_id).success ? input.exclude_id : undefined,
  });
  if (error) return fail(friendlyDbError(error));
  return ok(data ?? []);
}

export async function changeMemberStatusAction(input: StatusChangeInput): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["membership.status_change"]);
  if (denied) return denied;
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_member_status", {
    p_member_id: parsed.data.member_id,
    p_status_id: parsed.data.status_id,
    p_effective_date: parsed.data.effective_date,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(friendlyDbError(error, "The status could not be changed."));
  revalidateMembers(parsed.data.member_id);
  return ok(null, "Membership status updated.");
}

export async function archiveMemberAction(memberId: string, reason: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.archive"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_member", { p_member_id: memberId, p_reason: reason.slice(0, 500) });
  if (error) return fail(friendlyDbError(error, "The member could not be archived."));
  revalidateMembers(memberId);
  return ok(null, "Member record archived. It can be restored at any time.");
}

export async function restoreMemberAction(memberId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.archive"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_member", { p_member_id: memberId });
  if (error) return fail(friendlyDbError(error, "The member could not be restored."));
  revalidateMembers(memberId);
  return ok(null, "Member record restored.");
}

export async function saveBaptismAction(memberId: string, input: BaptismInput): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["baptism.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const parsed = baptismSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const values = emptyToNull(parsed.data);

  const supabase = await createClient();
  const { data: existing } = await supabase.from("baptism_records").select("id").eq("member_id", memberId).maybeSingle();
  const { error } = existing
    ? await supabase.from("baptism_records").update(values).eq("id", existing.id)
    : await supabase.from("baptism_records").insert({ member_id: memberId, ...values });
  if (error) return fail(friendlyDbError(error, "The baptism record could not be saved."));
  revalidateMembers(memberId);
  return ok(null, "Baptism record saved.");
}

/** The audit trigger keeps a full copy of the removed record. */
export async function removeBaptismAction(memberId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["baptism.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const supabase = await createClient();
  const { error } = await supabase.from("baptism_records").delete().eq("member_id", memberId);
  if (error) return fail(friendlyDbError(error, "The baptism record could not be removed."));
  revalidateMembers(memberId);
  return ok(null, "Baptism record removed.");
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Verifies the file signature matches the declared image type. */
async function hasImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return (file.type === "image/jpeg" && isJpeg) || (file.type === "image/png" && isPng) || (file.type === "image/webp" && isWebp);
}

export async function uploadMemberPhotoAction(memberId: string, formData: FormData): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a photo to upload.");
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return fail("Use a JPG, PNG or WebP image.");
  if (file.size > MAX_PHOTO_BYTES) return fail("The photo must be 2 MB or smaller.");
  if (!(await hasImageSignature(file))) return fail("The file does not appear to be a valid image.");

  const supabase = await createClient();
  const { data: member } = await supabase.from("members").select("photo_path").eq("id", memberId).maybeSingle();
  if (!member) return fail("Member not found.");

  const path = `${memberId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("member-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return fail("The photo could not be uploaded. Please try again.");

  const { error } = await supabase.from("members").update({ photo_path: path }).eq("id", memberId);
  if (error) {
    await supabase.storage.from("member-photos").remove([path]);
    return fail(friendlyDbError(error, "The photo could not be saved."));
  }
  if (member.photo_path) await supabase.storage.from("member-photos").remove([member.photo_path]);
  revalidateMembers(memberId);
  return ok(null, "Photo updated.");
}

export async function removeMemberPhotoAction(memberId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const supabase = await createClient();
  const { data: member } = await supabase.from("members").select("photo_path").eq("id", memberId).maybeSingle();
  if (!member?.photo_path) return ok(null);
  const { error } = await supabase.from("members").update({ photo_path: null }).eq("id", memberId);
  if (error) return fail(friendlyDbError(error));
  await supabase.storage.from("member-photos").remove([member.photo_path]);
  revalidateMembers(memberId);
  return ok(null, "Photo removed.");
}

// ---------------------------------------------------------------------------
// Ministries
// ---------------------------------------------------------------------------

const ministrySchema = z.object({
  ministry_id: z.uuid("Select a ministry."),
  role: z.string().trim().max(80),
  start_date: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date."),
});

export async function addMemberMinistryAction(memberId: string, input: z.input<typeof ministrySchema>): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const parsed = ministrySchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.from("member_ministries").insert({
    member_id: memberId,
    ministry_id: parsed.data.ministry_id,
    role: parsed.data.role || null,
    start_date: parsed.data.start_date || null,
  });
  if (error) return fail(friendlyDbError(error, "The ministry could not be added."));
  revalidateMembers(memberId);
  return ok(null, "Ministry added.");
}

export async function removeMemberMinistryAction(memberId: string, assignmentId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(assignmentId).success) return fail("Invalid ministry assignment.");
  const supabase = await createClient();
  const { error } = await supabase.from("member_ministries").delete().eq("id", assignmentId).eq("member_id", memberId);
  if (error) return fail(friendlyDbError(error, "The ministry could not be removed."));
  revalidateMembers(memberId);
  return ok(null, "Ministry removed.");
}

// ---------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------

const relationshipSchema = z.enum(["head", "spouse", "child", "parent", "sibling", "relative", "other"]);

const householdSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), household_id: z.uuid("Select a household."), relationship: relationshipSchema }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(1, "Enter the household name.").max(150),
    address: z.string().trim().max(300),
    relationship: relationshipSchema,
  }),
]);

export async function assignHouseholdAction(memberId: string, input: z.input<typeof householdSchema>): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const parsed = householdSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  let householdId: string;
  if (parsed.data.mode === "new") {
    const { data, error } = await supabase
      .from("households")
      .insert({ name: parsed.data.name, address: parsed.data.address || null })
      .select("id")
      .single();
    if (error || !data) return fail(friendlyDbError(error, "The household could not be created."));
    householdId = data.id;
  } else {
    householdId = parsed.data.household_id;
  }

  const { error } = await supabase
    .from("household_members")
    .upsert({ household_id: householdId, member_id: memberId, relationship: parsed.data.relationship }, { onConflict: "member_id" });
  if (error) return fail(friendlyDbError(error, "The member could not be added to the household."));
  revalidateMembers(memberId);
  return ok(null, "Family information saved.");
}

export async function leaveHouseholdAction(memberId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["members.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(memberId).success) return fail("Invalid member.");
  const supabase = await createClient();
  const { error } = await supabase.from("household_members").delete().eq("member_id", memberId);
  if (error) return fail(friendlyDbError(error));
  revalidateMembers(memberId);
  return ok(null, "Member removed from the household.");
}

export async function searchHouseholdsAction(term: string): Promise<ActionResult<Array<{ id: string; name: string; address: string | null }>>> {
  const { denied } = await authorizeAction(["members.read"]);
  if (denied) return denied;
  const supabase = await createClient();
  let q = supabase.from("households").select("id, name, address").order("name").limit(15);
  const clean = term.trim().replace(/[%_\\,()]/g, "");
  if (clean) q = q.ilike("name", `%${clean}%`);
  const { data, error } = await q;
  if (error) return fail(friendlyDbError(error));
  return ok(data ?? []);
}

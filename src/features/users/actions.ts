"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import { publicEnv } from "@/lib/env";
import { authorizeAction } from "@/server/auth/session";
import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";

const idSchema = z.uuid();

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  full_name: z.string().trim().min(2, "Enter the person's full name.").max(200),
  role_ids: z.array(z.uuid()).min(1, "Assign at least one role."),
});

export type InviteInput = z.input<typeof inviteSchema>;

function revalidateUsers() {
  revalidatePath("/users");
  revalidatePath("/users/roles");
}

export async function inviteUserAction(input: InviteInput): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["users.manage"]);
  if (denied) return denied;
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("Inviting users requires the server to be configured with the service role key.");

  const supabase = await createClient();
  const { data: existing } = await supabase.from("profiles").select("id").eq("email", parsed.data.email.toLowerCase()).maybeSingle();
  if (existing) return fail("A user with this email already exists.");

  // Service role is used only for the auth invitation itself.
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.full_name },
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
  });
  if (error || !data.user) return fail(error?.message.includes("already") ? "A user with this email already exists." : "The invitation could not be sent.");

  // Role assignment runs as the administrator so RLS and the audit trail apply.
  const { error: roleError } = await supabase
    .from("user_roles")
    .insert(parsed.data.role_ids.map((role_id) => ({ user_id: data.user.id, role_id })));
  if (roleError) return fail(`Invitation sent, but roles could not be assigned: ${friendlyDbError(roleError)}`);
  await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", data.user.id);

  revalidateUsers();
  return ok(null, `Invitation sent to ${parsed.data.email}.`);
}

export async function setUserRolesAction(userId: string, roleIds: string[]): Promise<ActionResult<null>> {
  const { user, denied } = await authorizeAction(["users.manage"]);
  if (denied) return denied;
  if (!idSchema.safeParse(userId).success || !z.array(z.uuid()).safeParse(roleIds).success) return fail("Invalid user or roles.");
  if (roleIds.length === 0) return fail("Assign at least one role. To remove access, deactivate the account instead.");

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("user_roles").select("role_id").eq("user_id", userId);
  if (readError) return fail(friendlyDbError(readError));
  const have = new Set((current ?? []).map((r) => r.role_id));
  const want = new Set(roleIds);
  const toAdd = [...want].filter((r) => !have.has(r));
  const toRemove = [...have].filter((r) => !want.has(r));

  if (toAdd.length) {
    const { error } = await supabase.from("user_roles").insert(toAdd.map((role_id) => ({ user_id: userId, role_id, assigned_by: user.id })));
    if (error) return fail(friendlyDbError(error, "Roles could not be added."));
  }
  if (toRemove.length) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).in("role_id", toRemove);
    if (error) return fail(friendlyDbError(error, "Roles could not be removed."));
  }
  revalidateUsers();
  return ok(null, "Roles updated.");
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult<null>> {
  const { user, denied } = await authorizeAction(["users.manage"]);
  if (denied) return denied;
  if (!idSchema.safeParse(userId).success) return fail("Invalid user.");
  if (userId === user.id && !active) return fail("You cannot deactivate your own account.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) return fail(friendlyDbError(error, "The account could not be updated."));

  // Also block or restore sign-in at the authentication level.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  }
  revalidateUsers();
  return ok(null, active ? "Account reactivated." : "Account deactivated. The user can no longer sign in.");
}

export async function updateUserNameAction(userId: string, fullName: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["users.manage"]);
  if (denied) return denied;
  const name = fullName.trim();
  if (!idSchema.safeParse(userId).success || name.length < 2 || name.length > 200) return fail("Enter a valid name.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", userId);
  if (error) return fail(friendlyDbError(error));
  revalidateUsers();
  return ok(null, "Name updated.");
}

export async function resendInviteAction(email: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["users.manage"]);
  if (denied) return denied;
  if (!z.email().safeParse(email).success) return fail("Invalid email.");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
  });
  if (error) return fail("The email could not be sent. Try again later.");
  return ok(null, `A password setup link was sent to ${email}.`);
}

export async function setRolePermissionAction(roleId: string, permissionId: string, granted: boolean): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["users.manage"]);
  if (denied) return denied;
  if (!idSchema.safeParse(roleId).success || !idSchema.safeParse(permissionId).success) return fail("Invalid role or permission.");
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("key").eq("id", roleId).maybeSingle();
  if (role?.key === "super_admin") return fail("The Super Administrator role always has every permission.");
  const { error } = granted
    ? await supabase.from("role_permissions").upsert({ role_id: roleId, permission_id: permissionId }, { onConflict: "role_id,permission_id", ignoreDuplicates: true })
    : await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_id", permissionId);
  if (error) return fail(friendlyDbError(error, "The permission could not be changed."));
  revalidateUsers();
  return ok(null);
}

const roleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z_]{1,48}$/, "Use lowercase letters and underscores, e.g. ministry_leader."),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
});

export async function createRoleAction(input: z.input<typeof roleSchema>): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["users.manage"]);
  if (denied) return denied;
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the role details.", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert(parsed.data);
  if (error) return fail(friendlyDbError(error, "The role could not be created."));
  revalidateUsers();
  return ok(null, "Role created. Choose its permissions in the matrix.");
}

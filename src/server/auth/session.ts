import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { fail, type ActionFailure } from "@/lib/action-result";
import { hasAnyPermission, isPermission, type Permission, type PermissionSet } from "@/lib/permissions";
import { createClient } from "@/server/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  permissions: PermissionSet;
  roles: string[];
};

/**
 * Resolves the signed-in user, verified with Supabase Auth, together with
 * the permissions the database grants them. Memoized per request.
 * Returns null when there is no valid session or the account is inactive.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return null;

  const [profileResult, permissionsResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_active").eq("id", auth.user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
    supabase.from("user_roles").select("roles(name)").eq("user_id", auth.user.id),
  ]);

  const profile = profileResult.data;
  if (!profile || !profile.is_active) return null;

  const permissions = new Set<Permission>(
    (permissionsResult.data ?? []).filter((p): p is Permission => typeof p === "string" && isPermission(p)),
  );

  return {
    id: auth.user.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    permissions,
    roles: (rolesResult.data ?? []).map((r) => r.roles?.name).filter((n): n is string => Boolean(n)),
  };
});

/** For pages: redirects to the sign-in page when there is no session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // `error=session` tells the proxy not to bounce a still-valid but rejected
  // session (e.g. a deactivated account) straight back to the dashboard.
  if (!user) redirect("/login?error=session");
  return user;
}

/**
 * For pages: returns the user when they hold any of the permissions, or
 * null so the page can render an access-denied state.
 */
export async function getUserWithAccess(permissions: readonly Permission[]): Promise<{ user: CurrentUser; allowed: boolean }> {
  const user = await requireUser();
  return { user, allowed: hasAnyPermission(user.permissions, permissions) };
}

/**
 * For server actions: verifies the session and permission. Returns either
 * the user or an ActionFailure to return to the client. The database
 * re-checks the permission independently.
 */
export async function authorizeAction(
  permissions: readonly Permission[],
): Promise<{ user: CurrentUser; denied: null } | { user: null; denied: ActionFailure }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, denied: fail("Your session has expired. Please sign in again.") };
  if (permissions.length > 0 && !hasAnyPermission(user.permissions, permissions)) {
    return { user: null, denied: fail("You do not have permission to perform this action.") };
  }
  return { user, denied: null };
}

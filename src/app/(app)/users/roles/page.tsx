import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import { CreateRoleDialog, PermissionToggle } from "@/features/users/components";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserWithAccess } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Roles and permissions" };

const MODULE_LABELS: Record<string, string> = {
  members: "Members",
  membership: "Membership status",
  attendance: "Attendance",
  certificates: "Certificates",
  finance: "Finance",
  reports: "Reports",
  admin: "Administration",
};

export default function RolesPage() {
  return (
    <>
      <PageHeader
        title="Roles and permissions"
        description="What each role can do. Permissions are enforced by the database, not only hidden in the interface."
        breadcrumbs={[{ label: "User Management", href: "/users" }, { label: "Roles and permissions" }]}
        actions={<CreateRoleDialog />}
      />
      <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
        <Matrix />
      </Suspense>
    </>
  );
}

async function Matrix() {
  const { allowed } = await getUserWithAccess(["users.manage"]);
  if (!allowed) return <AccessDenied />;
  const supabase = await createClient();
  const [roles, permissions, grants] = await Promise.all([
    supabase.from("roles").select("id, key, name").order("is_system", { ascending: false }).order("name"),
    supabase.from("permissions").select("id, key, module, description").order("module").order("key"),
    supabase.from("role_permissions").select("role_id, permission_id"),
  ]);
  const granted = new Set((grants.data ?? []).map((g) => `${g.role_id}:${g.permission_id}`));
  const modules = [...new Set((permissions.data ?? []).map((p) => p.module))];

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 z-10 min-w-64 bg-card px-3 py-2 text-left font-medium">Permission</th>
            {(roles.data ?? []).map((r) => (
              <th key={r.id} className="px-2 py-2 text-center text-xs font-medium">
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <Fragment key={m}>
              <tr className="bg-muted/50">
                <td colSpan={(roles.data?.length ?? 0) + 1} className="sticky left-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {MODULE_LABELS[m] ?? m}
                </td>
              </tr>
              {(permissions.data ?? [])
                .filter((p) => p.module === m)
                .map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="sticky left-0 bg-card px-3 py-2">
                      {p.description}
                      <span className="block font-mono text-xs text-muted-foreground">{p.key}</span>
                    </td>
                    {(roles.data ?? []).map((r) => (
                      <td key={r.id} className="px-2 py-2 text-center">
                        <PermissionToggle roleId={r.id} permissionId={p.id} granted={granted.has(`${r.id}:${p.id}`)} locked={r.key === "super_admin"} />
                      </td>
                    ))}
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

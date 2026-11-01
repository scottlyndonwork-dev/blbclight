import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InviteUserDialog, UserRowActions } from "@/features/users/components";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "User management" };

export default function UsersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const { user, allowed } = await getUserWithAccess(["users.manage"]);
  if (!allowed) return <AccessDenied />;
  const supabase = await createClient();
  const [profiles, roles] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, is_active, last_sign_in_at, created_at, user_roles!user_roles_user_id_fkey(role_id, roles(name))").order("full_name"),
    supabase.from("roles").select("id, key, name, description").order("is_system", { ascending: false }).order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="User Management"
        description="Staff accounts and their roles. Accounts are created by invitation only."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "User Management" }]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/users/roles">
                <KeyRound /> Roles &amp; permissions
              </Link>
            </Button>
            <InviteUserDialog roles={roles.data ?? []} />
          </>
        }
      />
      {profiles.error ? (
        <ErrorState />
      ) : (
        <section className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profiles.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="font-medium">{p.full_name || "(no name)"}</span>
                    {p.id === user.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                    <span className="block text-xs text-muted-foreground">{p.email}</span>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-sm">{p.user_roles.map((r) => r.roles?.name).join(", ") || "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{p.last_sign_in_at ? formatDateTime(p.last_sign_in_at) : "Never"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={p.is_active ? "green" : "gray"}>{p.is_active ? "Active" : "Deactivated"}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      userId={p.id}
                      email={p.email}
                      name={p.full_name || p.email}
                      active={p.is_active}
                      isSelf={p.id === user.id}
                      roles={roles.data ?? []}
                      currentRoleIds={p.user_roles.map((r) => r.role_id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { MemberForm } from "@/features/members/components/member-form";
import { emptyMemberForm } from "@/features/members/schemas";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { todayManila } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { getMemberLookups } from "@/server/queries/members";

export const metadata: Metadata = { title: "Register member" };

export default function NewMemberPage() {
  return (
    <>
      <PageHeader
        title="Register member"
        description="Fields marked * are required. A member ID is assigned automatically."
        breadcrumbs={[{ label: "Members", href: "/members" }, { label: "Register member" }]}
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <NewMemberForm />
      </Suspense>
    </>
  );
}

async function NewMemberForm() {
  const { user, allowed } = await getUserWithAccess(["members.write"]);
  if (!allowed) return <AccessDenied />;
  const lookups = await getMemberLookups();
  const statuses = lookups.statuses.filter((s) => s.is_active);
  const defaultStatus = statuses.find((s) => s.key === "active") ?? statuses[0];

  return (
    <MemberForm
      mode="create"
      defaultValues={emptyMemberForm(defaultStatus?.id ?? "", todayManila())}
      statuses={statuses}
      categories={lookups.categories.filter((c) => c.is_active)}
      canRecordBaptism={user.permissions.has("baptism.write")}
    />
  );
}

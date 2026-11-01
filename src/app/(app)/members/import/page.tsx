import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportWizard } from "@/features/members/components/import-wizard";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserWithAccess } from "@/server/auth/session";
import { getMemberLookups } from "@/server/queries/members";

export const metadata: Metadata = { title: "Import members" };

export default function ImportMembersPage() {
  return (
    <>
      <PageHeader
        title="Import members"
        description="Add many members at once from an Excel or CSV file."
        breadcrumbs={[{ label: "Members", href: "/members" }, { label: "Import" }]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Importer />
      </Suspense>
    </>
  );
}

async function Importer() {
  const { allowed } = await getUserWithAccess(["members.import"]);
  if (!allowed) return <AccessDenied />;
  const { statuses } = await getMemberLookups();
  const active = statuses.filter((s) => s.is_active);
  return <ImportWizard statuses={active} defaultStatusId={active.find((s) => s.key === "active")?.id ?? active[0]?.id ?? ""} />;
}

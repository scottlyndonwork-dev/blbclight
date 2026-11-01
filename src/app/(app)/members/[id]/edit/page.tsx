import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MemberForm } from "@/features/members/components/member-form";
import { emptyMemberForm } from "@/features/members/schemas";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { todayManila } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { getMember, getMemberLookups } from "@/server/queries/members";

export const metadata: Metadata = { title: "Edit member" };

export default function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
      <EditMember params={params} />
    </Suspense>
  );
}

async function EditMember({ params }: { params: Promise<{ id: string }> }) {
  const [{ allowed }, { id }] = await Promise.all([getUserWithAccess(["members.write"]), params]);
  if (!allowed) return <AccessDenied />;
  const [member, lookups] = await Promise.all([getMember(id), getMemberLookups()]);
  if (!member) notFound();

  const name = `${member.first_name} ${member.last_name}`;
  const header = (
    <PageHeader
      title={`Edit ${name}`}
      description={`Member ID ${member.member_no}. Status changes are made from the member profile.`}
      breadcrumbs={[{ label: "Members", href: "/members" }, { label: name, href: `/members/${member.id}` }, { label: "Edit" }]}
    />
  );

  if (member.archived_at) {
    return (
      <>
        {header}
        <EmptyState title="This record is archived" description="Restore the record from the member profile before editing it." />
      </>
    );
  }

  const base = emptyMemberForm(member.current_status_id, todayManila());
  return (
    <>
      {header}
      <MemberForm
        mode="edit"
        memberId={member.id}
        statuses={lookups.statuses}
        categories={lookups.categories.filter((c) => c.is_active || c.id === member.category_id)}
        canRecordBaptism={false}
        defaultValues={{
          ...base,
          first_name: member.first_name,
          middle_name: member.middle_name ?? "",
          last_name: member.last_name,
          suffix: member.suffix ?? "",
          gender: member.gender ?? "",
          civil_status: member.civil_status ?? "",
          birthdate: member.birthdate ?? "",
          contact_number: member.contact_number ?? "",
          email: member.email ?? "",
          address_line: member.address_line ?? "",
          barangay: member.barangay ?? "",
          city: member.city ?? "",
          province: member.province ?? "",
          postal_code: member.postal_code ?? "",
          date_registered: member.date_registered,
          membership_date: member.membership_date ?? "",
          category_id: member.category_id ?? "",
          previous_church: member.previous_church ?? "",
          notes: member.notes ?? "",
        }}
      />
    </>
  );
}

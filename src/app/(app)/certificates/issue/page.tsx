import type { Metadata } from "next";
import { Suspense } from "react";
import { IssueForm, type IssueDefaults, type IssueTemplate } from "@/features/certificates/components/issue-form";
import { parseTemplateFields } from "@/features/certificates/template";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserWithAccess } from "@/server/auth/session";
import { snapshotSchema } from "@/server/certificates";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Issue certificate" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f-]{36}$/i;

export default function IssueCertificatePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Issue certificate"
        description="Member details are filled in automatically. Preview before issuing."
        breadcrumbs={[{ label: "Certificates", href: "/certificates" }, { label: "Issue" }]}
      />
      <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
        <Issue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Issue({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([getUserWithAccess(["certificates.issue"]), searchParams]);
  if (!allowed) return <AccessDenied />;
  const memberId = typeof params.member === "string" && UUID.test(params.member) ? params.member : null;
  const replacesId = typeof params.replaces === "string" && UUID.test(params.replaces) ? params.replaces : null;
  if (replacesId && !user.permissions.has("certificates.void")) return <AccessDenied message="Replacing a certificate requires permission to void certificates." />;

  const supabase = await createClient();
  const [templatesResult, signatoriesResult, memberResult, replacesResult] = await Promise.all([
    supabase
      .from("certificate_templates")
      .select("id, name, is_default, fields, type_id, certificate_types!inner(name, requires_member, is_active, sort_order)")
      .eq("is_active", true)
      .eq("certificate_types.is_active", true)
      .order("name"),
    supabase.from("certificate_signatories").select("id, full_name, title").eq("is_active", true).order("sort_order"),
    memberId
      ? supabase.from("member_list").select("id, member_no, full_name, status_name").eq("id", memberId).is("archived_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
    replacesId
      ? supabase
          .from("certificates")
          .select("id, reference_no, status, template_id, recipient_name, data, member_id, certificate_signers(signatory_id, sort_order)")
          .eq("id", replacesId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sorted = (templatesResult.data ?? [])
    .map((t) => ({
      id: t.id,
      name: t.name,
      typeId: t.type_id,
      typeName: t.certificate_types.name,
      requiresMember: t.certificate_types.requires_member,
      isDefault: t.is_default,
      fields: parseTemplateFields(t.fields),
      sort: t.certificate_types.sort_order,
    }))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const templates: IssueTemplate[] = sorted.map(({ sort: _sort, ...t }) => t);

  if (templates.length === 0) {
    return <EmptyState title="No active certificate templates" description="Create a template under Certificates → Templates first." />;
  }

  const defaults: IssueDefaults = {};
  const m = memberResult.data;
  if (m?.id && m.member_no && m.full_name) defaults.member = { id: m.id, member_no: m.member_no, full_name: m.full_name, status_name: m.status_name ?? "" };

  const original = replacesResult.data;
  if (replacesId) {
    if (!original || original.status !== "issued") return <EmptyState title="Only an issued certificate can be replaced" />;
    const snapshot = snapshotSchema.safeParse(original.data);
    defaults.templateId = original.template_id;
    defaults.recipientName = original.recipient_name;
    defaults.fieldValues = snapshot.success ? snapshot.data.fields : {};
    defaults.signatoryIds = [...original.certificate_signers].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.signatory_id);
    defaults.replaces = { id: original.id, referenceNo: original.reference_no };
    if (original.member_id && !defaults.member) {
      const { data: om } = await supabase.from("member_list").select("id, member_no, full_name, status_name").eq("id", original.member_id).maybeSingle();
      if (om?.id && om.member_no && om.full_name) defaults.member = { id: om.id, member_no: om.member_no, full_name: om.full_name, status_name: om.status_name ?? "" };
    }
  }

  return <IssueForm templates={templates} signatories={signatoriesResult.data ?? []} defaults={defaults} />;
}

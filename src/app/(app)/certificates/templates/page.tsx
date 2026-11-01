import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignatoryDialog, TemplateDialog } from "@/features/certificates/components/template-editor";
import { parseTemplateFields } from "@/features/certificates/template";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getUserWithAccess } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Certificate templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Certificate templates"
        description="Wording, layout and authorized signatories for each certificate type."
        breadcrumbs={[{ label: "Certificates", href: "/certificates" }, { label: "Templates" }]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Templates />
      </Suspense>
    </>
  );
}

async function Templates() {
  const { allowed } = await getUserWithAccess(["certificates.templates"]);
  if (!allowed) return <AccessDenied />;
  const supabase = await createClient();
  const [types, templates, signatories] = await Promise.all([
    supabase.from("certificate_types").select("id, name, is_active").order("sort_order"),
    supabase
      .from("certificate_templates")
      .select("id, type_id, name, title, subtitle, body, footer_text, fields, orientation, show_qr, is_default, is_active, certificate_types(name, sort_order)")
      .order("name"),
    supabase.from("certificate_signatories").select("id, full_name, title, signature_path, is_active, sort_order").order("sort_order").order("full_name"),
  ]);
  const activeTypes = (types.data ?? []).filter((t) => t.is_active);
  const rows = [...(templates.data ?? [])].sort((a, b) => (a.certificate_types?.sort_order ?? 0) - (b.certificate_types?.sort_order ?? 0));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">Templates</h2>
          {activeTypes.length > 0 && <TemplateDialog types={activeTypes} />}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Template</TableHead>
              <TableHead className="hidden md:table-cell">Fields</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.certificate_types?.name}</TableCell>
                <TableCell>
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.title}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell">{parseTemplateFields(t.fields).length || "—"}</TableCell>
                <TableCell className="space-x-1">
                  <StatusBadge tone={t.is_active ? "green" : "gray"}>{t.is_active ? "Active" : "Inactive"}</StatusBadge>
                  {t.is_default && <StatusBadge tone="gold">Default</StatusBadge>}
                </TableCell>
                <TableCell>
                  <TemplateDialog
                    types={types.data ?? []}
                    templateId={t.id}
                    initial={{
                      type_id: t.type_id,
                      name: t.name,
                      title: t.title,
                      subtitle: t.subtitle ?? "",
                      body: t.body,
                      footer_text: t.footer_text ?? "",
                      fields: parseTemplateFields(t.fields),
                      orientation: t.orientation,
                      show_qr: t.show_qr,
                      is_default: t.is_default,
                      is_active: t.is_active,
                    }}
                    trigger={
                      <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${t.name}`}>
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="h-fit rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">Authorized signatories</h2>
          <SignatoryDialog />
        </div>
        {(signatories.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Add at least one signatory before issuing certificates.</p>
        ) : (
          <ul className="divide-y text-sm">
            {(signatories.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <p className="font-medium">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.title}
                    {s.signature_path ? " · signature on file" : ""}
                    {!s.is_active ? " · inactive" : ""}
                  </p>
                </div>
                <SignatoryDialog
                  signatory={{ id: s.id, full_name: s.full_name, title: s.title, is_active: s.is_active, has_signature: Boolean(s.signature_path) }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

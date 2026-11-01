import { Ban, Download, ExternalLink, Printer, RefreshCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VoidCertificateButton } from "@/features/certificates/components/void-button";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { snapshotSchema, verifyUrl } from "@/server/certificates";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Certificate" };

const CERT_STATUS = { issued: ["green", "Issued"], voided: ["red", "Voided"], replaced: ["slate", "Replaced"] } as const;

export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <Certificate params={params} />
    </Suspense>
  );
}

async function Certificate({ params }: { params: Promise<{ id: string }> }) {
  const [{ user, allowed }, { id }] = await Promise.all([getUserWithAccess(["certificates.read", "certificates.issue"]), params]);
  if (!allowed) return <AccessDenied />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("certificates")
    .select(
      "id, reference_no, verification_token, recipient_name, issued_on, status, void_reason, voided_at, created_at, member_id, data, replaces_certificate_id, certificate_types(name), issued_by_profile:profiles!certificates_issued_by_fkey(full_name), voided_by_profile:profiles!certificates_voided_by_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cert) notFound();

  const [{ data: replacedBy }, { data: replaces }, { data: printEvents }] = await Promise.all([
    supabase.from("certificates").select("id, reference_no").eq("replaces_certificate_id", cert.id).maybeSingle(),
    cert.replaces_certificate_id
      ? supabase.from("certificates").select("id, reference_no").eq("id", cert.replaces_certificate_id).maybeSingle()
      : Promise.resolve({ data: null }),
    user.permissions.has("audit.read")
      ? supabase
          .from("audit_logs")
          .select("id, created_at, summary, actor:profiles(full_name)")
          .eq("entity_type", "certificate")
          .eq("entity_id", cert.id)
          .eq("action", "certificate.print")
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
  ]);

  const snapshot = snapshotSchema.safeParse(cert.data);
  const valid = cert.status === "issued";
  const pdfUrl = `/api/certificates/${cert.id}/pdf`;

  return (
    <>
      <PageHeader
        title={cert.reference_no}
        description={`${cert.certificate_types?.name} for ${cert.recipient_name}`}
        breadcrumbs={[{ label: "Certificates", href: "/certificates" }, { label: cert.reference_no }]}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={pdfUrl} target="_blank" rel="noopener">
                <Printer /> {valid ? "Print" : "View"}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`${pdfUrl}?download=1`}>
                <Download /> Download PDF
              </a>
            </Button>
            {valid && user.permissions.has("certificates.void") && user.permissions.has("certificates.issue") && (
              <Button variant="outline" asChild>
                <Link href={`/certificates/issue?replaces=${cert.id}`}>
                  <RefreshCcw /> Replace
                </Link>
              </Button>
            )}
            {valid && user.permissions.has("certificates.void") && (
              <VoidCertificateButton
                certificateId={cert.id}
                trigger={
                  <Button variant="outline" className="text-destructive">
                    <Ban /> Void
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="rounded-lg border bg-card p-6">
          {snapshot.success ? (
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{snapshot.data.church.name}</p>
              <h2 className="mt-3 font-serif text-2xl font-semibold text-primary">{snapshot.data.title}</h2>
              {snapshot.data.subtitle && <p className="mt-2 text-sm italic text-muted-foreground">{snapshot.data.subtitle}</p>}
              <p className="mt-4 whitespace-pre-line font-serif leading-relaxed">{snapshot.data.body}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-8">
                {snapshot.data.signatories.map((s) => (
                  <div key={s.full_name} className="min-w-40 border-t pt-1 text-sm">
                    <p className="font-semibold">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">{s.title}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-destructive">The stored certificate content could not be read.</p>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-4 text-sm">
            <dl className="space-y-3">
              <Item label="Status">
                <StatusBadge tone={CERT_STATUS[cert.status][0]}>{CERT_STATUS[cert.status][1]}</StatusBadge>
              </Item>
              <Item label="Recipient">
                {cert.member_id ? (
                  <Link href={`/members/${cert.member_id}`} className="text-primary hover:underline">
                    {cert.recipient_name}
                  </Link>
                ) : (
                  cert.recipient_name
                )}
              </Item>
              <Item label="Date of issuance">{formatDate(cert.issued_on, "MMMM d, yyyy")}</Item>
              <Item label="Issued by">
                {cert.issued_by_profile?.full_name ?? "—"} · {formatDateTime(cert.created_at)}
              </Item>
              {!valid && (
                <Item label={cert.status === "replaced" ? "Replaced" : "Voided"}>
                  {cert.void_reason}
                  <span className="block text-xs text-muted-foreground">
                    {cert.voided_by_profile?.full_name} · {formatDateTime(cert.voided_at)}
                  </span>
                </Item>
              )}
              {replacedBy && (
                <Item label="Replacement">
                  <Link href={`/certificates/${replacedBy.id}`} className="font-mono text-primary hover:underline">
                    {replacedBy.reference_no}
                  </Link>
                </Item>
              )}
              {replaces && (
                <Item label="Replaces">
                  <Link href={`/certificates/${replaces.id}`} className="font-mono text-primary hover:underline">
                    {replaces.reference_no}
                  </Link>
                </Item>
              )}
              <Item label="Public verification">
                <a href={verifyUrl(cert.verification_token)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Open verification page <ExternalLink className="size-3" />
                </a>
              </Item>
            </dl>
          </section>
          {printEvents && (
            <section className="rounded-lg border bg-card p-4 text-sm">
              <h2 className="mb-2 font-semibold">Print and download history</h2>
              {printEvents.length === 0 ? (
                <p className="text-muted-foreground">Not printed yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {printEvents.map((e) => (
                    <li key={e.id} className="text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)} · {e.actor?.full_name ?? "Unknown"}
                      <span className="block">{e.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

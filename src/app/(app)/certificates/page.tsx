import { Award, FilePlus2, LayoutTemplate } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DateRangeFilter, FilterSelect, Pager, SearchInput } from "@/components/shared/url-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, RANGE_PRESETS, resolveDateRange } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Certificates" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE_SIZE = 25;
const CERT_STATUS = { issued: ["green", "Issued"], voided: ["red", "Voided"], replaced: ["slate", "Replaced"] } as const;

export default function CertificatesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <Certificates searchParams={searchParams} />
    </Suspense>
  );
}

async function Certificates({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([
    getUserWithAccess(["certificates.read", "certificates.issue", "certificates.templates"]),
    searchParams,
  ]);
  if (!allowed) return <AccessDenied />;
  const canList = user.permissions.has("certificates.read") || user.permissions.has("certificates.issue");

  const range = resolveDateRange(params, "this_year");
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const status = typeof params.status === "string" && ["issued", "voided", "replaced"].includes(params.status) ? (params.status as keyof typeof CERT_STATUS) : undefined;

  const supabase = await createClient();
  const { data: types } = await supabase.from("certificate_types").select("id, name").order("sort_order");
  const typeId = types?.find((t) => t.id === params.type)?.id;

  let query = supabase
    .from("certificates")
    .select("id, reference_no, recipient_name, issued_on, status, member_id, certificate_types(name), issued_by_profile:profiles!certificates_issued_by_fkey(full_name)", { count: "exact" })
    .gte("issued_on", range.from)
    .lte("issued_on", range.to)
    .order("issued_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (typeId) query = query.eq("type_id", typeId);
  if (status) query = query.eq("status", status);
  if (q) {
    const term = q.replace(/[%_,()\\]/g, "");
    query = query.or(`reference_no.ilike.%${term}%,recipient_name.ilike.%${term}%`);
  }
  const result = canList ? await query : null;

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Issue, reprint and verify church certificates."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Certificates" }]}
        actions={
          <>
            {user.permissions.has("certificates.templates") && (
              <Button variant="outline" asChild>
                <Link href="/certificates/templates">
                  <LayoutTemplate /> Templates &amp; signatories
                </Link>
              </Button>
            )}
            {user.permissions.has("certificates.issue") && (
              <Button asChild>
                <Link href="/certificates/issue">
                  <FilePlus2 /> Issue certificate
                </Link>
              </Button>
            )}
          </>
        }
      />

      {!result ? (
        <EmptyState title="Manage templates" description="Your role can manage certificate templates and signatories but not view issued certificates." />
      ) : (
        <section className="rounded-lg border bg-card">
          <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:flex-wrap lg:items-center">
            <SearchInput placeholder="Search reference or name" />
            <FilterSelect param="type" placeholder="Type" allLabel="All types" options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} />
            <FilterSelect
              param="status"
              placeholder="Status"
              allLabel="All statuses"
              options={Object.entries(CERT_STATUS).map(([value, [, label]]) => ({ value, label }))}
            />
            <DateRangeFilter from={range.from} to={range.to} presets={Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }))} />
          </div>
          {result.error ? (
            <div className="p-4">
              <ErrorState />
            </div>
          ) : (result.data ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Award} title="No certificates found" description="Change the filters or issue a new certificate." className="border-0" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Issued by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(result.data ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/certificates/${c.id}`} className="font-mono text-xs font-medium hover:text-primary hover:underline">
                          {c.reference_no}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {c.member_id ? (
                          <Link href={`/members/${c.member_id}`} className="hover:underline">
                            {c.recipient_name}
                          </Link>
                        ) : (
                          c.recipient_name
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{c.certificate_types?.name}</TableCell>
                      <TableCell>{formatDate(c.issued_on)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={CERT_STATUS[c.status][0]}>{CERT_STATUS[c.status][1]}</StatusBadge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{c.issued_by_profile?.full_name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager page={page} pageSize={PAGE_SIZE} total={result.count ?? 0} />
            </>
          )}
        </section>
      )}
    </>
  );
}

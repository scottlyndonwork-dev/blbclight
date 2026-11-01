import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState, ErrorState } from "@/components/shared/states";
import { DateRangeFilter, FilterSelect, Pager, SearchInput } from "@/components/shared/url-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, RANGE_PRESETS, resolveDateRange } from "@/lib/dates";
import type { Json } from "@/types/database";
import { getUserWithAccess } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Audit logs" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE_SIZE = 50;

const ENTITY_LABELS: Record<string, string> = {
  user: "Users and sign-ins",
  user_role: "User roles",
  role: "Roles",
  role_permission: "Permissions",
  member: "Members",
  membership_status: "Membership status",
  baptism: "Baptism records",
  household: "Households",
  household_member: "Household members",
  member_ministry: "Ministry assignments",
  attendance_session: "Attendance sessions",
  attendance: "Attendance corrections",
  visitor: "Visitors",
  certificate: "Certificates",
  certificate_template: "Certificate templates",
  certificate_signatory: "Signatories",
  financial_transaction: "Financial transactions",
  fund_transfer: "Fund allocations",
  financial_attachment: "Financial attachments",
  fund: "Funds",
  financial_category: "Financial categories",
  settings: "System settings",
  report: "Reports",
};

function describeAction(action: string): string {
  const [, verb] = action.split(".");
  const map: Record<string, string> = {
    insert: "Created",
    update: "Updated",
    delete: "Deleted",
    login: "Signed in",
    login_failed: "Failed sign-in",
    logout: "Signed out",
    password_changed: "Changed password",
    print: "Printed / downloaded",
    exported: "Exported",
    members: "Exported",
    transactions: "Exported",
  };
  return map[verb ?? ""] ?? action;
}

function JsonBlock({ label, value }: { label: string; value: Json | null }) {
  if (!value || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function AuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <AuditLogs searchParams={searchParams} />
    </Suspense>
  );
}

async function AuditLogs({ searchParams }: { searchParams: SearchParams }) {
  const [{ allowed }, params] = await Promise.all([getUserWithAccess(["audit.read"]), searchParams]);
  if (!allowed) return <AccessDenied />;
  const range = resolveDateRange(params, "last_30_days");
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const entity = typeof params.entity === "string" && params.entity in ENTITY_LABELS ? params.entity : undefined;
  const actor = typeof params.actor === "string" && /^[0-9a-f-]{36}$/i.test(params.actor) ? params.actor : undefined;
  const q = typeof params.q === "string" ? params.q.replace(/[%_,()\\]/g, "").slice(0, 60) : "";

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, created_at, action, entity_type, entity_id, summary, before_data, after_data, metadata, actor:profiles(full_name, email)", { count: "exact" })
    .gte("created_at", `${range.from}T00:00:00+08:00`)
    .lte("created_at", `${range.to}T23:59:59.999+08:00`)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (entity) query = query.eq("entity_type", entity);
  if (actor) query = query.eq("actor_id", actor);
  if (q) query = query.or(`action.ilike.%${q}%,summary.ilike.%${q}%,entity_id.ilike.%${q}%`);

  const [logs, users] = await Promise.all([query, supabase.from("profiles").select("id, full_name, email").order("full_name")]);

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="A permanent record of sign-ins and changes to church records. Entries cannot be edited or deleted."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit Logs" }]}
      />
      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput placeholder="Search action, summary or record ID" />
          <FilterSelect param="entity" placeholder="Area" allLabel="All areas" options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))} className="sm:w-52" />
          <FilterSelect param="actor" placeholder="User" allLabel="All users" options={(users.data ?? []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} className="sm:w-52" />
          <DateRangeFilter from={range.from} to={range.to} presets={Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }))} />
        </div>
        {logs.error ? (
          <div className="p-4">
            <ErrorState />
          </div>
        ) : (logs.data ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState icon={ScrollText} title="No activity in this period" className="border-0" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs.data ?? []).map((log) => (
                  <TableRow key={log.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(log.created_at)}</TableCell>
                    <TableCell>{log.actor?.full_name || log.actor?.email || <span className="text-muted-foreground">System / unknown</span>}</TableCell>
                    <TableCell>
                      <span className="font-medium">{describeAction(log.action)}</span>{" "}
                      <span className="text-muted-foreground">{ENTITY_LABELS[log.entity_type] ?? log.entity_type}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{log.action}</span>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {log.summary && <p className="text-sm">{log.summary}</p>}
                      {(log.before_data || log.after_data || (log.metadata && Object.keys(log.metadata as object).length > 0)) && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-xs text-primary">Show changes</summary>
                          <div className="mt-2 space-y-2">
                            <JsonBlock label="Before" value={log.before_data} />
                            <JsonBlock label="After" value={log.after_data} />
                            <JsonBlock label="Context" value={log.metadata} />
                            {log.entity_id && <p className="font-mono text-xs text-muted-foreground">Record: {log.entity_id}</p>}
                          </div>
                        </details>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} pageSize={PAGE_SIZE} total={logs.count ?? 0} />
          </>
        )}
      </section>
    </>
  );
}

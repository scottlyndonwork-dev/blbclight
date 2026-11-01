import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusChangeLauncher } from "@/features/members/components/status-change-launcher";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DateRangeFilter, FilterSelect, Pager } from "@/components/shared/url-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, RANGE_PRESETS, resolveDateRange } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { getMemberLookups } from "@/server/queries/members";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Membership status" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE_SIZE = 25;

export default function MembershipStatusPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <MembershipStatus searchParams={searchParams} />
    </Suspense>
  );
}

async function MembershipStatus({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([getUserWithAccess(["members.read"]), searchParams]);
  if (!allowed) return <AccessDenied />;

  const range = resolveDateRange(params, "last_90_days");
  const statusKey = typeof params.status === "string" ? params.status : undefined;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const supabase = await createClient();
  const lookups = await getMemberLookups();
  const statusId = lookups.statuses.find((s) => s.key === statusKey)?.id;

  let historyQuery = supabase
    .from("membership_status_history")
    .select(
      "id, effective_date, reason, created_at, members(id, member_no, first_name, last_name), status:membership_statuses!membership_status_history_status_id_fkey(name, color), previous:membership_statuses!membership_status_history_previous_status_id_fkey(name), changed_by_profile:profiles(full_name)",
      { count: "exact" },
    )
    .gte("effective_date", range.from)
    .lte("effective_date", range.to)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (statusId) historyQuery = historyQuery.eq("status_id", statusId);

  const [history, stats] = await Promise.all([historyQuery, supabase.rpc("get_membership_stats", { p_from: range.from, p_to: range.to })]);
  const byStatus = (stats.data as { by_status?: Array<{ key: string; name: string; color: string; count: number }> } | null)?.by_status ?? [];

  return (
    <>
      <PageHeader
        title="Membership Status"
        description="Current membership by status and the history of every status change."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Membership Status" }]}
        actions={user.permissions.has("membership.status_change") ? <StatusChangeLauncher statuses={lookups.statuses.filter((s) => s.is_active)} /> : undefined}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {byStatus.map((s) => (
          <Link key={s.key} href={`/members?status=${s.key}`} className="rounded-lg border bg-card p-3 transition-colors hover:border-primary/40">
            <StatusBadge tone={s.color}>{s.name}</StatusBadge>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{s.count.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">current members</p>
          </Link>
        ))}
      </div>

      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-sm font-semibold">Status changes</h2>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              param="status"
              placeholder="New status"
              allLabel="All statuses"
              options={lookups.statuses.map((s) => ({ value: s.key, label: s.name }))}
            />
            <DateRangeFilter from={range.from} to={range.to} presets={Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }))} />
          </div>
        </div>
        {history.error ? (
          <div className="p-4">
            <ErrorState />
          </div>
        ) : (history.data ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="No status changes in this period" className="border-0" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden md:table-cell">From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="hidden lg:table-cell">Recorded by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history.data ?? []).map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatDate(h.effective_date)}</TableCell>
                    <TableCell>
                      <Link href={`/members/${h.members?.id}`} className="font-medium hover:underline">
                        {h.members?.last_name}, {h.members?.first_name}
                      </Link>
                      <span className="block font-mono text-xs text-muted-foreground">{h.members?.member_no}</span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{h.previous?.name ?? "New registration"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={h.status?.color}>{h.status?.name}</StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{h.reason}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {h.changed_by_profile?.full_name ?? "System"}
                      <span className="block text-xs">{formatDateTime(h.created_at)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} pageSize={PAGE_SIZE} total={history.count ?? 0} />
          </>
        )}
      </section>
    </>
  );
}

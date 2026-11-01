import { BarChart3, CalendarCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SessionDialog } from "@/features/attendance/components/session-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DateRangeFilter, FilterSelect, Pager } from "@/components/shared/url-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatTime, RANGE_PRESETS, resolveDateRange } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { getServiceTypes, listSessions, SESSIONS_PAGE_SIZE } from "@/server/queries/attendance";

export const metadata: Metadata = { title: "Attendance" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <AttendanceSessions searchParams={searchParams} />
    </Suspense>
  );
}

async function AttendanceSessions({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([getUserWithAccess(["attendance.read", "attendance.write"]), searchParams]);
  if (!allowed) return <AccessDenied />;

  const range = resolveDateRange(params, "last_90_days");
  const serviceTypes = await getServiceTypes();
  const typeParam = typeof params.type === "string" ? params.type : undefined;
  const serviceTypeId = serviceTypes.find((t) => t.id === typeParam)?.id;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const { rows, total, error } = await listSessions({ range, serviceTypeId, page });
  const canWrite = user.permissions.has("attendance.write");
  const activeTypes = serviceTypes.filter((t) => t.is_active);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Create sessions for services and activities and record who attended."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Attendance" }]}
        actions={
          <>
            {user.permissions.has("reports.attendance") && (
              <Button variant="outline" asChild>
                <Link href="/reports/attendance">
                  <BarChart3 /> Attendance reports
                </Link>
              </Button>
            )}
            {canWrite && activeTypes.length > 0 && <SessionDialog serviceTypes={activeTypes} />}
          </>
        }
      />

      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
          <FilterSelect param="type" placeholder="Service" allLabel="All services" options={serviceTypes.map((t) => ({ value: t.id, label: t.name }))} className="sm:w-56" />
          <DateRangeFilter from={range.from} to={range.to} presets={Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }))} />
        </div>
        {error ? (
          <div className="p-4">
            <ErrorState />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarCheck}
              title="No attendance sessions in this period"
              description={canWrite ? "Create a session to start recording attendance." : undefined}
              action={canWrite && activeTypes.length > 0 ? <SessionDialog serviceTypes={activeTypes} /> : undefined}
              className="border-0"
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Attended</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Excused</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Absent</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Visitors</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/attendance/${s.id}`} className="font-medium hover:text-primary hover:underline">
                        {formatDate(s.session_date, "EEE, MMM d, yyyy")}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{formatTime(s.start_time)}</span>
                    </TableCell>
                    <TableCell>
                      {s.title || s.service_type_name}
                      {s.title && <span className="block text-xs text-muted-foreground">{s.service_type_name}</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {(s.present_count ?? 0) + (s.late_count ?? 0)}
                      {(s.late_count ?? 0) > 0 && <span className="block text-xs font-normal text-muted-foreground">{s.late_count} late</span>}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{s.excused_count}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{s.absent_count}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{s.visitor_count}</TableCell>
                    <TableCell>
                      <StatusBadge tone={s.status === "open" ? "green" : "gray"}>{s.status === "open" ? "Open" : "Closed"}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} pageSize={SESSIONS_PAGE_SIZE} total={total} />
          </>
        )}
      </section>
    </>
  );
}

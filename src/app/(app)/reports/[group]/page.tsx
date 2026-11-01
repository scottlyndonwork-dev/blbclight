import { Download, FileText, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportMemberFilter } from "@/features/reports/member-filter";
import { AttendanceBarChart, IncomeExpenseChart } from "@/components/charts/charts";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import { AccessDenied, EmptyState, ErrorState } from "@/components/shared/states";
import { DateRangeFilter, FilterSelect } from "@/components/shared/url-controls";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RANGE_PRESETS } from "@/lib/dates";
import { formatPeso, moneyToChartNumber } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getUserWithAccess } from "@/server/auth/session";
import { getServiceTypes } from "@/server/queries/attendance";
import { getFinanceLookups } from "@/server/queries/finance";
import { getMemberLookups } from "@/server/queries/members";
import { buildReport, canViewReport, isReportKey, parseReportParams, REPORTS, type ReportGroup, type ReportKey, type ReportTable } from "@/server/reports";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Report" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const GROUP_TITLES: Record<ReportGroup, string> = { membership: "Membership reports", attendance: "Attendance reports", certificates: "Certificate reports", finance: "Financial reports" };
const presets = Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }));

export default function ReportGroupPage({ params, searchParams }: { params: Promise<{ group: string }>; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <ReportView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportView({ params, searchParams }: { params: Promise<{ group: string }>; searchParams: SearchParams }) {
  const [{ group }, query, { user, allowed }] = await Promise.all([
    params,
    searchParams,
    getUserWithAccess(["reports.membership", "reports.attendance", "reports.certificates", "reports.finance"]),
  ]);
  if (!(group in GROUP_TITLES)) notFound();
  if (!allowed) return <AccessDenied />;
  const g = group as ReportGroup;

  const available = (Object.keys(REPORTS) as ReportKey[]).filter((k) => REPORTS[k].group === g && canViewReport(k, user.permissions));
  if (available.length === 0) return <AccessDenied message="Your role does not include these reports." />;
  const requested = typeof query.report === "string" && isReportKey(query.report) ? query.report : undefined;
  const key = requested && available.includes(requested) ? requested : available[0];
  const p = parseReportParams(query, key);

  let table: ReportTable | null = null;
  let failed = false;
  try {
    table = await buildReport(key, p);
  } catch {
    failed = true;
  }

  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (typeof v === "string" && k !== "report") exportParams.set(k, v);
  if (!exportParams.has("from") && !exportParams.has("range")) {
    exportParams.set("from", p.range.from);
    exportParams.set("to", p.range.to);
  }

  return (
    <>
      <PageHeader
        title={GROUP_TITLES[g]}
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: GROUP_TITLES[g] }]}
        actions={
          table && (
            <>
              <PrintButton
                trigger={
                  <Button variant="outline">
                    <Printer /> Print
                  </Button>
                }
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Download /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/reports/${key}?format=pdf&${exportParams}`}>
                      <FileText /> PDF
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/reports/${key}?format=xlsx&${exportParams}`}>Excel (.xlsx)</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/reports/${key}?format=csv&${exportParams}`}>CSV</a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <nav className="no-print mb-4 flex gap-1 overflow-x-auto border-b" aria-label="Reports">
        {available.map((k) => (
          <Link
            key={k}
            href={`/reports/${g}?report=${k}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              k === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {REPORTS[k].label}
          </Link>
        ))}
      </nav>

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Filters reportKey={key} memberId={p.memberId} />
        {REPORTS[key].usesRange && <DateRangeFilter from={p.range.from} to={p.range.to} presets={presets} />}
      </div>

      {failed || !table ? (
        <ErrorState title="The report could not be generated" />
      ) : (
        <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">{table.title}</h2>
            <p className="text-sm text-muted-foreground">{table.subtitle}</p>
          </div>
          {table.chart && table.chart.points.length > 0 && (
            <div className="border-b p-4">
              {table.chart.kind === "attendance" ? (
                <AttendanceBarChart
                  data={table.chart.points.map((pt) => ({ label: String(pt.label), attended: Number(pt.attended), sessions: Number(pt.sessions) }))}
                />
              ) : (
                <IncomeExpenseChart
                  data={table.chart.points.map((pt) => ({
                    label: String(pt.label),
                    income: moneyToChartNumber(String(pt.income)),
                    expense: moneyToChartNumber(String(pt.expense)),
                    incomeText: String(pt.income),
                    expenseText: String(pt.expense),
                  }))}
                />
              )}
            </div>
          )}
          {table.rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No records for the selected filters" className="border-0" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map((c) => (
                    <TableHead key={c.header} className={c.align === "right" ? "text-right" : ""}>
                      {c.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row, r) => (
                  <TableRow key={r}>
                    {row.map((v, i) => (
                      <TableCell key={i} className={cn(table.columns[i]?.align === "right" && "text-right tabular-nums", "whitespace-normal")}>
                        {table.columns[i]?.money ? formatPeso(v) : v}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {table.totals && (
                <TableFooter>
                  <TableRow>
                    {table.totals.map((v, i) => (
                      <TableCell key={i} className={cn("font-semibold", table.columns[i]?.align === "right" && "text-right tabular-nums")}>
                        {v && table.columns[i]?.money ? formatPeso(v) : v}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </section>
      )}
    </>
  );
}

async function Filters({ reportKey, memberId }: { reportKey: ReportKey; memberId?: string }) {
  if (reportKey === "membership-directory" || reportKey === "membership-baptism") {
    const { statuses } = await getMemberLookups();
    return (
      <>
        <FilterSelect param="status" placeholder="Status" allLabel="All statuses" options={statuses.map((s) => ({ value: s.key, label: s.name }))} />
        {reportKey === "membership-baptism" && (
          <FilterSelect param="baptized" placeholder="Baptism" allLabel="Baptized and not baptized" options={[{ value: "yes", label: "Baptized" }, { value: "no", label: "Not baptized" }]} />
        )}
      </>
    );
  }
  if (reportKey === "attendance-summary") {
    const types = await getServiceTypes();
    return (
      <>
        <FilterSelect param="group" placeholder="Group by" allLabel="Weekly" options={[{ value: "day", label: "Daily" }, { value: "month", label: "Monthly" }, { value: "year", label: "Annual" }]} />
        <FilterSelect param="service" placeholder="Service" allLabel="All services" options={types.map((t) => ({ value: t.id, label: t.name }))} className="sm:w-56" />
      </>
    );
  }
  if (reportKey === "attendance-member") {
    let initial = null;
    if (memberId) {
      const supabase = await createClient();
      const { data } = await supabase.from("members").select("id, member_no, first_name, last_name").eq("id", memberId).maybeSingle();
      if (data) initial = { id: data.id, member_no: data.member_no, full_name: `${data.first_name} ${data.last_name}`, status_name: "" };
    }
    return <ReportMemberFilter initial={initial} />;
  }
  if (reportKey === "certificates-issued") {
    const supabase = await createClient();
    const { data } = await supabase.from("certificate_types").select("id, name").order("sort_order");
    return <FilterSelect param="type" placeholder="Type" allLabel="All types" options={(data ?? []).map((t) => ({ value: t.id, label: t.name }))} />;
  }
  if (reportKey === "finance-income" || reportKey === "finance-expense" || reportKey === "finance-monthly") {
    const { funds } = await getFinanceLookups();
    return <FilterSelect param="fund" placeholder="Fund" allLabel="All funds" options={funds.map((f) => ({ value: f.id, label: f.name }))} />;
  }
  return null;
}

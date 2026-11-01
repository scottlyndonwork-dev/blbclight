import { format, parseISO } from "date-fns";
import {
  ArrowLeftRight,
  Award,
  BarChart3,
  CalendarCheck,
  CalendarRange,
  CircleCheck,
  CirclePause,
  Droplets,
  Gift,
  HandCoins,
  Receipt,
  Scale,
  ScrollText,
  Search,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AttendanceBarChart, IncomeExpenseChart } from "@/components/charts/charts";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DateRangeFilter, PeriodButtons } from "@/components/shared/url-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Figure, MemberStat, Panel, QuickActions, RateRing, WelcomeBanner, type QuickAction } from "@/features/dashboard/components";
import { formatDate, formatTime, RANGE_PRESETS, resolveDateRange } from "@/lib/dates";
import { formatPeso, moneyToChartNumber, sumMoney } from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { getDashboardData, type MembershipStats } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const presetOptions = Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }));
const periodOptions = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
];

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const range = resolveDateRange(params, "this_month");
  const data = await getDashboardData(range, user.permissions);
  const firstName = user.fullName.split(" ")[0];
  const nothingVisible = !data.membership && !data.attendance && !data.certificates && !data.finance;
  const can = (p: Permission) => user.permissions.has(p);

  const quickActions = [
    can("attendance.write") && { href: "/attendance", label: "Record attendance", description: "Open or start a service", icon: CalendarCheck },
    can("members.write") && { href: "/members/new", label: "Register a member", description: "Add a new member record", icon: UserPlus },
    can("finance.write") && { href: "/finance/transactions/new", label: "Record an offering", description: "Tithes, offerings and other income", icon: HandCoins },
    can("certificates.issue") && { href: "/certificates/issue", label: "Issue a certificate", description: "Baptism, membership and more", icon: Award },
    can("members.read") && { href: "/members", label: "Find a member", description: "Search by name or member ID", icon: Search },
  ]
    .filter((a): a is QuickAction => Boolean(a))
    .slice(0, 4);

  const financeHasData = Boolean(data.monthly?.some((m) => m.income !== "0.00" || m.expense !== "0.00"));

  return (
    <div className="space-y-6">
      <WelcomeBanner
        title={`Welcome, ${firstName}!`}
        subtitle={`Church overview for ${range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} – ${formatDate(range.to)}`}`}
        controls={
          <>
            <PeriodButtons options={periodOptions} active={range.preset} />
            <details className="text-sm 2xl:text-right">
              <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full px-3 font-medium text-primary hover:bg-primary/5">
                <CalendarRange className="size-4" /> Choose other dates
              </summary>
              <div className="mt-2 rounded-xl border bg-card p-3 text-left shadow-sm">
                <DateRangeFilter from={range.from} to={range.to} presets={presetOptions} />
              </div>
            </details>
          </>
        }
      />

      {data.failed && (
        <ErrorState title="Some dashboard figures could not be loaded" description="The figures shown are accurate; missing sections will appear when you refresh." />
      )}

      <QuickActions actions={quickActions} />

      {nothingVisible && (
        <EmptyState
          title="No dashboard sections are available for your role"
          description="Your account does not include access to membership, attendance, certificate or financial statistics."
        />
      )}

      {data.membership && <MembershipRow stats={data.membership} previousNew={data.previousNewMembers} />}

      {(data.attendance || data.finance) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.attendance && (
            <Panel
              variant="navy"
              icon={CalendarCheck}
              title="Attendance"
              description={`${data.attendance.session_count.toLocaleString()} ${data.attendance.session_count === 1 ? "service" : "services"} in this period`}
              href="/attendance"
            >
              <div className="mb-5 grid gap-5 sm:grid-cols-[1fr_1fr_auto]">
                <Figure
                  icon={Users}
                  label="Latest service"
                  value={data.attendance.latest?.attended.toLocaleString() ?? "—"}
                  note={
                    data.attendance.latest
                      ? `${data.attendance.latest.service_name}, ${formatDate(data.attendance.latest.session_date, "MMM d")}`
                      : "No services yet"
                  }
                />
                <Figure icon={BarChart3} label="Average" value={data.attendance.average_attendance.toLocaleString()} note="people per service" />
                <RateRing percent={data.attendance.average_percentage} label="Attendance rate" />
              </div>
              {data.attendance.weekly.length > 0 ? (
                <AttendanceBarChart
                  data={data.attendance.weekly.map((w) => ({
                    label: format(parseISO(w.week), "MMM d"),
                    attended: w.attended,
                    sessions: w.sessions,
                  }))}
                />
              ) : (
                <EmptyState
                  icon={CalendarCheck}
                  title="No attendance recorded in this period"
                  description="Attendance will appear here once a service is recorded."
                  className="py-8"
                  action={
                    can("attendance.write") ? (
                      <Button asChild size="lg">
                        <Link href="/attendance">Record attendance</Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </Panel>
          )}

          {data.finance && (
            <Panel
              variant="yellow"
              icon={Wallet}
              title="Finance"
              description="Posted transactions in this period"
              href={can("finance.read") ? "/finance" : "/reports/finance"}
            >
              <div className="mb-5 grid gap-5 sm:grid-cols-3">
                <Figure icon={TrendingUp} label="Income" value={formatPeso(data.finance.income)} />
                <Figure icon={TrendingDown} label="Expenses" value={formatPeso(data.finance.expense)} />
                <Figure
                  label="Net"
                  value={formatPeso(data.finance.net)}
                  valueClassName={data.finance.net.startsWith("-") ? "text-destructive" : "text-success"}
                  note={data.finance.net.startsWith("-") ? "More spent than received" : "Received minus spent"}
                />
              </div>
              {financeHasData && data.monthly ? (
                <IncomeExpenseChart
                  data={data.monthly.map((m) => ({
                    label: format(parseISO(m.month), "MMM yyyy"),
                    income: moneyToChartNumber(m.income),
                    expense: moneyToChartNumber(m.expense),
                    incomeText: m.income,
                    expenseText: m.expense,
                  }))}
                />
              ) : (
                <EmptyState
                  icon={Wallet}
                  title="No posted transactions in this period"
                  description="Income and expenses will appear here once they are posted."
                  className="py-8"
                  action={
                    can("finance.write") ? (
                      <Button asChild size="lg">
                        <Link href="/finance/transactions/new">Record an offering</Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
              <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <p className="flex items-center gap-2 text-base">
                  <HandCoins className="size-5 text-gold" /> Tithes
                  <span className="ml-auto font-semibold tabular-nums">{formatPeso(data.finance.tithes)}</span>
                </p>
                <p className="flex items-center gap-2 text-base">
                  <Gift className="size-5 text-gold" /> Offerings
                  <span className="ml-auto font-semibold tabular-nums">{formatPeso(data.finance.offerings)}</span>
                </p>
              </div>
            </Panel>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {data.funds && (
          <Panel icon={Scale} title="Fund balances" description={`Available as of ${formatDate(range.to)}`} href={can("finance.read") ? "/finance" : undefined}>
            <ul className="divide-y">
              {data.funds
                .filter((f) => f.is_active)
                .map((f) => (
                  <li key={f.fund_id} className="flex items-center justify-between gap-3 py-3 text-base">
                    <span>{f.name}</span>
                    <span className={`font-semibold tabular-nums ${f.available_balance.startsWith("-") ? "text-destructive" : ""}`}>
                      {formatPeso(f.available_balance)}
                    </span>
                  </li>
                ))}
              <li className="flex items-center justify-between pt-3 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatPeso(sumMoney(data.funds.map((f) => f.available_balance)))}</span>
              </li>
            </ul>
          </Panel>
        )}

        {data.certificates && (
          <Panel
            icon={Award}
            title="Certificates"
            description={`${data.certificates.issued_in_period} issued in this period · ${data.certificates.total_all_time} valid in total`}
            href="/certificates"
          >
            <ul className="divide-y">
              {data.certificates.by_type.map((t) => (
                <li key={t.code} className="flex items-center justify-between py-3 text-base">
                  <span>{t.name}</span>
                  <span className="font-semibold tabular-nums">{t.count}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {data.recentMembers && (
          <Panel icon={UserPlus} title="Recent registrations" description="Newest members" href="/members" bodyClassName="p-0">
            {data.recentMembers.length === 0 ? (
              <p className="p-5 text-base text-muted-foreground">No members registered yet.</p>
            ) : (
              <ul className="divide-y">
                {data.recentMembers.map((m) => (
                  <li key={m.id}>
                    <Link href={`/members/${m.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/60">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold">{m.full_name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {m.member_no} · {formatDate(m.date_registered)}
                        </span>
                      </span>
                      <StatusBadge tone={m.status_color}>{m.status_name}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {data.recentSessions && (
          <Panel icon={CalendarCheck} title="Recent services" description="Latest attendance records" href="/attendance" bodyClassName="p-0">
            {data.recentSessions.length === 0 ? (
              <p className="p-5 text-base text-muted-foreground">No services recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {data.recentSessions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/attendance/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/60">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold">{s.title || s.service_type_name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {formatDate(s.session_date)} · {formatTime(s.start_time)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm text-muted-foreground">
                        <span className="block text-lg font-bold tabular-nums text-foreground">{(s.present_count ?? 0) + (s.late_count ?? 0)}</span>
                        attended{s.visitor_count ? ` · ${s.visitor_count} visitors` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {data.recentCertificates && (
          <Panel icon={ScrollText} title="Recently issued certificates" href="/certificates" bodyClassName="p-0">
            {data.recentCertificates.length === 0 ? (
              <p className="p-5 text-base text-muted-foreground">No certificates issued yet.</p>
            ) : (
              <ul className="divide-y">
                {data.recentCertificates.map((c) => (
                  <li key={c.id}>
                    <Link href={`/certificates/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/60">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold">{c.recipient_name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {c.reference_no} · {c.certificate_types?.name}
                        </span>
                      </span>
                      <StatusBadge tone={c.status === "issued" ? "green" : "red"}>
                        {c.status === "issued" ? "Issued" : c.status === "voided" ? "Voided" : "Replaced"}
                      </StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {data.recentTransactions && (
          <Panel icon={Receipt} title="Recent transactions" href="/finance" bodyClassName="p-0">
            {data.recentTransactions.length === 0 ? (
              <p className="p-5 text-base text-muted-foreground">No posted transactions yet.</p>
            ) : (
              <ul className="divide-y">
                {data.recentTransactions.map((t) => {
                  const negative = (t.kind === "expense") !== Boolean(t.reverses_transaction_id);
                  return (
                    <li key={t.id}>
                      <Link href={`/finance/transactions/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/60">
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold">{t.description}</span>
                          <span className="block text-sm text-muted-foreground">
                            {t.txn_no} · {formatDate(t.txn_date)}
                          </span>
                        </span>
                        <span className={`shrink-0 text-base font-semibold tabular-nums ${negative ? "text-destructive" : "text-success"}`}>
                          {negative ? "−" : "+"}
                          {formatPeso(t.amount)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

function MembershipRow({ stats, previousNew }: { stats: MembershipStats; previousNew: number | null }) {
  const share = (n: number) => (stats.total === 0 ? "No members yet" : `${Math.round((n / stats.total) * 100)}% of members`);
  const change = previousNew === null ? null : stats.new_members - previousNew;
  const newNote =
    change === null ? "In this period" : change === 0 ? "Same as previous period" : `${change > 0 ? "+" : "−"}${Math.abs(change)} vs previous period`;
  return (
    <section aria-label="Membership">
      <h2 className="mb-3 text-xl font-bold">Membership</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MemberStat label="Registered members" value={stats.total} note="All current members" icon={Users} tone="blue" />
        <MemberStat label="Active" value={stats.active} note={share(stats.active)} icon={CircleCheck} tone="green" />
        <MemberStat label="Inactive" value={stats.inactive} note={share(stats.inactive)} icon={CirclePause} tone="slate" />
        <MemberStat label="New in period" value={stats.new_members} note={newNote} icon={UserPlus} tone="yellow" />
        <MemberStat label="Baptized" value={stats.baptized} note={share(stats.baptized)} icon={Droplets} tone="sky" />
        <MemberStat label="Transferred" value={stats.transferred} note={share(stats.transferred)} icon={ArrowLeftRight} tone="navy" />
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-56 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}

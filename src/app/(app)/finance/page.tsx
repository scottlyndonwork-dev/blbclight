import { Info, Minus, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BalancesTable } from "@/features/finance/components/balances-table";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { AccessDenied, ErrorState } from "@/components/shared/states";
import { DateRangeFilter } from "@/components/shared/url-controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, RANGE_PRESETS, resolveDateRange } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { getUserWithAccess } from "@/server/auth/session";
import { getFundBalances } from "@/server/queries/finance";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Finance" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <FinanceOverview searchParams={searchParams} />
    </Suspense>
  );
}

async function FinanceOverview({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([getUserWithAccess(["finance.read", "finance.write"]), searchParams]);
  if (!allowed) return <AccessDenied />;
  const range = resolveDateRange(params, "this_month");
  const canRead = user.permissions.has("finance.read");
  const canWrite = user.permissions.has("finance.write");

  const supabase = await createClient();
  const [stats, balances, categories] = canRead
    ? await Promise.all([
        supabase.rpc("get_finance_stats", { p_from: range.from, p_to: range.to }),
        getFundBalances(range.to),
        supabase.rpc("get_finance_category_summary", { p_from: range.from, p_to: range.to }),
      ])
    : [null, null, null];
  const s = stats?.data as { income: string; expense: string; net: string } | null | undefined;

  return (
    <>
      <PageHeader
        title="Finance"
        description={`Church financial records for ${formatDate(range.from)} – ${formatDate(range.to)}`}
        actions={
          <>
            <DateRangeFilter from={range.from} to={range.to} presets={Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }))} />
            {canWrite && (
              <>
                <Button variant="outline" asChild>
                  <Link href="/finance/transactions/new?kind=expense">
                    <Minus /> Record expense
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/finance/transactions/new?kind=income">
                    <Plus /> Record income
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <Alert className="mb-5">
        <Info />
        <AlertDescription>
          LIGHT keeps a record of cash received and disbursed per fund. It is not a full double-entry accounting system; use it alongside your church&apos;s
          official books and audit process.
        </AlertDescription>
      </Alert>

      {!canRead ? (
        <p className="text-sm text-muted-foreground">Your role can record transactions. Balances and reports are visible to users with finance viewing permission.</p>
      ) : stats?.error || balances?.error ? (
        <ErrorState />
      ) : (
        <div className="space-y-5">
          <StatGrid className="xl:grid-cols-3">
            <StatCard label="Cash received" value={formatPeso(s?.income)} icon={TrendingUp} hint="Posted income in period" />
            <StatCard label="Cash disbursed" value={formatPeso(s?.expense)} icon={TrendingDown} hint="Posted expenses in period" />
            <StatCard label="Net" value={formatPeso(s?.net)} icon={Wallet} tone={s?.net?.startsWith("-") ? "negative" : "positive"} hint="Received minus disbursed" />
          </StatGrid>

          <SectionCard title="Fund balances" description={`As of ${formatDate(range.to)}. Allocations move money between funds and do not change the total.`} href="/finance/funds" hrefLabel="Manage funds" bodyClassName="p-0">
            <BalancesTable rows={balances?.rows ?? []} />
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            {(["income", "expense"] as const).map((kind) => {
              const rows = (categories?.data ?? []).filter((c) => c.kind === kind && c.entry_count > 0);
              return (
                <SectionCard key={kind} title={kind === "income" ? "Income by category" : "Expenses by category"} href={`/finance/transactions?kind=${kind}&from=${range.from}&to=${range.to}`}>
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No posted {kind === "income" ? "income" : "expenses"} in this period.</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {rows.map((c) => (
                        <li key={c.category_id} className="flex justify-between py-2">
                          <span>
                            {c.category_name} <span className="text-xs text-muted-foreground">({c.entry_count})</span>
                          </span>
                          <span className="font-medium tabular-nums">{formatPeso(c.total)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

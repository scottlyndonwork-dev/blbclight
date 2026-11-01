import { Download, Minus, Plus, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DateRangeFilter, FilterSelect, Pager, SearchInput } from "@/components/shared/url-controls";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, RANGE_PRESETS, resolveDateRange } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { getUserWithAccess } from "@/server/auth/session";
import { getFinanceLookups, listTransactions, parseTransactionFilters, TRANSACTIONS_PAGE_SIZE } from "@/server/queries/finance";

export const metadata: Metadata = { title: "Transactions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const STATUS = { draft: ["amber", "Draft"], posted: ["green", "Posted"], reversed: ["slate", "Reversed"] } as const;

export default function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}

async function Transactions({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([getUserWithAccess(["finance.read"]), searchParams]);
  if (!allowed) return <AccessDenied message="Viewing transactions requires finance viewing permission." />;
  const range = resolveDateRange(params, "this_month");
  const filters = parseTransactionFilters(params);
  const [{ rows, total, error }, lookups] = await Promise.all([listTransactions(range, filters), getFinanceLookups()]);
  const canWrite = user.permissions.has("finance.write");

  const exportQuery = new URLSearchParams({ from: range.from, to: range.to });
  for (const key of ["kind", "status", "fund", "category", "q"] as const) {
    const v = params[key];
    if (typeof v === "string" && v) exportQuery.set(key, v);
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        description="All recorded income and expenses. Posted entries are permanent; mistakes are corrected by reversal."
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/exports/transactions?format=xlsx&${exportQuery}`}>Excel (.xlsx)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/exports/transactions?format=csv&${exportQuery}`}>CSV</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canWrite && (
              <>
                <Button variant="outline" asChild>
                  <Link href="/finance/transactions/new?kind=expense">
                    <Minus /> Expense
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/finance/transactions/new?kind=income">
                    <Plus /> Income
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput placeholder="Search description, number, payer" />
          <FilterSelect param="kind" placeholder="Type" allLabel="Income and expenses" options={[{ value: "income", label: "Income" }, { value: "expense", label: "Expenses" }]} />
          <FilterSelect param="status" placeholder="Status" allLabel="All statuses" options={Object.entries(STATUS).map(([value, [, label]]) => ({ value, label }))} />
          <FilterSelect param="fund" placeholder="Fund" allLabel="All funds" options={lookups.funds.map((f) => ({ value: f.id, label: f.name }))} />
          <FilterSelect
            param="category"
            placeholder="Category"
            allLabel="All categories"
            options={lookups.categories
              .filter((c) => !filters.kind || c.kind === filters.kind)
              .map((c) => ({ value: c.id, label: `${c.name}${filters.kind ? "" : c.kind === "income" ? " (income)" : " (expense)"}` }))}
          />
          <DateRangeFilter from={range.from} to={range.to} presets={Object.entries(RANGE_PRESETS).map(([value, label]) => ({ value, label }))} />
        </div>
        {error ? (
          <div className="p-4">
            <ErrorState />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Receipt} title="No transactions found" description="Change the filters or record a new transaction." className="border-0" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Fund</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const outflow = (t.kind === "expense") !== Boolean(t.reverses_transaction_id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(t.txn_date)}</TableCell>
                      <TableCell>
                        <Link href={`/finance/transactions/${t.id}`} className="font-mono text-xs font-medium hover:text-primary hover:underline">
                          {t.txn_no ?? "Draft"}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <Link href={`/finance/transactions/${t.id}`} className="line-clamp-1 hover:underline">
                          {t.description}
                        </Link>
                        {t.payer_payee && <span className="block truncate text-xs text-muted-foreground">{t.payer_payee}</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{t.financial_categories?.name}</TableCell>
                      <TableCell className="hidden lg:table-cell">{t.funds?.name}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right font-medium tabular-nums ${outflow ? "text-destructive" : "text-success"}`}>
                        {outflow ? "−" : "+"}
                        {formatPeso(t.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS[t.status][0]}>{t.reverses_transaction_id ? "Reversal" : STATUS[t.status][1]}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pager page={filters.page} pageSize={TRANSACTIONS_PAGE_SIZE} total={total} />
          </>
        )}
      </section>
    </>
  );
}

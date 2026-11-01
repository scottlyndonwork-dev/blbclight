import type { Metadata } from "next";
import { Suspense } from "react";
import { BalancesTable } from "@/features/finance/components/balances-table";
import { FundDialog, ReverseTransferButton, TransferDialog } from "@/features/finance/components/fund-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { AccessDenied, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { getUserWithAccess } from "@/server/auth/session";
import { getFinanceLookups, getFundBalances, listTransfers } from "@/server/queries/finance";

export const metadata: Metadata = { title: "Funds" };

export default function FundsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <Funds />
    </Suspense>
  );
}

async function Funds() {
  const { user, allowed } = await getUserWithAccess(["finance.read"]);
  if (!allowed) return <AccessDenied />;
  const canManage = user.permissions.has("finance.manage_funds");
  const [balances, transfers, { funds }] = await Promise.all([getFundBalances(), listTransfers(), getFinanceLookups()]);
  const reversed = new Set(transfers.map((t) => t.reverses_transfer_id).filter(Boolean));

  return (
    <>
      <PageHeader
        title="Funds and allocations"
        description="Current balance of each fund, and allocations moved between funds."
        actions={
          canManage ? (
            <>
              <FundDialog />
              <TransferDialog funds={funds.filter((f) => f.is_active)} />
            </>
          ) : undefined
        }
      />
      <div className="space-y-5">
        <SectionCard title="Current balances" description="Includes all posted transactions to date." bodyClassName="p-0">
          {balances.error ? <ErrorState /> : <BalancesTable rows={balances.rows} />}
        </SectionCard>

        {canManage && (
          <SectionCard title="Funds" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="text-right">Opening balance</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {funds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <span className="font-medium">{f.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {f.code}
                        {!f.is_active ? " · inactive" : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-sm whitespace-normal text-muted-foreground md:table-cell">{f.description || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(f.opening_balance)}
                      {f.opening_balance_date && <span className="block text-xs text-muted-foreground">as of {formatDate(f.opening_balance_date)}</span>}
                    </TableCell>
                    <TableCell>
                      <FundDialog
                        fund={{
                          id: f.id,
                          code: f.code,
                          name: f.name,
                          description: f.description,
                          is_restricted: f.is_restricted,
                          opening_balance: f.opening_balance,
                          opening_balance_date: f.opening_balance_date ?? "",
                          is_active: f.is_active,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        )}

        <SectionCard title="Allocation history" description="Most recent 50 allocations" bodyClassName="p-0">
          {transfers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No allocations recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead className="hidden md:table-cell">Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canManage && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id} className={reversed.has(t.id) ? "text-muted-foreground line-through decoration-muted-foreground/50" : ""}>
                    <TableCell>{formatDate(t.transfer_date)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.transfer_no}</TableCell>
                    <TableCell>
                      {t.from_fund?.name} → {t.to_fund?.name}
                    </TableCell>
                    <TableCell className="hidden max-w-sm whitespace-normal md:table-cell">{t.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPeso(t.amount)}</TableCell>
                    {canManage && (
                      <TableCell>{!t.reverses_transfer_id && !reversed.has(t.id) && <ReverseTransferButton id={t.id} label={t.transfer_no} />}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
    </>
  );
}

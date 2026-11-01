import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Attachments, DeleteDraftButton, PostButton, ReverseDialog } from "@/features/finance/components/transaction-controls";
import { PAYMENT_METHODS } from "@/features/finance/schemas";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { getUserWithAccess } from "@/server/auth/session";
import { getTransaction } from "@/server/queries/finance";

export const metadata: Metadata = { title: "Transaction" };

export default function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <Transaction params={params} />
    </Suspense>
  );
}

async function Transaction({ params }: { params: Promise<{ id: string }> }) {
  const [{ user, allowed }, { id }] = await Promise.all([getUserWithAccess(["finance.read"]), params]);
  if (!allowed) return <AccessDenied />;
  const txn = await getTransaction(id);
  if (!txn) notFound();

  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const isReversal = Boolean(txn.reverses_transaction_id);
  const outflow = (txn.kind === "expense") !== isReversal;
  const kindLabel = txn.kind === "income" ? "Income" : "Expense";
  const summary = `${kindLabel} of ${formatPeso(txn.amount)} on ${formatDate(txn.txn_date)}`;
  const statusTone = txn.status === "draft" ? "amber" : txn.status === "posted" ? "green" : "slate";
  const statusLabel = isReversal ? "Reversal entry" : txn.status === "draft" ? "Draft" : txn.status === "posted" ? "Posted" : "Reversed";

  return (
    <>
      <PageHeader
        title={txn.txn_no ?? "Draft transaction"}
        description={txn.description}
        breadcrumbs={[{ label: "Transactions", href: "/finance/transactions" }, { label: txn.txn_no ?? "Draft" }]}
        actions={
          <>
            {txn.status === "draft" && can("finance.write") && (
              <>
                <DeleteDraftButton id={txn.id} />
                <Button variant="outline" asChild>
                  <Link href={`/finance/transactions/${txn.id}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              </>
            )}
            {txn.status === "draft" && can("finance.post") && <PostButton id={txn.id} summary={summary} />}
            {txn.status === "posted" && !isReversal && can("finance.reverse") && <ReverseDialog id={txn.id} txnDate={txn.txn_date} summary={summary} />}
          </>
        }
      />

      {txn.status === "draft" && (
        <Alert className="mb-4 border-warning/40 bg-warning/5">
          <AlertDescription>This is a draft. It is not included in balances or reports until it is posted.</AlertDescription>
        </Alert>
      )}
      {txn.status === "reversed" && txn.reversal && (
        <Alert className="mb-4">
          <AlertDescription>
            Reversed by{" "}
            <Link href={`/finance/transactions/${txn.reversal.id}`} className="font-mono font-medium text-primary hover:underline">
              {txn.reversal.txn_no}
            </Link>{" "}
            on {formatDate(txn.reversal.txn_date)}. Reason: {txn.reversal_reason}
          </AlertDescription>
        </Alert>
      )}
      {isReversal && txn.original && (
        <Alert className="mb-4">
          <AlertDescription>
            This entry reverses{" "}
            <Link href={`/finance/transactions/${txn.original.id}`} className="font-mono font-medium text-primary hover:underline">
              {txn.original.txn_no}
            </Link>
            . Reason: {txn.reversal_reason}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-baseline justify-between gap-2 border-b pb-4">
            <div>
              <p className="text-xs text-muted-foreground">{isReversal ? `Reversal of ${kindLabel.toLowerCase()}` : kindLabel}</p>
              <p className={`text-3xl font-semibold tabular-nums ${outflow ? "text-destructive" : "text-success"}`}>
                {outflow ? "−" : "+"}
                {formatPeso(txn.amount)}
              </p>
            </div>
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Date">{formatDate(txn.txn_date, "MMMM d, yyyy")}</Item>
            <Item label="Category">{txn.financial_categories?.name}</Item>
            <Item label="Fund">{txn.funds?.name}</Item>
            <Item label="Payment method">{PAYMENT_METHODS.find((m) => m.value === txn.payment_method)?.label}</Item>
            <Item label="Receipt / reference no.">{txn.reference_no ?? "—"}</Item>
            <Item label={txn.kind === "income" ? "Received from" : "Paid to"}>{txn.payer_payee ?? "—"}</Item>
            {txn.members && (
              <Item label="Member">
                {can("members.read") ? (
                  <Link href={`/members/${txn.members.id}`} className="text-primary hover:underline">
                    {txn.members.first_name} {txn.members.last_name}
                  </Link>
                ) : (
                  `${txn.members.first_name} ${txn.members.last_name}`
                )}
                <span className="ml-1 font-mono text-xs text-muted-foreground">{txn.members.member_no}</span>
              </Item>
            )}
            <Item label="Description" className="sm:col-span-2">
              {txn.description}
            </Item>
          </dl>
        </section>
        <div className="space-y-4">
          <Attachments
            transactionId={txn.id}
            attachments={txn.financial_attachments}
            canUpload={can("finance.write") && txn.status !== "reversed"}
            canDelete={can("finance.write") && txn.status === "draft"}
          />
          <section className="rounded-lg border bg-card p-4 text-xs text-muted-foreground">
            <p>
              Recorded {formatDateTime(txn.created_at)}
              {txn.created_by_profile?.full_name ? ` by ${txn.created_by_profile.full_name}` : ""}
            </p>
            {txn.posted_at && (
              <p>
                Posted {formatDateTime(txn.posted_at)}
                {txn.posted_by_profile?.full_name ? ` by ${txn.posted_by_profile.full_name}` : ""}
              </p>
            )}
            {txn.reversed_at && (
              <p>
                Reversed {formatDateTime(txn.reversed_at)}
                {txn.reversed_by_profile?.full_name ? ` by ${txn.reversed_by_profile.full_name}` : ""}
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Item({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

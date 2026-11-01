import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TransactionForm } from "@/features/finance/components/transaction-form";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserWithAccess } from "@/server/auth/session";
import { getFinanceLookups, getTransaction } from "@/server/queries/finance";

export const metadata: Metadata = { title: "Edit draft" };

export default function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <EditDraft params={params} />
    </Suspense>
  );
}

async function EditDraft({ params }: { params: Promise<{ id: string }> }) {
  const [{ user, allowed }, { id }] = await Promise.all([getUserWithAccess(["finance.write"]), params]);
  if (!allowed || !user.permissions.has("finance.read")) return <AccessDenied />;
  const [txn, { funds, categories }] = await Promise.all([getTransaction(id), getFinanceLookups()]);
  if (!txn) notFound();
  if (txn.status !== "draft") {
    return <EmptyState title="Posted transactions cannot be edited" description="Reverse the transaction and record a corrected one instead." />;
  }

  return (
    <>
      <PageHeader
        title="Edit draft"
        breadcrumbs={[{ label: "Transactions", href: "/finance/transactions" }, { label: "Draft", href: `/finance/transactions/${txn.id}` }, { label: "Edit" }]}
      />
      <TransactionForm
        kind={txn.kind}
        draftId={txn.id}
        funds={funds.filter((f) => f.is_active || f.id === txn.fund_id)}
        categories={categories.filter((c) => c.kind === txn.kind && (c.is_active || c.id === txn.category_id))}
        canPost={user.permissions.has("finance.post")}
        initial={{
          kind: txn.kind,
          fund_id: txn.fund_id,
          category_id: txn.category_id,
          amount: txn.amount,
          txn_date: txn.txn_date,
          description: txn.description,
          reference_no: txn.reference_no ?? "",
          payer_payee: txn.payer_payee ?? "",
          member_id: txn.member_id ?? "",
          payment_method: txn.payment_method,
        }}
        initialMember={
          txn.members ? { id: txn.members.id, member_no: txn.members.member_no, full_name: `${txn.members.first_name} ${txn.members.last_name}`, status_name: "" } : null
        }
      />
    </>
  );
}

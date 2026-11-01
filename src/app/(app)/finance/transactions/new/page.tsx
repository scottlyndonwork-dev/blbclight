import type { Metadata } from "next";
import { Suspense } from "react";
import { TransactionForm } from "@/features/finance/components/transaction-form";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserWithAccess } from "@/server/auth/session";
import { getFinanceLookups } from "@/server/queries/finance";

export const metadata: Metadata = { title: "Record transaction" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewTransactionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <NewTransaction searchParams={searchParams} />
    </Suspense>
  );
}

async function NewTransaction({ searchParams }: { searchParams: SearchParams }) {
  const [{ user, allowed }, params] = await Promise.all([getUserWithAccess(["finance.write"]), searchParams]);
  if (!allowed) return <AccessDenied />;
  const kind = params.kind === "expense" ? "expense" : "income";
  const { funds, categories } = await getFinanceLookups();

  return (
    <>
      <PageHeader
        title={kind === "income" ? "Record income" : "Record expense"}
        description="Amounts are in Philippine Pesos (PHP)."
        breadcrumbs={[{ label: "Transactions", href: "/finance/transactions" }, { label: kind === "income" ? "Record income" : "Record expense" }]}
      />
      <TransactionForm
        key={kind}
        kind={kind}
        funds={funds.filter((f) => f.is_active)}
        categories={categories.filter((c) => c.kind === kind && c.is_active)}
        canPost={user.permissions.has("finance.post")}
      />
    </>
  );
}

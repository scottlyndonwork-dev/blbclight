import "server-only";
import { cache } from "react";
import { parseDateOnly, type DateRange } from "@/lib/dates";
import { createClient } from "@/server/supabase/server";

export const TRANSACTIONS_PAGE_SIZE = 25;

export const getFinanceLookups = cache(async () => {
  const supabase = await createClient();
  const [funds, categories] = await Promise.all([
    supabase.from("funds").select("id, code, name, description, is_restricted, is_active, opening_balance::text, opening_balance_date, sort_order").order("sort_order").order("name"),
    supabase.from("financial_categories").select("id, kind, name, description, is_active, sort_order").order("kind").order("sort_order").order("name"),
  ]);
  return { funds: funds.data ?? [], categories: categories.data ?? [] };
});

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const UUID = /^[0-9a-f-]{36}$/i;

export type TransactionFilters = {
  kind?: "income" | "expense";
  status?: "draft" | "posted" | "reversed";
  fund?: string;
  category?: string;
  q?: string;
  page: number;
};

export function parseTransactionFilters(params: Record<string, Param>): TransactionFilters {
  const kind = first(params.kind);
  const status = first(params.status);
  const fund = first(params.fund);
  const category = first(params.category);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    kind: kind === "income" || kind === "expense" ? kind : undefined,
    status: status === "draft" || status === "posted" || status === "reversed" ? status : undefined,
    fund: fund && UUID.test(fund) ? fund : undefined,
    category: category && UUID.test(category) ? category : undefined,
    q: first(params.q)?.replace(/[%_,()\\]/g, "").slice(0, 60),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

const TXN_COLUMNS =
  "id, txn_no, kind, amount::text, txn_date, description, reference_no, payer_payee, status, payment_method, reverses_transaction_id, created_at, funds(name, code), financial_categories(name)";

function buildTransactionQuery(supabase: Awaited<ReturnType<typeof createClient>>, range: DateRange, f: Omit<TransactionFilters, "page">, count: boolean) {
  let q = supabase
    .from("financial_transactions")
    .select(TXN_COLUMNS, count ? { count: "exact" } : undefined)
    .gte("txn_date", range.from)
    .lte("txn_date", range.to);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.status) q = q.eq("status", f.status);
  if (f.fund) q = q.eq("fund_id", f.fund);
  if (f.category) q = q.eq("category_id", f.category);
  if (f.q) q = q.or(`description.ilike.%${f.q}%,txn_no.ilike.%${f.q}%,reference_no.ilike.%${f.q}%,payer_payee.ilike.%${f.q}%`);
  return q.order("txn_date", { ascending: false }).order("created_at", { ascending: false });
}

export async function listTransactions(range: DateRange, filters: TransactionFilters) {
  const supabase = await createClient();
  const offset = (filters.page - 1) * TRANSACTIONS_PAGE_SIZE;
  const { data, count, error } = await buildTransactionQuery(supabase, range, filters, true).range(offset, offset + TRANSACTIONS_PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0, error };
}

export async function listTransactionsForExport(range: DateRange, filters: Omit<TransactionFilters, "page">) {
  const supabase = await createClient();
  const { data, error } = await buildTransactionQuery(supabase, range, filters, false).limit(20_000);
  return { rows: data ?? [], error };
}

export async function getTransaction(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("financial_transactions")
    .select(
      "id, txn_no, kind, fund_id, category_id, amount::text, txn_date, description, reference_no, payer_payee, member_id, payment_method, status, reverses_transaction_id, reversal_reason, posted_at, reversed_at, created_at, updated_at, funds(name, code), financial_categories(name), members(id, member_no, first_name, last_name), created_by_profile:profiles!financial_transactions_created_by_fkey(full_name), posted_by_profile:profiles!financial_transactions_posted_by_fkey(full_name), reversed_by_profile:profiles!financial_transactions_reversed_by_fkey(full_name), financial_attachments(id, file_name, storage_path, mime_type, size_bytes, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const [{ data: reversal }, { data: original }] = await Promise.all([
    supabase.from("financial_transactions").select("id, txn_no, txn_date").eq("reverses_transaction_id", id).maybeSingle(),
    data.reverses_transaction_id
      ? supabase.from("financial_transactions").select("id, txn_no").eq("id", data.reverses_transaction_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { ...data, reversal, original };
}

export async function getFundBalances(asOf?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_fund_balances", asOf && parseDateOnly(asOf) ? { p_as_of: asOf } : {});
  return { rows: data ?? [], error };
}

export async function listTransfers(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fund_transfers")
    .select("id, transfer_no, amount::text, transfer_date, reason, reverses_transfer_id, created_at, from_fund:funds!fund_transfers_from_fund_id_fkey(name), to_fund:funds!fund_transfers_to_fund_id_fkey(name), created_by_profile:profiles(full_name)")
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

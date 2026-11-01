import { type NextRequest } from "next/server";
import { formatDate, resolveDateRange, todayManila } from "@/lib/dates";
import { sumMoney } from "@/lib/money";
import { getCurrentUser } from "@/server/auth/session";
import { buildCsv, buildXlsx, fileResponse, type ExportColumn } from "@/server/exports/spreadsheet";
import { listTransactionsForExport, parseTransactionFilters } from "@/server/queries/finance";
import { createClient } from "@/server/supabase/server";

type Row = Awaited<ReturnType<typeof listTransactionsForExport>>["rows"][number];

/** Signed amount: income positive, expense negative; reversal entries flip the sign. */
function signed(r: Row): string {
  const negative = (r.kind === "expense") !== Boolean(r.reverses_transaction_id);
  return negative ? `-${r.amount}` : r.amount;
}

const COLUMNS: ExportColumn<Row>[] = [
  { header: "Date", value: (r) => r.txn_date, width: 12 },
  { header: "Number", value: (r) => r.txn_no ?? "DRAFT", width: 18 },
  { header: "Type", value: (r) => (r.reverses_transaction_id ? `${r.kind} reversal` : r.kind) },
  { header: "Status", value: (r) => r.status },
  { header: "Category", value: (r) => r.financial_categories?.name, width: 22 },
  { header: "Fund", value: (r) => r.funds?.name, width: 18 },
  { header: "Description", value: (r) => r.description, width: 40 },
  { header: "Payer / payee", value: (r) => r.payer_payee, width: 24 },
  { header: "Reference", value: (r) => r.reference_no },
  { header: "Payment method", value: (r) => r.payment_method },
  { header: "Amount (PHP)", value: (r) => signed(r), money: true, width: 16 },
];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.permissions.has("finance.read")) return new Response("Forbidden", { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const range = resolveDateRange(params, "this_month");
  const { page: _page, ...filters } = parseTransactionFilters(params);
  const format = params.format === "csv" ? "csv" : "xlsx";
  const { rows, error } = await listTransactionsForExport(range, filters);
  if (error) return new Response("The export could not be generated.", { status: 500 });

  const supabase = await createClient();
  await supabase.rpc("log_event", {
    p_action: "export.transactions",
    p_entity_type: "financial_transaction",
    p_summary: `Exported ${rows.length} transactions ${range.from} to ${range.to}`,
    p_metadata: { range, filters, count: rows.length, format },
  });

  const filename = `transactions-${range.from}-to-${range.to}.${format}`;
  if (format === "csv") return fileResponse(buildCsv(COLUMNS, rows), filename, "csv");
  const postedNet = sumMoney(rows.filter((r) => r.status !== "draft").map(signed));
  const buffer = await buildXlsx({
    sheetName: "Transactions",
    title: "Financial Transactions",
    subtitle: `${formatDate(range.from)} – ${formatDate(range.to)} · generated ${formatDate(todayManila())} by ${user.fullName}`,
    columns: COLUMNS,
    rows,
    footer: [null, null, null, null, null, null, "Net of posted entries", null, null, null, Number(postedNet)],
  });
  return fileResponse(buffer, filename, "xlsx");
}

import { type NextRequest } from "next/server";
import { formatDateTime, todayManila } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/session";
import { buildCsv, buildXlsx, fileResponse, type ExportColumn } from "@/server/exports/spreadsheet";
import { renderReportPdf } from "@/server/pdf/report-pdf";
import { getChurchSettings } from "@/server/queries/settings";
import { buildReport, canViewReport, isReportKey, parseReportParams } from "@/server/reports";
import { createClient } from "@/server/supabase/server";

/** Exports any report as Excel, CSV or PDF from the same data shown on screen. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { key } = await params;
  if (!isReportKey(key)) return new Response("Not found", { status: 404 });
  if (!canViewReport(key, user.permissions)) return new Response("Forbidden", { status: 403 });

  const search = Object.fromEntries(request.nextUrl.searchParams.entries());
  const format = search.format === "csv" ? "csv" : search.format === "pdf" ? "pdf" : "xlsx";
  let table;
  try {
    table = await buildReport(key, parseReportParams(search, key));
  } catch {
    return new Response("The report could not be generated.", { status: 500 });
  }

  const supabase = await createClient();
  await supabase.rpc("log_event", {
    p_action: "report.exported",
    p_entity_type: "report",
    p_entity_id: key,
    p_summary: `${table.title} exported as ${format.toUpperCase()} (${table.rows.length} rows)`,
    p_metadata: { params: search },
  });

  const filename = `${key}-${todayManila()}.${format}`;
  const columns: ExportColumn<string[]>[] = table.columns.map((c, i) => ({ header: c.header, value: (row) => row[i], money: c.money }));

  if (format === "csv") return fileResponse(buildCsv(columns, table.totals ? [...table.rows, table.totals] : table.rows), filename, "csv");
  if (format === "pdf") {
    const settings = await getChurchSettings();
    const pdf = await renderReportPdf(table, {
      churchName: settings?.church_name ?? "",
      generatedBy: user.fullName,
      generatedAt: formatDateTime(new Date().toISOString()),
    });
    return fileResponse(pdf, filename, "pdf");
  }
  const buffer = await buildXlsx({
    sheetName: table.title,
    title: table.title,
    subtitle: `${table.subtitle} · generated ${formatDateTime(new Date().toISOString())} by ${user.fullName}`,
    columns,
    rows: table.rows,
    footer: table.totals?.map((v, i) => (table.columns[i]?.money && v ? Number(v) : v)),
  });
  return fileResponse(buffer, filename, "xlsx");
}

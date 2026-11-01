import { type NextRequest } from "next/server";
import { formatDate, todayManila } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/session";
import { buildCsv, buildXlsx, fileResponse, type ExportColumn } from "@/server/exports/spreadsheet";
import { listMembersForExport, parseMemberFilters } from "@/server/queries/members";
import { createClient } from "@/server/supabase/server";

type Row = Awaited<ReturnType<typeof listMembersForExport>>["rows"][number];

const COLUMNS: ExportColumn<Row>[] = [
  { header: "Member ID", value: (r) => r.member_no, width: 16 },
  { header: "Last name", value: (r) => r.last_name },
  { header: "First name", value: (r) => r.first_name },
  { header: "Middle name", value: (r) => r.middle_name },
  { header: "Suffix", value: (r) => r.suffix, width: 8 },
  { header: "Gender", value: (r) => r.gender },
  { header: "Birthdate", value: (r) => r.birthdate },
  { header: "Contact number", value: (r) => r.contact_number },
  { header: "Email", value: (r) => r.email, width: 28 },
  { header: "City", value: (r) => r.city },
  { header: "Date registered", value: (r) => r.date_registered },
  { header: "Membership date", value: (r) => r.membership_date },
  { header: "Category", value: (r) => r.category_name },
  { header: "Status", value: (r) => r.status_name },
  { header: "Baptized", value: (r) => (r.is_baptized ? "Yes" : "No") },
  { header: "Baptism date", value: (r) => r.baptism_date },
];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.permissions.has("members.export")) return new Response("Forbidden", { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const { page: _page, sort: _sort, ...filters } = parseMemberFilters(params);
  const format = params.format === "csv" ? "csv" : "xlsx";
  const { rows, error } = await listMembersForExport(filters);
  if (error) return new Response("The export could not be generated.", { status: 500 });

  const supabase = await createClient();
  await supabase.rpc("log_event", {
    p_action: "export.members",
    p_entity_type: "member",
    p_summary: `Exported ${rows.length} member records (${format.toUpperCase()})`,
    p_metadata: { filters, count: rows.length, format },
  });

  const filename = `members-${todayManila()}.${format}`;
  if (format === "csv") return fileResponse(buildCsv(COLUMNS, rows), filename, "csv");
  const buffer = await buildXlsx({
    sheetName: "Members",
    title: "Member Directory",
    subtitle: `Generated ${formatDate(todayManila())} by ${user.fullName} · ${rows.length} records · Confidential (RA 10173)`,
    columns: COLUMNS,
    rows,
  });
  return fileResponse(buffer, filename, "xlsx");
}

import ExcelJS from "exceljs";
import { getCurrentUser } from "@/server/auth/session";
import { fileResponse } from "@/server/exports/spreadsheet";
import { IMPORT_COLUMNS } from "@/features/members/import-columns";

/** Blank spreadsheet with the columns the importer understands. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.permissions.has("members.import")) return new Response("Forbidden", { status: 403 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Members");
  const header = sheet.addRow(IMPORT_COLUMNS.map((c) => c.header));
  header.font = { bold: true };
  sheet.addRow(IMPORT_COLUMNS.map((c) => c.example));
  IMPORT_COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(c.header.length + 4, 14);
  });
  const notes = workbook.addWorksheet("Instructions");
  notes.addRow(["Fill one member per row on the Members sheet. Delete the example row."]);
  notes.addRow(["Required columns: First name, Last name."]);
  notes.addRow(["Dates: use YYYY-MM-DD (for example 1990-05-21) or an Excel date cell."]);
  notes.addRow(["Gender: Male or Female. Leave blank if not known."]);
  for (const c of IMPORT_COLUMNS) notes.addRow([c.header, c.help]);

  return fileResponse(Buffer.from(await workbook.xlsx.writeBuffer()), "grace-member-import-template.xlsx", "xlsx");
}

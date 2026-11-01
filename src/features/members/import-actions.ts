"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import type { Json } from "@/types/database";
import { authorizeAction } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";
import { parseImportRows, type ParsedImport, type RawCell, type RawRow } from "./import-parse";
import { emptyToNull, memberUpdateSchema, type MemberUpdateInput } from "./schemas";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function excelCellValue(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return excelCellValue(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    return null;
  }
  return value;
}

async function readSpreadsheet(file: File): Promise<{ headers: string[]; rows: RawRow[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
    return { headers: parsed.meta.fields ?? [], rows: parsed.data };
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(excelCellValue(cell.value) ?? "").trim();
  });
  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: RawRow = {};
    headers.forEach((h, i) => {
      if (h) record[h] = excelCellValue(row.getCell(i + 1).value);
    });
    rows.push(record);
  });
  return { headers: headers.filter(Boolean), rows };
}

export async function previewImportAction(formData: FormData): Promise<ActionResult<ParsedImport>> {
  const { denied } = await authorizeAction(["members.import"]);
  if (denied) return denied;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a spreadsheet file to import.");
  if (file.size > MAX_FILE_BYTES) return fail("The file must be 5 MB or smaller.");
  if (!/\.(xlsx|csv)$/i.test(file.name)) return fail("Use an Excel (.xlsx) or CSV file.");

  try {
    const { headers, rows } = await readSpreadsheet(file);
    if (headers.length === 0) return fail("The file is empty or the first row has no column headings.");
    return ok(parseImportRows(rows, headers));
  } catch {
    return fail("The file could not be read. Make sure it is a valid .xlsx or .csv file.");
  }
}

const commitSchema = z.object({
  statusId: z.uuid("Select the status for imported members."),
  rows: z.array(memberUpdateSchema).min(1, "There are no valid rows to import.").max(2000),
});

export async function commitImportAction(rows: MemberUpdateInput[], statusId: string): Promise<ActionResult<{ count: number }>> {
  const { denied } = await authorizeAction(["members.import"]);
  if (denied) return denied;
  const parsed = commitSchema.safeParse({ rows, statusId });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The import data is not valid.");

  const payload = parsed.data.rows.map((r) => {
    const v = emptyToNull(r);
    return { ...v, first_name: r.first_name, last_name: r.last_name, date_registered: r.date_registered, gender: v.gender || null, civil_status: v.civil_status || null };
  });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_members", { p_rows: payload as Json, p_status_id: parsed.data.statusId });
  if (error) return fail(friendlyDbError(error, "The import failed. No members were added."));
  revalidatePath("/members");
  revalidatePath("/dashboard");
  return ok({ count: data ?? 0 }, `Imported ${data} members.`);
}

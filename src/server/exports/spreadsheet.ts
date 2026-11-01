import "server-only";
import ExcelJS from "exceljs";
import { sanitizeCell } from "./sanitize";

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
  width?: number;
  /** Exact decimal strings rendered as numbers with 2 decimals in Excel. */
  money?: boolean;
};

export { sanitizeCell };

function cellValue<T>(col: ExportColumn<T>, row: T): string | number | boolean | null {
  const v = col.value(row);
  if (v === null || v === undefined) return null;
  if (col.money && typeof v === "string") {
    // Money is kept exact as a string; Excel displays it as a number.
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  if (typeof v === "string") return sanitizeCell(v);
  return v;
}

export async function buildXlsx<T>(options: {
  sheetName: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  footer?: Array<string | number | null>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LIGHT";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(options.sheetName.slice(0, 31));

  sheet.addRow([options.title]).font = { bold: true, size: 14 };
  if (options.subtitle) sheet.addRow([options.subtitle]).font = { color: { argb: "FF6B716C" } };
  sheet.addRow([]);

  const header = sheet.addRow(options.columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF26734D" } };
  });
  const headerRowNumber = header.number;

  for (const row of options.rows) {
    sheet.addRow(options.columns.map((c) => cellValue(c, row)));
  }
  if (options.footer) {
    const f = sheet.addRow(options.footer.map((v) => (typeof v === "string" ? sanitizeCell(v) : v)));
    f.font = { bold: true };
  }

  options.columns.forEach((col, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = col.width ?? Math.min(Math.max(col.header.length + 4, 12), 40);
    if (col.money) column.numFmt = "#,##0.00";
  });
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: options.columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const escape = (v: string | number | boolean | null) => {
    if (v === null) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(row);
          if (v === null || v === undefined) return "";
          return escape(typeof v === "string" && !c.money ? sanitizeCell(v) : v);
        })
        .join(","),
    );
  }
  // BOM so Excel opens UTF-8 (ñ, é) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function fileResponse(body: Buffer | string, filename: string, type: "xlsx" | "csv" | "pdf"): Response {
  const contentType = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv; charset=utf-8",
    pdf: "application/pdf",
  }[type];
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

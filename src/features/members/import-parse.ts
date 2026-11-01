import { z } from "zod";
import { todayManila } from "@/lib/dates";
import { IMPORT_COLUMNS, type ImportColumnKey } from "./import-columns";
import { memberUpdateSchema, type MemberUpdateInput } from "./schemas";

export type RawCell = string | number | boolean | Date | null | undefined;
export type RawRow = Record<string, RawCell>;

export type ImportRowError = { row: number; name: string; messages: string[] };
export type ParsedImport = {
  valid: Array<{ row: number; values: MemberUpdateInput }>;
  errors: ImportRowError[];
  warnings: string[];
  unknownHeaders: string[];
  total: number;
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z/ ]/g, "").replace(/\s+/g, " ").trim();

/** Maps spreadsheet headers to importer fields. */
export function mapHeaders(headers: string[]): { map: Map<string, ImportColumnKey>; unknown: string[] } {
  const map = new Map<string, ImportColumnKey>();
  const unknown: string[] = [];
  for (const header of headers) {
    const n = normalizeHeader(header);
    const col = IMPORT_COLUMNS.find((c) => normalizeHeader(c.header) === n || c.aliases.some((a) => normalizeHeader(a) === n));
    if (col) map.set(header, col.key);
    else if (header.trim()) unknown.push(header);
  }
  return { map, unknown };
}

function toText(value: RawCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY, Excel serial numbers and Date cells. */
export function normalizeDate(value: RawCell): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 59 && value < 80000) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = toText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return s; // left as-is; validation reports it
}

function normalizeGender(value: RawCell): string {
  const s = toText(value).toLowerCase();
  if (["m", "male", "lalaki"].includes(s)) return "male";
  if (["f", "female", "babae"].includes(s)) return "female";
  return s;
}

function normalizeCivil(value: RawCell): string {
  const s = toText(value).toLowerCase();
  return s === "widow" || s === "widower" ? "widowed" : s;
}

const DATE_KEYS = new Set<ImportColumnKey>(["birthdate", "date_registered", "membership_date"]);

export function parseImportRows(rows: RawRow[], headers: string[], maxRows = 2000): ParsedImport {
  const { map, unknown } = mapHeaders(headers);
  const result: ParsedImport = { valid: [], errors: [], warnings: [], unknownHeaders: unknown, total: 0 };

  if (![...map.values()].includes("first_name") || ![...map.values()].includes("last_name")) {
    result.errors.push({ row: 1, name: "Header row", messages: ['The file must have "First name" and "Last name" columns.'] });
    return result;
  }

  const seen = new Map<string, number>();
  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const values: Record<string, string> = {};
    let hasData = false;
    for (const [header, key] of map) {
      const cell = raw[header];
      let v: string;
      if (DATE_KEYS.has(key)) v = normalizeDate(cell);
      else if (key === "gender") v = normalizeGender(cell);
      else if (key === "civil_status") v = normalizeCivil(cell);
      else v = toText(cell);
      if (v) hasData = true;
      values[key] = v;
    }
    if (!hasData) return;
    result.total++;
    if (result.total > maxRows) return;

    const candidate: MemberUpdateInput = {
      first_name: values.first_name ?? "",
      middle_name: values.middle_name ?? "",
      last_name: values.last_name ?? "",
      suffix: values.suffix ?? "",
      gender: (values.gender ?? "") as MemberUpdateInput["gender"],
      civil_status: (values.civil_status ?? "") as MemberUpdateInput["civil_status"],
      birthdate: values.birthdate ?? "",
      contact_number: values.contact_number ?? "",
      email: values.email ?? "",
      address_line: values.address_line ?? "",
      barangay: values.barangay ?? "",
      city: values.city ?? "",
      province: values.province ?? "",
      postal_code: values.postal_code ?? "",
      date_registered: values.date_registered || todayManila(),
      membership_date: values.membership_date ?? "",
      category_id: "",
      previous_church: values.previous_church ?? "",
      notes: values.notes ?? "",
    };

    const parsed = memberUpdateSchema.safeParse(candidate);
    const name = `${candidate.first_name} ${candidate.last_name}`.trim() || "(no name)";
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error);
      const messages = [...flat.formErrors, ...Object.values(flat.fieldErrors).flatMap((m) => m ?? [])];
      result.errors.push({ row: rowNumber, name, messages });
      return;
    }

    const key = `${candidate.first_name.toLowerCase()}|${candidate.last_name.toLowerCase()}|${candidate.birthdate}`;
    const earlier = seen.get(key);
    if (earlier) {
      result.warnings.push(`Row ${rowNumber} (${name}) looks like a duplicate of row ${earlier}.`);
    } else {
      seen.set(key, rowNumber);
    }
    result.valid.push({ row: rowNumber, values: candidate });
  });

  if (result.total > maxRows) {
    result.errors.push({ row: 0, name: "File", messages: [`The file has ${result.total} rows. Import at most ${maxRows} rows at a time.`] });
  }
  return result;
}

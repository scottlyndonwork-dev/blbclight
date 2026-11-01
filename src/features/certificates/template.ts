import { z } from "zod";
import { formatDate } from "@/lib/dates";

/** A custom field defined on a template, filled in when issuing. */
export const templateFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Field keys use lowercase letters, numbers and underscores."),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "date"]),
  required: z.boolean(),
});

export type TemplateField = z.infer<typeof templateFieldSchema>;

export function parseTemplateFields(value: unknown): TemplateField[] {
  const parsed = z.array(templateFieldSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Placeholders filled automatically from the member record and church settings. */
export const BUILT_IN_PLACEHOLDERS = [
  { key: "full_name", label: "Recipient full name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "member_no", label: "Member ID" },
  { key: "birthdate", label: "Birthdate" },
  { key: "membership_date", label: "Membership date" },
  { key: "baptism_date", label: "Baptism date" },
  { key: "baptism_location", label: "Baptism location" },
  { key: "officiant", label: "Baptism officiant" },
  { key: "church_name", label: "Church name" },
  { key: "issued_on", label: "Date of issuance" },
] as const;

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** Replaces {{key}} placeholders. Missing values render as a blank line so gaps are obvious in the preview. */
export function renderTemplate(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(PLACEHOLDER, (_, key: string) => {
    const v = values[key];
    return v && v.trim() ? v.trim() : "__________";
  });
}

export type MemberForCertificate = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  member_no: string;
  birthdate: string | null;
  membership_date: string | null;
  date_registered: string;
  baptism?: { baptism_date: string | null; location: string | null; officiant: string | null } | null;
};

export function memberDisplayName(m: Pick<MemberForCertificate, "first_name" | "middle_name" | "last_name" | "suffix">): string {
  return [m.first_name, m.middle_name, m.last_name, m.suffix].filter(Boolean).join(" ");
}

const LONG_DATE = "MMMM d, yyyy";

/** Builds the placeholder values for a certificate. Dates are written out in long form. */
export function buildPlaceholderValues(options: {
  member: MemberForCertificate | null;
  recipientName: string;
  churchName: string;
  issuedOn: string;
  fields: TemplateField[];
  fieldValues: Record<string, string>;
}): Record<string, string> {
  const { member, fields, fieldValues } = options;
  const values: Record<string, string> = {
    full_name: options.recipientName,
    church_name: options.churchName,
    issued_on: formatDate(options.issuedOn, LONG_DATE),
  };
  if (member) {
    Object.assign(values, {
      first_name: member.first_name,
      last_name: member.last_name,
      member_no: member.member_no,
      birthdate: member.birthdate ? formatDate(member.birthdate, LONG_DATE) : "",
      membership_date: formatDate(member.membership_date ?? member.date_registered, LONG_DATE),
      baptism_date: member.baptism?.baptism_date ? formatDate(member.baptism.baptism_date, LONG_DATE) : "",
      baptism_location: member.baptism?.location ?? "",
      officiant: member.baptism?.officiant ?? "",
    });
  }
  for (const field of fields) {
    const raw = fieldValues[field.key] ?? "";
    values[field.key] = field.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? formatDate(raw, LONG_DATE) : raw;
  }
  return values;
}

/** Field values that are required but empty. */
export function missingRequiredFields(fields: TemplateField[], values: Record<string, string>): TemplateField[] {
  return fields.filter((f) => f.required && !(values[f.key] ?? "").trim());
}

import "server-only";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import {
  buildPlaceholderValues,
  missingRequiredFields,
  parseTemplateFields,
  renderTemplate,
  type TemplateField,
} from "@/features/certificates/template";
import type { CertificatePdfData } from "@/server/pdf/certificate-pdf";
import type { SupabaseServerClient } from "@/server/supabase/server";

export const issueInputSchema = z.object({
  template_id: z.uuid("Select a certificate template."),
  member_id: z.uuid().nullable(),
  recipient_name: z.string().trim().max(200),
  issued_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the date of issuance."),
  field_values: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().trim().max(300)),
  signatory_ids: z.array(z.uuid()).min(1, "Select at least one signatory.").max(4, "Select at most four signatories."),
  replaces_certificate_id: z.uuid().nullable().optional(),
  replace_reason: z.string().trim().max(500).optional(),
});

export type IssueInput = z.input<typeof issueInputSchema>;

export function verifyUrl(token: string): string {
  return `${publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/verify/${token}`;
}

/**
 * Loads everything needed to render a certificate and validates it.
 * Returns the rendered body plus the data needed for the PDF preview.
 */
export async function prepareCertificate(supabase: SupabaseServerClient, input: z.output<typeof issueInputSchema>) {
  const [templateResult, churchResult, signatoriesResult, memberResult] = await Promise.all([
    supabase
      .from("certificate_templates")
      .select("id, name, title, subtitle, body, footer_text, fields, orientation, show_qr, is_active, certificate_types(id, name, requires_member, is_active)")
      .eq("id", input.template_id)
      .maybeSingle(),
    supabase.from("church_settings").select("church_name, address, logo_path").maybeSingle(),
    supabase.from("certificate_signatories").select("id, full_name, title, signature_path, is_active").in("id", input.signatory_ids),
    input.member_id
      ? supabase
          .from("members")
          .select("id, first_name, middle_name, last_name, suffix, member_no, birthdate, membership_date, date_registered, archived_at, baptism_records(baptism_date, location, officiant)")
          .eq("id", input.member_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const template = templateResult.data;
  if (!template || !template.is_active || !template.certificate_types?.is_active) {
    return { error: "Select an active certificate template." } as const;
  }
  const type = template.certificate_types;
  const member = memberResult.data;
  if (type.requires_member && !member) return { error: "This certificate must be issued to a registered member." } as const;
  if (member?.archived_at) return { error: "Certificates cannot be issued for an archived member record." } as const;

  const recipientName = input.recipient_name || (member ? [member.first_name, member.middle_name, member.last_name, member.suffix].filter(Boolean).join(" ") : "");
  if (!recipientName) return { error: "Enter the recipient's name." } as const;

  const signatories = input.signatory_ids
    .map((id) => signatoriesResult.data?.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s?.is_active));
  if (signatories.length !== input.signatory_ids.length) return { error: "One or more signatories are inactive." } as const;

  const fields: TemplateField[] = parseTemplateFields(template.fields);
  const missing = missingRequiredFields(fields, input.field_values);
  if (missing.length) return { error: `Fill in: ${missing.map((f) => f.label).join(", ")}.` } as const;

  const church = churchResult.data ?? { church_name: "", address: "", logo_path: null };
  const values = buildPlaceholderValues({
    member: member
      ? { ...member, baptism: member.baptism_records ? { ...member.baptism_records } : null }
      : null,
    recipientName,
    churchName: church.church_name,
    issuedOn: input.issued_on,
    fields,
    fieldValues: input.field_values,
  });
  const body = renderTemplate(template.body, values);
  const fieldValues = Object.fromEntries(fields.map((f) => [f.key, input.field_values[f.key] ?? ""]));

  const pdf: CertificatePdfData = {
    title: template.title,
    subtitle: template.subtitle,
    body,
    footerText: template.footer_text,
    orientation: template.orientation,
    showQr: template.show_qr,
    typeName: type.name,
    church: { name: church.church_name, address: church.address, logoPath: church.logo_path },
    signatories: signatories.map((s) => ({ full_name: s.full_name, title: s.title, signature_path: s.signature_path })),
    referenceNo: "PREVIEW",
    issuedOn: input.issued_on,
    verifyUrl: null,
  };

  return { error: null, recipientName, body, fieldValues, pdf, memberId: member?.id ?? null } as const;
}

/** Shape of certificates.data written by issue_certificate. */
export const snapshotSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  body: z.string(),
  footer_text: z.string().nullable(),
  fields: z.record(z.string(), z.string()).catch({}),
  orientation: z.enum(["landscape", "portrait"]),
  show_qr: z.boolean(),
  type_name: z.string(),
  church: z.object({ name: z.string(), address: z.string().nullable().catch(""), logo_path: z.string().nullable() }),
  signatories: z.array(z.object({ full_name: z.string(), title: z.string(), signature_path: z.string().nullable() })),
});

export type CertificateSnapshot = z.infer<typeof snapshotSchema>;

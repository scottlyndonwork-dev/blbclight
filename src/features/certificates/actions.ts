"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { todayManila } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import type { Json } from "@/types/database";
import { authorizeAction } from "@/server/auth/session";
import { issueInputSchema, prepareCertificate, type IssueInput } from "@/server/certificates";
import { renderCertificatePdf } from "@/server/pdf/certificate-pdf";
import { createClient } from "@/server/supabase/server";
import { templateFieldSchema } from "./template";

const idSchema = z.uuid();

function revalidateCertificates(id?: string, memberId?: string | null) {
  revalidatePath("/certificates");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/certificates/${id}`);
  if (memberId) revalidatePath(`/members/${memberId}`);
}

/** Renders the certificate with a PREVIEW watermark without saving anything. */
export async function previewCertificateAction(input: IssueInput): Promise<ActionResult<{ pdfBase64: string; body: string }>> {
  const { denied } = await authorizeAction(["certificates.issue"]);
  if (denied) return denied;
  const parsed = issueInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the certificate details.");
  if (parsed.data.issued_on > todayManila()) return fail("The issue date cannot be in the future.");

  const supabase = await createClient();
  const prepared = await prepareCertificate(supabase, parsed.data);
  if (prepared.error !== null) return fail(prepared.error);
  try {
    const pdf = await renderCertificatePdf(supabase, { ...prepared.pdf, watermark: "PREVIEW" });
    return ok({ pdfBase64: pdf.toString("base64"), body: prepared.body });
  } catch {
    return fail("The preview could not be generated. Check the template and signature images.");
  }
}

export async function issueCertificateAction(input: IssueInput): Promise<ActionResult<{ id: string; referenceNo: string }>> {
  const { denied } = await authorizeAction(["certificates.issue"]);
  if (denied) return denied;
  const parsed = issueInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the certificate details.");

  const supabase = await createClient();
  const prepared = await prepareCertificate(supabase, parsed.data);
  if (prepared.error !== null) return fail(prepared.error);

  const { data, error } = await supabase.rpc("issue_certificate", {
    p_template_id: parsed.data.template_id,
    // NULL is valid (recipient who is not a registered member); generated arg types omit nullability.
    p_member_id: prepared.memberId as string,
    p_recipient_name: prepared.recipientName,
    p_issued_on: parsed.data.issued_on,
    p_content: { body: prepared.body, fields: prepared.fieldValues } as Json,
    p_signatory_ids: parsed.data.signatory_ids,
    p_replaces_certificate_id: parsed.data.replaces_certificate_id ?? undefined,
    p_replace_reason: parsed.data.replace_reason || undefined,
  });
  const row = data?.[0];
  if (error || !row) return fail(friendlyDbError(error, "The certificate could not be issued."));
  revalidateCertificates(row.id, prepared.memberId);
  if (parsed.data.replaces_certificate_id) revalidatePath(`/certificates/${parsed.data.replaces_certificate_id}`);
  return ok({ id: row.id, referenceNo: row.reference_no }, `Certificate ${row.reference_no} issued.`);
}

export async function voidCertificateAction(certificateId: string, reason: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["certificates.void"]);
  if (denied) return denied;
  if (!idSchema.safeParse(certificateId).success) return fail("Invalid certificate.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_certificate", { p_certificate_id: certificateId, p_reason: reason.slice(0, 500) });
  if (error) return fail(friendlyDbError(error, "The certificate could not be voided."));
  revalidateCertificates(certificateId);
  return ok(null, "Certificate voided. It will now show as invalid when verified.");
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templateSchema = z
  .object({
    type_id: z.uuid("Select the certificate type."),
    name: z.string().trim().min(1, "Enter a template name.").max(120),
    title: z.string().trim().min(1, "Enter the certificate title.").max(150),
    subtitle: z.string().trim().max(200),
    body: z.string().trim().min(1, "Enter the certificate wording.").max(4000),
    footer_text: z.string().trim().max(500),
    fields: z.array(templateFieldSchema).max(12),
    orientation: z.enum(["landscape", "portrait"]),
    show_qr: z.boolean(),
    is_default: z.boolean(),
    is_active: z.boolean(),
  })
  .refine((v) => new Set(v.fields.map((f) => f.key)).size === v.fields.length, { message: "Field keys must be unique.", path: ["fields"] });

export type TemplateInput = z.input<typeof templateSchema>;

export async function saveTemplateAction(templateId: string | null, input: TemplateInput): Promise<ActionResult<{ id: string }>> {
  const { denied } = await authorizeAction(["certificates.templates"]);
  if (denied) return denied;
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the template.", z.flattenError(parsed.error).fieldErrors);
  const v = parsed.data;
  const row = { ...v, subtitle: v.subtitle || null, footer_text: v.footer_text || null, fields: v.fields as Json };

  const supabase = await createClient();
  if (v.is_default) {
    // Only one default per type: clear the previous default first.
    let clear = supabase.from("certificate_templates").update({ is_default: false }).eq("type_id", v.type_id).eq("is_default", true);
    if (templateId) clear = clear.neq("id", templateId);
    const { error: clearError } = await clear;
    if (clearError) return fail(friendlyDbError(clearError));
  }
  const { data, error } = templateId
    ? await supabase.from("certificate_templates").update(row).eq("id", templateId).select("id").single()
    : await supabase.from("certificate_templates").insert(row).select("id").single();
  if (error || !data) return fail(friendlyDbError(error, "The template could not be saved."));
  revalidatePath("/certificates/templates");
  return ok({ id: data.id }, "Template saved.");
}

// ---------------------------------------------------------------------------
// Signatories
// ---------------------------------------------------------------------------

const signatorySchema = z.object({
  full_name: z.string().trim().min(1, "Enter the signatory's name.").max(150),
  title: z.string().trim().min(1, "Enter the signatory's title.").max(150),
  is_active: z.boolean(),
});

const SIGNATURE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

export async function saveSignatoryAction(signatoryId: string | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { denied } = await authorizeAction(["certificates.templates"]);
  if (denied) return denied;
  const parsed = signatorySchema.safeParse({
    full_name: formData.get("full_name"),
    title: formData.get("title"),
    is_active: formData.get("is_active") === "true",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.", z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const file = formData.get("signature");
  let signaturePath: string | undefined;
  if (file instanceof File && file.size > 0) {
    const ext = SIGNATURE_TYPES[file.type];
    if (!ext) return fail("Upload the signature as a PNG or JPG image.");
    if (file.size > 1024 * 1024) return fail("The signature image must be 1 MB or smaller.");
    signaturePath = `signatures/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("church-assets").upload(signaturePath, file, { contentType: file.type });
    if (uploadError) return fail("The signature image could not be uploaded.");
  }

  const row = { ...parsed.data, ...(signaturePath ? { signature_path: signaturePath } : {}) };
  const { data, error } = signatoryId
    ? await supabase.from("certificate_signatories").update(row).eq("id", signatoryId).select("id").single()
    : await supabase.from("certificate_signatories").insert(row).select("id").single();
  if (error || !data) {
    if (signaturePath) await supabase.storage.from("church-assets").remove([signaturePath]);
    return fail(friendlyDbError(error, "The signatory could not be saved."));
  }
  revalidatePath("/certificates/templates");
  return ok({ id: data.id }, "Signatory saved.");
}

/** Records that an issued certificate was downloaded or printed again. */
export async function logCertificatePrintAction(certificateId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["certificates.read", "certificates.issue"]);
  if (denied) return denied;
  if (!idSchema.safeParse(certificateId).success) return fail("Invalid certificate.");
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "certificate.print", p_entity_type: "certificate", p_entity_id: certificateId });
  return ok(null);
}

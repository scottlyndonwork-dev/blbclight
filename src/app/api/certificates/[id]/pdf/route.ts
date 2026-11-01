import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { snapshotSchema, verifyUrl } from "@/server/certificates";
import { fileResponse } from "@/server/exports/spreadsheet";
import { renderCertificatePdf } from "@/server/pdf/certificate-pdf";
import { createClient } from "@/server/supabase/server";

/**
 * Renders an issued certificate from its frozen snapshot, so reprints are
 * identical to the original. Voided/replaced certificates carry a VOID mark.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.permissions.has("certificates.read") && !user.permissions.has("certificates.issue")) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("certificates")
    .select("id, reference_no, verification_token, issued_on, status, data")
    .eq("id", id)
    .maybeSingle();
  if (!cert) return new Response("Not found", { status: 404 });

  const snapshot = snapshotSchema.safeParse(cert.data);
  if (!snapshot.success) return new Response("This certificate's stored content is invalid.", { status: 500 });
  const s = snapshot.data;

  const pdf = await renderCertificatePdf(supabase, {
    title: s.title,
    subtitle: s.subtitle,
    body: s.body,
    footerText: s.footer_text,
    orientation: s.orientation,
    showQr: s.show_qr,
    typeName: s.type_name,
    church: { name: s.church.name, address: s.church.address ?? "", logoPath: s.church.logo_path },
    signatories: s.signatories,
    referenceNo: cert.reference_no,
    issuedOn: cert.issued_on,
    verifyUrl: verifyUrl(cert.verification_token),
    watermark: cert.status === "issued" ? null : "VOID",
  });

  const download = request.nextUrl.searchParams.get("download") === "1";
  await supabase.rpc("log_event", {
    p_action: "certificate.print",
    p_entity_type: "certificate",
    p_entity_id: cert.id,
    p_summary: `${download ? "Downloaded" : "Opened for printing"} ${cert.reference_no}`,
  });

  const response = fileResponse(pdf, `${cert.reference_no}.pdf`, "pdf");
  if (!download) response.headers.set("Content-Disposition", `inline; filename="${cert.reference_no}.pdf"`);
  return response;
}

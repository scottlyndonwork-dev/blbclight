import { describe, expect, it } from "vitest";
import { renderCertificatePdf } from "@/server/pdf/certificate-pdf";
import type { SupabaseServerClient } from "@/server/supabase/server";

// Storage returns no files, so the certificate renders without logo or signature images.
const supabase = {
  storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) },
} as unknown as SupabaseServerClient;

describe("certificate PDF", () => {
  it("renders a valid PDF with QR verification", async () => {
    const pdf = await renderCertificatePdf(supabase, {
      title: "Certificate of Baptism",
      subtitle: "This is to certify that",
      body: "Juan Santos Dela Cruz\n\nwas baptized on January 12, 2020 at the Main Sanctuary.",
      footerText: "Romans 6:4",
      orientation: "landscape",
      showQr: true,
      typeName: "Baptismal Certificate",
      church: { name: "Grace Bible Church", address: "Quezon City", logoPath: null },
      signatories: [{ full_name: "Rev. Jose Ramos", title: "Senior Pastor", signature_path: null }],
      referenceNo: "BAP-2025-000001",
      issuedOn: "2025-03-01",
      verifyUrl: "https://example.org/verify/0123456789abcdef0123456789abcdef",
      watermark: null,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});

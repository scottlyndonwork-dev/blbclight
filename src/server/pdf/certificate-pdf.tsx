import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { formatDate } from "@/lib/dates";
import type { SupabaseServerClient } from "@/server/supabase/server";

export type CertificatePdfData = {
  title: string;
  subtitle: string | null;
  body: string;
  footerText: string | null;
  orientation: "landscape" | "portrait";
  showQr: boolean;
  typeName: string;
  church: { name: string; address: string; logoPath: string | null };
  signatories: Array<{ full_name: string; title: string; signature_path: string | null }>;
  referenceNo: string;
  issuedOn: string;
  verifyUrl: string | null;
  watermark?: "PREVIEW" | "VOID" | null;
};

const BLUE = "#1f4e96";
const NAVY = "#16273d";
const YELLOW = "#d7b533";
const INK = "#16233a";

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Times-Roman", color: INK, backgroundColor: "#ffffff" },
  outer: { flex: 1, borderWidth: 3, borderColor: NAVY, padding: 6 },
  inner: { flex: 1, borderWidth: 1, borderColor: YELLOW, paddingVertical: 26, paddingHorizontal: 48, alignItems: "center" },
  logo: { width: 56, height: 56, objectFit: "contain", marginBottom: 6 },
  church: { fontSize: 15, fontFamily: "Times-Bold", color: NAVY, letterSpacing: 1, textTransform: "uppercase", textAlign: "center" },
  address: { fontSize: 9, color: "#5d6b80", marginTop: 2, textAlign: "center" },
  title: { fontSize: 30, fontFamily: "Times-Bold", color: BLUE, marginTop: 18, textAlign: "center" },
  rule: { width: 120, height: 1.5, backgroundColor: YELLOW, marginTop: 8, marginBottom: 12 },
  subtitle: { fontSize: 12, fontFamily: "Times-Italic", color: "#5d6b80", marginBottom: 6, textAlign: "center" },
  recipient: { fontSize: 24, fontFamily: "Times-Bold", color: INK, marginVertical: 6, textAlign: "center" },
  body: { fontSize: 12.5, lineHeight: 1.55, textAlign: "center", maxWidth: 560 },
  footerText: { fontSize: 9.5, fontFamily: "Times-Italic", color: "#5d6b80", marginTop: 12, textAlign: "center", maxWidth: 520 },
  signatures: { flexDirection: "row", justifyContent: "center", marginTop: "auto", gap: 36, width: "100%" },
  signature: { alignItems: "center", width: 180 },
  signatureImage: { height: 34, objectFit: "contain", marginBottom: 2 },
  signatureLine: { borderTopWidth: 0.75, borderTopColor: INK, width: "100%", paddingTop: 3, alignItems: "center" },
  signer: { fontSize: 11, fontFamily: "Times-Bold" },
  signerTitle: { fontSize: 9, color: "#5d6b80" },
  meta: { position: "absolute", bottom: 14, left: 20, right: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  metaText: { fontSize: 8, fontFamily: "Helvetica", color: "#5d6b80" },
  qr: { width: 58, height: 58 },
  watermark: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 90,
    fontFamily: "Helvetica-Bold",
    color: "#b42318",
    opacity: 0.15,
    transform: "rotate(-24deg)",
  },
});

function CertificateDocument({ data, logo, signatures, qr }: { data: CertificatePdfData; logo: string | null; signatures: Array<string | null>; qr: string | null }) {
  // The first line of the rendered body is the recipient line when the template starts with {{full_name}}.
  const [firstLine, ...rest] = data.body.split("\n");
  const hasRecipientLine = rest.length > 0 && firstLine.trim().length > 0 && firstLine.trim().length <= 120;

  return (
    <Document title={`${data.title} ${data.referenceNo}`} author={data.church.name} creator="LIGHT" producer="LIGHT">
      <Page size="A4" orientation={data.orientation} style={styles.page}>
        <View style={styles.outer}>
          <View style={styles.inner}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt attribute */}
            {logo && <Image src={logo} style={styles.logo} />}
            <Text style={styles.church}>{data.church.name}</Text>
            {data.church.address ? <Text style={styles.address}>{data.church.address}</Text> : null}
            <Text style={styles.title}>{data.title}</Text>
            <View style={styles.rule} />
            {data.subtitle ? <Text style={styles.subtitle}>{data.subtitle}</Text> : null}
            {hasRecipientLine ? (
              <>
                <Text style={styles.recipient}>{firstLine.trim()}</Text>
                <Text style={styles.body}>{rest.join("\n").trim()}</Text>
              </>
            ) : (
              <Text style={styles.body}>{data.body}</Text>
            )}
            {data.footerText ? <Text style={styles.footerText}>{data.footerText}</Text> : null}
            <View style={styles.signatures}>
              {data.signatories.map((s, i) => (
                <View key={`${s.full_name}-${i}`} style={styles.signature}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt attribute */}
                  {signatures[i] ? <Image src={signatures[i]!} style={styles.signatureImage} /> : <View style={{ height: 34 }} />}
                  <View style={styles.signatureLine}>
                    <Text style={styles.signer}>{s.full_name}</Text>
                    <Text style={styles.signerTitle}>{s.title}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.meta} fixed>
          <View>
            <Text style={styles.metaText}>Reference No. {data.referenceNo}</Text>
            <Text style={styles.metaText}>Issued {formatDate(data.issuedOn, "MMMM d, yyyy")}</Text>
            {data.verifyUrl ? <Text style={styles.metaText}>Verify at {data.verifyUrl}</Text> : null}
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt attribute */}
          {qr ? <Image src={qr} style={styles.qr} /> : null}
        </View>
        {data.watermark ? <Text style={styles.watermark}>{data.watermark}</Text> : null}
      </Page>
    </Document>
  );
}

/** Downloads an image from the private church-assets bucket as a data URI. */
async function loadAsset(supabase: SupabaseServerClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("church-assets").download(path);
  if (!data) return null;
  const type = data.type === "image/png" ? "image/png" : data.type === "image/jpeg" ? "image/jpeg" : null;
  if (!type) return null;
  return `data:${type};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
}

/** The bundled church logo (public/brand), used when Settings has no logo uploaded. */
async function defaultLogo(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "brand", "logo-512.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderCertificatePdf(supabase: SupabaseServerClient, data: CertificatePdfData): Promise<Buffer> {
  const [logo, qr, ...signatures] = await Promise.all([
    loadAsset(supabase, data.church.logoPath).then((logo) => logo ?? defaultLogo()),
    data.showQr && data.verifyUrl ? QRCode.toDataURL(data.verifyUrl, { margin: 0, width: 240, errorCorrectionLevel: "M" }) : Promise.resolve(null),
    ...data.signatories.map((s) => loadAsset(supabase, s.signature_path)),
  ]);
  return renderToBuffer(<CertificateDocument data={data} logo={logo} signatures={signatures} qr={qr} />);
}

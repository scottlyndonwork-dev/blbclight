import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { Suspense } from "react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { formatDate } from "@/lib/dates";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export const metadata: Metadata = { title: "Certificate verification", robots: { index: false, follow: false } };

/**
 * Public certificate verification. Uses the anonymous key and a single
 * SECURITY DEFINER function that returns only reference number, type,
 * issue date, validity and an abbreviated name. No session cookies are read.
 */
async function lookup(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const env = publicEnv();
  const supabase = createSupabase<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("verify_certificate", { p_token: token });
  if (error) throw new Error("verification unavailable");
  return data?.[0] ?? null;
}

export default function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <BrandLogo size={80} priority className="mb-3" />
      <p className="mb-6 text-sm font-semibold tracking-wide text-muted-foreground">LIGHT · Certificate Verification</p>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Checking certificate…</p>}>
          <Result params={params} />
        </Suspense>
      </div>
      <p className="mt-6 max-w-md text-center text-xs text-muted-foreground">
        Only the minimum details needed to confirm authenticity are shown, in line with the Data Privacy Act of 2012.
      </p>
    </div>
  );
}

async function Result({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let cert: Awaited<ReturnType<typeof lookup>>;
  try {
    cert = await lookup(token.toLowerCase());
  } catch {
    return (
      <div className="text-center">
        <ShieldAlert className="mx-auto mb-3 size-10 text-warning" />
        <h1 className="text-lg font-semibold">Verification is temporarily unavailable</h1>
        <p className="mt-1 text-sm text-muted-foreground">Please try again later.</p>
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="text-center">
        <XCircle className="mx-auto mb-3 size-10 text-destructive" />
        <h1 className="text-lg font-semibold">Certificate not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This verification code does not match any certificate issued through LIGHT. The certificate may not be authentic.
        </p>
      </div>
    );
  }

  const valid = cert.status === "issued";
  return (
    <div>
      <div className="text-center">
        {valid ? <CheckCircle2 className="mx-auto mb-3 size-10 text-success" /> : <XCircle className="mx-auto mb-3 size-10 text-destructive" />}
        <h1 className="text-lg font-semibold">{valid ? "This certificate is valid" : cert.status === "replaced" ? "This certificate was replaced" : "This certificate has been voided"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {valid ? `Issued by ${cert.church_name}.` : "It is no longer valid. Contact the issuing church for the current certificate."}
        </p>
      </div>
      <dl className="mt-6 divide-y rounded-md border text-sm">
        <Row label="Reference number" value={cert.reference_no} mono />
        <Row label="Certificate" value={cert.certificate_type} />
        <Row label="Issued to" value={cert.recipient_display_name} />
        <Row label="Date issued" value={formatDate(cert.issued_on, "MMMM d, yyyy")} />
        <Row label="Issuing church" value={cert.church_name} />
      </dl>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

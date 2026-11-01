import type { ReactNode } from "react";
import { BrandLogo } from "@/components/shared/brand-logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <BrandLogo size={112} priority />
        <div className="leading-tight">
          <p className="text-xl font-semibold tracking-[0.3em] text-secondary-foreground">LIGHT</p>
          <p className="mt-1 text-sm text-foreground">Leadership Information, Governance, and Holistic Tracking</p>
          <p className="text-xs text-muted-foreground">Church Management Information System</p>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
        This system contains personal information protected under the Data Privacy Act of 2012 (RA 10173). Access is limited to authorized church personnel.
      </p>
    </div>
  );
}

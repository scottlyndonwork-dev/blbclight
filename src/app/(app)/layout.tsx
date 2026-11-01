import { Suspense, type ReactNode } from "react";
import { AppShell, AppShellSkeleton } from "@/components/layout/app-shell";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

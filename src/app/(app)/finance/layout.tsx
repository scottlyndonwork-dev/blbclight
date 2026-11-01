import type { ReactNode } from "react";
import { FinanceNav } from "@/features/finance/components/finance-nav";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FinanceNav />
      {children}
    </>
  );
}

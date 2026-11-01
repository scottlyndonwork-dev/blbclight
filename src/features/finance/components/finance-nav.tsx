"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/transactions", label: "Transactions" },
  { href: "/finance/funds", label: "Funds & allocations" },
];

export function FinanceNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print mb-5 flex gap-1 overflow-x-auto border-b" aria-label="Finance sections">
      {LINKS.map((l) => {
        const active = l.href === "/finance" ? pathname === "/finance" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

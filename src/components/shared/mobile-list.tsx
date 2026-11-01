import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card-style list shown below `md` in place of a table: each row is one large
 * tap target, like a native app list.
 */
export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y md:hidden", className)}>{children}</ul>;
}

export function MobileListItem({
  href,
  title,
  subtitle,
  detail,
  value,
  badge,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>}
          {detail && <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>}
        </span>
        {(value !== undefined || badge) && (
          <span className="flex shrink-0 flex-col items-end gap-1 text-right">
            {value !== undefined && <span className="text-base font-bold tabular-nums">{value}</span>}
            {badge}
          </span>
        )}
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

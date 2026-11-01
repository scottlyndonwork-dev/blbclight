"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavSection } from "@/config/navigation";
import { ICONS } from "@/components/layout/app-sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** Tab order for phones and tablets; only items the user can see are used. */
const TAB_PRIORITY = ["/dashboard", "/members", "/attendance", "/finance", "/certificates", "/reports"];
const SHORT_LABELS: Record<string, string> = { "/dashboard": "Home", "/reports": "Reports" };

/**
 * App-style bottom navigation for screens narrower than `lg`: the four most
 * important sections plus "More", which opens the full menu.
 */
export function MobileTabBar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const items = sections.flatMap((s) => s.items);
  const tabs = TAB_PRIORITY.map((href) => items.find((i) => i.href === href))
    .filter((i) => i !== undefined)
    .slice(0, 4);
  const activeTab = tabs.some((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));

  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-2xl" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const Icon = ICONS[tab.icon];
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 text-xs font-semibold tracking-tight transition-colors active:scale-95",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active && "bg-primary/12")}>
                  <Icon className="size-6" />
                </span>
                <span className="max-w-full truncate">{SHORT_LABELS[tab.href] ?? tab.title}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className={cn(
              "flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-xs font-semibold transition-colors active:scale-95",
              activeTab ? "text-muted-foreground" : "text-primary",
            )}
          >
            <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", !activeTab && "bg-primary/12")}>
              <Menu className="size-6" />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

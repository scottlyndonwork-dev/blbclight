import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { visibleNavigation } from "@/config/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { BrandLogo } from "@/components/shared/brand-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/server/auth/session";
import { getChurchSettings } from "@/server/queries/settings";

/** Authenticated application frame: sidebar, header and content area. */
export async function AppShell({ children }: { children: ReactNode }) {
  const [user, settings, cookieStore] = await Promise.all([requireUser(), getChurchSettings(), cookies()]);
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const sections = visibleNavigation(user.permissions);
  const churchName = settings?.church_name ?? "Church Management Information System";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar sections={sections} churchName={settings?.church_name ?? "Church"} />
      <SidebarInset className="min-w-0">
        <header className="no-print sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-4 max-lg:box-content">
          <SidebarTrigger className="-ml-1 hidden size-10 lg:inline-flex [&_svg]:size-5" />
          <Separator orientation="vertical" className="mr-1 hidden h-5 lg:block" />
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <BrandLogo size={36} priority />
            <span className="min-w-0 leading-tight">
              <span className="block text-base font-bold tracking-[0.2em] text-secondary-foreground">LIGHT</span>
              <span className="block truncate text-xs text-muted-foreground">{churchName}</span>
            </span>
          </Link>
          <span className="hidden truncate text-base font-medium text-muted-foreground lg:inline">{churchName}</span>
          <div className="ml-auto flex items-center gap-1">
            <UserMenu fullName={user.fullName} email={user.email} roles={user.roles} />
          </div>
        </header>
        <div className="flex-1 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-8">{children}</div>
      </SidebarInset>
      <MobileTabBar sections={sections} />
    </SidebarProvider>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 shrink-0 bg-sidebar lg:block" />
      <div className="flex-1">
        <div className="h-16 border-b" />
        <div className="space-y-4 p-6">
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded bg-muted" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

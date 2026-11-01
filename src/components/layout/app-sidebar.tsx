"use client";

import {
  Award,
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavIcon, NavSection } from "@/config/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  members: Users,
  attendance: CalendarCheck,
  status: ShieldCheck,
  certificates: Award,
  finance: Wallet,
  reports: BarChart3,
  users: UserCog,
  audit: ScrollText,
  settings: Settings,
};

export function AppSidebar({ sections, churchName }: { sections: NavSection[]; churchName: string }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <Link
          href="/dashboard"
          className="flex flex-col items-center gap-2 px-2 pt-4 pb-3 text-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:py-2"
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <BrandLogo size={88} priority className="bg-white shadow-lg ring-2 ring-sidebar-primary/60 group-data-[collapsible=icon]:hidden" />
          <BrandLogo size={36} className="hidden bg-white group-data-[collapsible=icon]:block" />
          <span className="flex flex-col items-center leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-2xl font-bold tracking-[0.25em] text-white">LIGHT</span>
            <span className="mt-1 line-clamp-2 text-sm text-sidebar-foreground/85">{churchName}</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="py-2">
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-sm font-medium text-sidebar-foreground/70">{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {section.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="data-[active=true]:bg-sidebar-active data-[active=true]:font-semibold data-[active=true]:text-white data-[active=true]:shadow-md"
                      >
                        <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-0 p-0 group-data-[collapsible=icon]:hidden [@media(max-height:700px)]:hidden">
        <p className="px-5 py-3 text-center font-serif text-base leading-snug text-sidebar-primary italic">
          &ldquo;Let your light so shine before men...&rdquo;
        </p>
        <LighthouseScene />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Decorative lighthouse with light beams, echoing the church logo. */
function LighthouseScene() {
  return (
    <svg viewBox="0 0 272 130" className="block h-auto w-full [@media(max-height:900px)]:hidden" aria-hidden="true">
      <defs>
        <linearGradient id="light-beam-right" x1="0" x2="1">
          <stop offset="0" stopColor="#f5d465" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f5d465" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="light-beam-left" x1="1" x2="0">
          <stop offset="0" stopColor="#f5d465" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f5d465" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M200 30 L272 6 L272 48 Z" fill="url(#light-beam-right)" />
      <path d="M192 30 L96 10 L96 46 Z" fill="url(#light-beam-left)" />
      <path d="M0 120 Q60 98 120 112 T272 104 L272 150 L0 150 Z" fill="#ffffff" fillOpacity="0.06" />
      <path d="M0 132 Q80 116 150 128 T272 122 L272 150 L0 150 Z" fill="#ffffff" fillOpacity="0.08" />
      <g fill="#0d1a2e" fillOpacity="0.85">
        <path d="M188 40 h16 l5 76 h-26 z" />
        <rect x="185" y="34" width="22" height="6" rx="1" />
        <path d="M190 34 v-8 h12 v8 z" />
        <path d="M188 26 l8 -8 l8 8 z" />
        <path d="M170 116 h52 l6 8 h-64 z" />
      </g>
      <rect x="191" y="27" width="10" height="6" fill="#f5d465" />
      <g fill="#f5d465" fillOpacity="0.5">
        <rect x="194" y="56" width="4" height="7" rx="1" />
        <rect x="194" y="80" width="4" height="7" rx="1" />
      </g>
    </svg>
  );
}

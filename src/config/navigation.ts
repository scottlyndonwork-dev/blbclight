import type { Permission } from "@/lib/permissions";

export type NavIcon =
  | "dashboard"
  | "members"
  | "attendance"
  | "status"
  | "certificates"
  | "finance"
  | "reports"
  | "users"
  | "audit"
  | "settings";

export type NavItem = {
  title: string;
  href: string;
  icon: NavIcon;
  /** The item is shown when the user holds any of these permissions. Empty = everyone. */
  permissions: readonly Permission[];
};

export type NavSection = { label: string; items: readonly NavItem[] };

export const NAVIGATION: readonly NavSection[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: "dashboard", permissions: [] }],
  },
  {
    label: "Records",
    items: [
      { title: "Members", href: "/members", icon: "members", permissions: ["members.read"] },
      {
        title: "Attendance",
        href: "/attendance",
        icon: "attendance",
        permissions: ["attendance.read", "attendance.write"],
      },
      {
        title: "Membership Status",
        href: "/membership-status",
        icon: "status",
        permissions: ["members.read"],
      },
      {
        title: "Certificates",
        href: "/certificates",
        icon: "certificates",
        permissions: ["certificates.read", "certificates.issue", "certificates.templates"],
      },
      {
        title: "Finance",
        href: "/finance",
        icon: "finance",
        permissions: ["finance.read", "finance.write"],
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        title: "Reports & Analytics",
        href: "/reports",
        icon: "reports",
        permissions: ["reports.membership", "reports.attendance", "reports.certificates", "reports.finance"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "User Management", href: "/users", icon: "users", permissions: ["users.manage"] },
      { title: "Audit Logs", href: "/audit-logs", icon: "audit", permissions: ["audit.read"] },
      {
        title: "Settings",
        href: "/settings",
        icon: "settings",
        permissions: ["settings.manage", "certificates.templates", "finance.manage_funds"],
      },
    ],
  },
];

export function visibleNavigation(permissions: ReadonlySet<Permission>): NavSection[] {
  return NAVIGATION.map((section) => ({
    label: section.label,
    items: section.items.filter((item) => item.permissions.length === 0 || item.permissions.some((p) => permissions.has(p))),
  })).filter((section) => section.items.length > 0);
}

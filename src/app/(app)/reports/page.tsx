import { Award, BarChart3, CalendarCheck, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserWithAccess } from "@/server/auth/session";
import { canViewReport, REPORTS, type ReportGroup, type ReportKey } from "@/server/reports";

export const metadata: Metadata = { title: "Reports and analytics" };

const GROUPS: Record<ReportGroup, { title: string; description: string; icon: typeof Users }> = {
  membership: { title: "Membership", description: "Directory, new members, baptism and status changes", icon: Users },
  attendance: { title: "Attendance", description: "Daily, weekly, monthly and annual attendance", icon: CalendarCheck },
  certificates: { title: "Certificates", description: "Issuance history and totals by type", icon: Award },
  finance: { title: "Finance", description: "Income, expenses, monthly summaries and fund balances", icon: Wallet },
};

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports and Analytics"
        description="All reports reflect current database records and can be printed or exported to PDF and Excel."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ReportHub />
      </Suspense>
    </>
  );
}

async function ReportHub() {
  const { user, allowed } = await getUserWithAccess(["reports.membership", "reports.attendance", "reports.certificates", "reports.finance"]);
  if (!allowed) return <AccessDenied />;
  const visible = (Object.keys(REPORTS) as ReportKey[]).filter((k) => canViewReport(k, user.permissions));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(Object.keys(GROUPS) as ReportGroup[]).map((group) => {
        const reports = visible.filter((k) => REPORTS[k].group === group);
        if (reports.length === 0) return null;
        const { title, description, icon: Icon } = GROUPS[group];
        return (
          <section key={group} className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
            <ul className="mt-3 divide-y text-sm">
              {reports.map((k) => (
                <li key={k}>
                  <Link href={`/reports/${group}?report=${k}`} className="flex items-center gap-2 py-2 hover:text-primary">
                    <BarChart3 className="size-4 text-muted-foreground" />
                    {REPORTS[k].label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

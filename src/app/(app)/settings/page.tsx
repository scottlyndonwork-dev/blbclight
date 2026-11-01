import { LayoutTemplate } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChurchSettingsForm, LogoUpload, LookupList } from "@/features/settings/components";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { AccessDenied } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserWithAccess } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Church profile and the lists used throughout LIGHT. All changes are recorded in the audit log."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { user, allowed } = await getUserWithAccess(["settings.manage", "certificates.templates", "finance.manage_funds"]);
  if (!allowed) return <AccessDenied />;
  const canSettings = user.permissions.has("settings.manage");
  const canFinance = user.permissions.has("finance.manage_funds");

  const supabase = await createClient();
  const [settings, categories, ministries, serviceTypes, statuses, financeCategories] = await Promise.all([
    supabase.from("church_settings").select("church_name, short_name, address, contact_number, email, website, member_no_prefix, logo_path").maybeSingle(),
    supabase.from("membership_categories").select("id, name, is_active").order("sort_order").order("name"),
    supabase.from("ministries").select("id, name, is_active").order("name"),
    supabase.from("service_types").select("id, name, is_active, default_start_time").order("sort_order"),
    supabase.from("membership_statuses").select("id, name, is_active, is_system, counts_as_active, color").order("sort_order"),
    canFinance ? supabase.from("financial_categories").select("id, name, is_active, kind").order("kind").order("sort_order") : Promise.resolve({ data: null }),
  ]);
  const logo = settings.data?.logo_path ? await supabase.storage.from("church-assets").createSignedUrl(settings.data.logo_path, 600) : null;

  return (
    <div className="space-y-5">
      {canSettings && settings.data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <SectionCard title="Church profile" description="Shown on certificates, reports and the verification page.">
            <ChurchSettingsForm
              canEdit={canSettings}
              initial={{
                church_name: settings.data.church_name,
                short_name: settings.data.short_name,
                address: settings.data.address,
                contact_number: settings.data.contact_number,
                email: settings.data.email,
                website: settings.data.website,
                member_no_prefix: settings.data.member_no_prefix,
              }}
            />
          </SectionCard>
          <SectionCard title="Church logo" description="PNG or JPG, printed on certificates.">
            <LogoUpload logoUrl={logo?.data?.signedUrl ?? null} />
            <p className="mt-4 text-xs text-muted-foreground">Timezone: Asia/Manila · Currency: Philippine Peso (PHP)</p>
          </SectionCard>
        </div>
      )}

      {user.permissions.has("certificates.templates") && (
        <SectionCard title="Certificates" description="Certificate wording, layout and authorized signatories.">
          <Button variant="outline" asChild>
            <Link href="/certificates/templates">
              <LayoutTemplate /> Manage certificate templates
            </Link>
          </Button>
        </SectionCard>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canSettings && (
          <>
            <LookupList title="Membership statuses" description="Built-in statuses cannot be changed; you can add your own." table="membership_statuses" rows={statuses.data ?? []} canEdit />
            <LookupList title="Membership categories" description="Classifications such as regular or associate member." table="membership_categories" rows={categories.data ?? []} canEdit />
            <LookupList title="Ministries and departments" description="Groups members can be assigned to." table="ministries" rows={ministries.data ?? []} canEdit />
            <LookupList title="Services and activities" description="Types of attendance sessions." table="service_types" rows={serviceTypes.data ?? []} canEdit />
          </>
        )}
        {canFinance && financeCategories.data && (
          <LookupList title="Income and expense categories" description="Used when recording transactions." table="financial_categories" rows={financeCategories.data} canEdit />
        )}
      </div>
    </div>
  );
}

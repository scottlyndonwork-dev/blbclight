import { Award, Pencil, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import {
  AddMinistryDialog,
  ArchiveControls,
  BaptismDialog,
  ChangeStatusDialog,
  HouseholdDialog,
  LeaveHouseholdButton,
  PhotoControls,
  RemoveMinistryButton,
} from "@/features/members/components/profile-widgets";
import { CIVIL_STATUSES, HOUSEHOLD_RELATIONSHIPS } from "@/features/members/schemas";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ageOn, formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { getMember, getMemberLookups, getMemberProfileData } from "@/server/queries/members";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Member profile" };

type Params = Promise<{ id: string }>;

export default function MemberProfilePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <MemberProfile params={params} />
    </Suspense>
  );
}

const ATTENDANCE_LABEL = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" } as const;
const ATTENDANCE_TONE = { present: "green", late: "amber", excused: "blue", absent: "gray" } as const;
const CERT_STATUS = { issued: ["green", "Issued"], voided: ["red", "Voided"], replaced: ["slate", "Replaced"] } as const;

async function MemberProfile({ params }: { params: Params }) {
  const [{ user, allowed }, { id }] = await Promise.all([getUserWithAccess(["members.read"]), params]);
  if (!allowed) return <AccessDenied />;

  const member = await getMember(id);
  if (!member) notFound();

  const supabase = await createClient();
  const [profile, lookups, photo, qrSvg] = await Promise.all([
    getMemberProfileData(member.id, user.permissions),
    getMemberLookups(),
    member.photo_path ? supabase.storage.from("member-photos").createSignedUrl(member.photo_path, 600) : Promise.resolve(null),
    // The code holds only the member number, which is safe to print on an ID card.
    QRCode.toString(`LIGHT-MEMBER:${member.member_no}`, { type: "svg", margin: 1, width: 128, errorCorrectionLevel: "M" }),
  ]);

  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const archived = Boolean(member.archived_at);
  const fullName = [member.first_name, member.middle_name, member.last_name, member.suffix].filter(Boolean).join(" ");
  const status = member.membership_statuses;
  const baptism = member.baptism_records;
  const age = ageOn(member.birthdate);
  const address = [member.address_line, member.barangay, member.city, member.province, member.postal_code].filter(Boolean).join(", ");
  const photoUrl = photo && "data" in photo ? photo.data?.signedUrl : undefined;

  return (
    <>
      <PageHeader
        title={fullName}
        description={`Member ID ${member.member_no}`}
        breadcrumbs={[{ label: "Members", href: "/members" }, { label: fullName }]}
        actions={
          <>
            {!archived && can("certificates.issue") && (
              <Button variant="outline" asChild>
                <Link href={`/certificates/issue?member=${member.id}`}>
                  <Award /> Issue certificate
                </Link>
              </Button>
            )}
            {!archived && can("membership.status_change") && status && (
              <ChangeStatusDialog
                memberId={member.id}
                currentStatusId={status.id}
                statuses={lookups.statuses.filter((s) => s.is_active)}
              />
            )}
            {can("members.archive") && <ArchiveControls memberId={member.id} archived={archived} />}
            {!archived && can("members.write") && (
              <Button asChild>
                <Link href={`/members/${member.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
          </>
        }
      />

      {archived && (
        <Alert className="mb-4">
          <AlertDescription>
            This record was archived on {formatDateTime(member.archived_at)}. Reason: {member.archive_reason}
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-5 flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {photoUrl ? (
            // Private, signed URL: rendered directly so it is never stored in a shared image cache.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={`Photo of ${fullName}`} className="size-full object-cover" />
          ) : (
            <UserRound className="size-9 text-muted-foreground" />
          )}
        </div>
        <div className="grid flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Status">{status ? <StatusBadge tone={status.color}>{status.name}</StatusBadge> : "—"}</Info>
          <Info label="Category">{member.membership_categories?.name ?? "—"}</Info>
          <Info label="Member since">{formatDate(member.membership_date ?? member.date_registered)}</Info>
          <Info label="Baptized">{baptism ? (baptism.baptism_date ? formatDate(baptism.baptism_date) : "Yes") : "No"}</Info>
        </div>
        {!archived && can("members.write") && <PhotoControls memberId={member.id} hasPhoto={Boolean(member.photo_path)} />}
      </div>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personal">Personal Information</TabsTrigger>
            <TabsTrigger value="attendance">Attendance History</TabsTrigger>
            <TabsTrigger value="membership">Membership History</TabsTrigger>
            <TabsTrigger value="baptism">Baptism Records</TabsTrigger>
            <TabsTrigger value="certificates">Certificates</TabsTrigger>
            <TabsTrigger value="family">Family Information</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Summary">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Contact number">{member.contact_number ?? "—"}</Info>
              <Info label="Email">{member.email ?? "—"}</Info>
              <Info label="Age">{age !== null ? `${age} years` : "—"}</Info>
              <Info label="Date registered">{formatDate(member.date_registered)}</Info>
              <Info label="Previous church">{member.previous_church ?? "—"}</Info>
              <Info label="Household">{profile.household?.households?.name ?? "—"}</Info>
            </dl>
            {member.notes && <p className="mt-4 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{member.notes}</p>}
          </Panel>
          <Panel
            title="Ministries and departments"
            action={!archived && can("members.write") ? <AddMinistryDialog memberId={member.id} ministries={lookups.ministries.filter((m) => m.is_active)} /> : undefined}
          >
            {profile.ministries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not assigned to any ministry.</p>
            ) : (
              <ul className="divide-y text-sm">
                {profile.ministries.map((mm) => (
                  <li key={mm.id} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium">{mm.ministries?.name}</span>
                      {mm.role && <span className="text-muted-foreground"> · {mm.role}</span>}
                      {mm.start_date && <span className="block text-xs text-muted-foreground">Since {formatDate(mm.start_date)}</span>}
                    </span>
                    {!archived && can("members.write") && (
                      <RemoveMinistryButton memberId={member.id} assignmentId={mm.id} name={mm.ministries?.name ?? "ministry"} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Attendance QR code" description="Print or show this code to check in quickly at services.">
            <div className="flex items-center gap-4">
              <div className="size-32 shrink-0 rounded-md border bg-white p-1" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="text-sm">
                <p className="font-medium">{fullName}</p>
                <p className="font-mono text-muted-foreground">{member.member_no}</p>
              </div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="personal" className="mt-4">
          <Panel title="Personal information">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Info label="First name">{member.first_name}</Info>
              <Info label="Middle name">{member.middle_name ?? "—"}</Info>
              <Info label="Last name">{member.last_name}</Info>
              <Info label="Suffix">{member.suffix ?? "—"}</Info>
              <Info label="Gender">{member.gender ? (member.gender === "male" ? "Male" : "Female") : "—"}</Info>
              <Info label="Civil status">{CIVIL_STATUSES.find((c) => c.value === member.civil_status)?.label ?? "—"}</Info>
              <Info label="Birthdate">{member.birthdate ? `${formatDate(member.birthdate)}${age !== null ? ` (${age})` : ""}` : "—"}</Info>
              <Info label="Contact number">{member.contact_number ?? "—"}</Info>
              <Info label="Email">{member.email ?? "—"}</Info>
              <Info label="Address" className="sm:col-span-2 lg:col-span-3">{address || "—"}</Info>
              <Info label="Record created">
                {formatDateTime(member.created_at)}
                {member.created_by_profile?.full_name ? ` by ${member.created_by_profile.full_name}` : ""}
              </Info>
              <Info label="Last updated">
                {formatDateTime(member.updated_at)}
                {member.updated_by_profile?.full_name ? ` by ${member.updated_by_profile.full_name}` : ""}
              </Info>
            </dl>
          </Panel>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          {profile.attendance === null ? (
            <EmptyState title="Attendance is not available for your role" />
          ) : profile.attendance.length === 0 ? (
            <EmptyState title="No attendance recorded yet" />
          ) : (
            <Panel title="Attendance history" description="Most recent 100 records" flush>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.attendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/attendance/${a.attendance_sessions?.id}`} className="hover:underline">
                          {formatDate(a.attendance_sessions?.session_date)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {a.attendance_sessions?.title || a.attendance_sessions?.service_types?.name}
                        <span className="text-muted-foreground"> · {formatTime(a.attendance_sessions?.start_time)}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={ATTENDANCE_TONE[a.status]}>{ATTENDANCE_LABEL[a.status]}</StatusBadge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatDateTime(a.checked_in_at)}
                        {a.method === "qr" ? " · QR" : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="membership" className="mt-4">
          <Panel title="Membership status history" description="Every change is kept permanently." flush>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Previous</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="hidden lg:table-cell">Changed by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatDate(h.effective_date)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={h.status?.color}>{h.status?.name}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{h.previous?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{h.reason}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {h.changed_by_profile?.full_name ?? "System"}
                      <span className="block text-xs">{formatDateTime(h.created_at)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="baptism" className="mt-4">
          <Panel
            title="Baptism record"
            action={!archived && can("baptism.write") ? (
              <BaptismDialog
                memberId={member.id}
                initial={
                  baptism
                    ? {
                        baptism_date: baptism.baptism_date ?? "",
                        location: baptism.location ?? "",
                        officiant: baptism.officiant ?? "",
                        church_name: baptism.church_name ?? "",
                        notes: baptism.notes ?? "",
                      }
                    : null
                }
              />
            ) : undefined}
          >
            {baptism ? (
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Baptism date">{formatDate(baptism.baptism_date)}</Info>
                <Info label="Location">{baptism.location ?? "—"}</Info>
                <Info label="Officiated by">{baptism.officiant ?? "—"}</Info>
                <Info label="Church">{baptism.church_name ?? "This church"}</Info>
                {baptism.notes && <Info label="Notes" className="sm:col-span-2 lg:col-span-4">{baptism.notes}</Info>}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No baptism has been recorded for this member.</p>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="certificates" className="mt-4">
          {profile.certificates === null ? (
            <EmptyState title="Certificates are not available for your role" />
          ) : profile.certificates.length === 0 ? (
            <EmptyState
              title="No certificates issued"
              action={
                !archived && can("certificates.issue") ? (
                  <Button asChild>
                    <Link href={`/certificates/issue?member=${member.id}`}>Issue certificate</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Panel title="Certificates" flush>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.certificates.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/certificates/${c.id}`} className="font-mono text-xs hover:underline">
                          {c.reference_no}
                        </Link>
                      </TableCell>
                      <TableCell>{c.certificate_types?.name}</TableCell>
                      <TableCell>{formatDate(c.issued_on)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={CERT_STATUS[c.status][0]}>{CERT_STATUS[c.status][1]}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="family" className="mt-4">
          <Panel
            title={profile.household?.households?.name ?? "Family information"}
            description={profile.household?.households?.address ?? undefined}
            action={
              !archived && can("members.write") ? (
                <div className="flex gap-1">
                  {profile.household && <LeaveHouseholdButton memberId={member.id} />}
                  <HouseholdDialog memberId={member.id} defaultName={`${member.last_name} Family`} />
                </div>
              ) : undefined
            }
          >
            {!profile.household ? (
              <p className="text-sm text-muted-foreground">This member is not linked to a household.</p>
            ) : (
              <ul className="divide-y text-sm">
                {(profile.household.households?.household_members ?? []).map((hm) => (
                  <li key={hm.id} className="flex items-center justify-between py-2">
                    <Link href={`/members/${hm.members?.id}`} className={`hover:underline ${hm.members?.id === member.id ? "font-semibold" : ""}`}>
                      {hm.members?.first_name} {hm.members?.last_name} {hm.members?.suffix ?? ""}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{hm.members?.member_no}</span>
                    </Link>
                    <span className="text-muted-foreground">{HOUSEHOLD_RELATIONSHIPS.find((r) => r.value === hm.relationship)?.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Info({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Panel({
  title,
  description,
  action,
  children,
  flush,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-9 w-full max-w-2xl" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

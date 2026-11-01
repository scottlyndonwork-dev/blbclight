import { Pencil, Printer } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AttendanceRecorder } from "@/features/attendance/components/attendance-recorder";
import { SessionActions, VisitorsPanel } from "@/features/attendance/components/session-controls";
import { SessionDialog } from "@/features/attendance/components/session-dialog";
import { PrintButton } from "@/components/shared/print-button";
import { PageHeader } from "@/components/shared/page-header";
import { AccessDenied, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { getUserWithAccess } from "@/server/auth/session";
import { getServiceTypes, getSessionDetail } from "@/server/queries/attendance";

export const metadata: Metadata = { title: "Attendance session" };

type Params = Promise<{ sessionId: string }>;

export default function SessionPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
      <Session params={params} />
    </Suspense>
  );
}

async function Session({ params }: { params: Params }) {
  const [{ user, allowed }, { sessionId }] = await Promise.all([getUserWithAccess(["attendance.read", "attendance.write"]), params]);
  if (!allowed) return <AccessDenied />;
  const [detail, serviceTypes] = await Promise.all([getSessionDetail(sessionId), getServiceTypes()]);
  if (!detail) notFound();

  const { session, records, visitors, activeMembers } = detail;
  const canWrite = user.permissions.has("attendance.write");
  const canCorrect = user.permissions.has("attendance.correct");
  const name = session.title || session.service_types?.name || "Session";
  const isOpen = session.status === "open";

  return (
    <>
      <PageHeader
        title={name}
        description={
          <>
            {formatDate(session.session_date, "EEEE, MMMM d, yyyy")} · {formatTime(session.start_time)}
            {session.title && ` · ${session.service_types?.name}`}
          </>
        }
        breadcrumbs={[{ label: "Attendance", href: "/attendance" }, { label: `${name}, ${formatDate(session.session_date)}` }]}
        actions={
          <>
            <StatusBadge tone={isOpen ? "green" : "gray"} className="mr-1">
              {isOpen ? "Open" : `Closed${session.closed_at ? ` ${formatDateTime(session.closed_at, "MMM d, h:mm a")}` : ""}`}
            </StatusBadge>
            <PrintButton
              trigger={
                <Button variant="outline">
                  <Printer /> Print
                </Button>
              }
            />
            {isOpen && canWrite && (
              <SessionDialog
                serviceTypes={serviceTypes.filter((t) => t.is_active || t.id === session.service_type_id)}
                session={{
                  id: session.id,
                  service_type_id: session.service_type_id,
                  session_date: session.session_date,
                  start_time: session.start_time.slice(0, 5),
                  title: session.title ?? "",
                  notes: session.notes ?? "",
                }}
                trigger={
                  <Button variant="outline">
                    <Pencil /> Edit
                  </Button>
                }
              />
            )}
            <SessionActions sessionId={session.id} status={session.status} canWrite={canWrite} canCorrect={canCorrect} hasRecords={records.length > 0} />
          </>
        }
      />

      {detail.error && (
        <div className="mb-4">
          <ErrorState title="Part of this session could not be loaded" />
        </div>
      )}
      {session.notes && <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm">{session.notes}</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <AttendanceRecorder
          key={`${records.length}-${records[0]?.record_id ?? "none"}-${session.status}`}
          sessionId={session.id}
          open={isOpen}
          canWrite={canWrite}
          canCorrect={canCorrect}
          initialRecords={records}
          activeMembers={activeMembers}
        />
        <div className="space-y-4">
          <VisitorsPanel sessionId={session.id} visitors={visitors} canWrite={isOpen ? canWrite : canCorrect} />
          <p className="px-1 text-xs text-muted-foreground">
            Created {formatDateTime(session.created_at)}
            {session.created_by_profile?.full_name ? ` by ${session.created_by_profile.full_name}` : ""}.
            {session.closed_by_profile?.full_name ? ` Closed by ${session.closed_by_profile.full_name}.` : ""}
          </p>
        </div>
      </div>
    </>
  );
}

"use client";

import { Pencil, QrCode, Trash2, UserCheck } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MemberPicker } from "@/components/shared/member-picker";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime } from "@/lib/dates";
import type { MemberLookupResult } from "@/features/members/lookup-action";
import {
  correctAttendanceAction,
  recordAttendanceAction,
  removeAttendanceAction,
  type AttendanceStatus,
} from "../actions";
import { QrScanner } from "./qr-scanner";

export type AttendanceRow = {
  record_id: string;
  member_id: string;
  member_no: string;
  full_name: string;
  status: AttendanceStatus;
  method: "manual" | "qr" | "bulk";
  checked_in_at: string;
  correction_reason: string | null;
};

export const STATUS_LABEL: Record<AttendanceStatus, string> = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" };
const STATUS_TONE = { present: "green", late: "amber", excused: "blue", absent: "gray" } as const;

export function AttendanceRecorder({
  sessionId,
  open,
  canWrite,
  canCorrect,
  initialRecords,
  activeMembers,
}: {
  sessionId: string;
  open: boolean;
  canWrite: boolean;
  canCorrect: boolean;
  initialRecords: AttendanceRow[];
  activeMembers: number;
}) {
  const [records, setRecords] = useState<AttendanceRow[]>(initialRecords);
  const [entryStatus, setEntryStatus] = useState<"present" | "late">("present");
  const [filter, setFilter] = useState<AttendanceStatus | "all">("all");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const canRecord = open ? canWrite : canCorrect;

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    for (const r of records) c[r.status]++;
    return c;
  }, [records]);
  const attended = counts.present + counts.late;
  const percentage = activeMembers > 0 ? Math.round((attended / activeMembers) * 1000) / 10 : null;

  function upsertLocal(row: AttendanceRow) {
    setRecords((rs) => [row, ...rs.filter((r) => r.member_id !== row.member_id)]);
  }

  function record(member: MemberLookupResult) {
    startTransition(async () => {
      const result = await recordAttendanceAction(sessionId, member.id, entryStatus);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { created, previousStatus, status, recordId } = result.data;
      const existing = records.find((r) => r.member_id === member.id);
      if (!created && previousStatus === status) {
        toast.warning(`${member.full_name} is already recorded as ${STATUS_LABEL[status].toLowerCase()}.`);
        return;
      }
      upsertLocal({
        record_id: recordId,
        member_id: member.id,
        member_no: member.member_no,
        full_name: existing?.full_name ?? member.full_name,
        status,
        method: "manual",
        checked_in_at: existing?.checked_in_at ?? new Date().toISOString(),
        correction_reason: null,
      });
      if (created) toast.success(`${member.full_name} — ${STATUS_LABEL[status]}`, { duration: 1500 });
      else toast.info(`${member.full_name} changed from ${STATUS_LABEL[previousStatus ?? status].toLowerCase()} to ${STATUS_LABEL[status].toLowerCase()}.`);
    });
  }

  const visible = filter === "all" ? records : records.filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Counter label="Attended" value={attended} hint={percentage !== null ? `${percentage}% of ${activeMembers} active members` : undefined} strong />
        <Counter label="Present" value={counts.present} />
        <Counter label="Late" value={counts.late} />
        <Counter label="Excused" value={counts.excused} />
        <Counter label="Absent" value={counts.absent} />
      </div>

      {canRecord && (
        <section className="no-print rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="attendance-search">Record attendance</Label>
              <MemberPicker
                inputRef={inputRef}
                autoFocus
                clearOnSelect
                onSelect={record}
                placeholder="Type a name or member ID, then press Enter"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mark as</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={entryStatus}
                onValueChange={(v) => v && setEntryStatus(v as "present" | "late")}
              >
                <ToggleGroupItem value="present" className="px-4">
                  Present
                </ToggleGroupItem>
                <ToggleGroupItem value="late" className="px-4">
                  Late
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <QrScanner
              sessionId={sessionId}
              onRecorded={(row, created) => {
                if (created) upsertLocal(row);
              }}
              trigger={
                <Button variant="outline">
                  <QrCode /> Scan QR
                </Button>
              }
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {pending ? "Saving…" : "Each entry is saved immediately. A member can only be recorded once per session."}
          </p>
        </section>
      )}

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">
            Recorded attendance <span className="font-normal text-muted-foreground">({records.length})</span>
          </h2>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="no-print h-8 w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {visible.length === 0 ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <UserCheck className="size-4" /> No attendance recorded{filter !== "all" ? " with this status" : " yet"}.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Time</TableHead>
                {canRecord && <TableHead className="no-print w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.record_id}>
                  <TableCell>
                    <span className="font-medium">{r.full_name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{r.member_no}</span>
                    {r.correction_reason && <span className="block text-xs text-muted-foreground">Corrected: {r.correction_reason}</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDateTime(r.checked_in_at, "h:mm a")}
                    {r.method !== "manual" && <span className="ml-1 text-xs uppercase">· {r.method}</span>}
                  </TableCell>
                  {canRecord && (
                    <TableCell className="no-print text-right">
                      <CorrectDialog row={r} onSaved={(status, reason) => upsertLocal({ ...r, status, correction_reason: reason })} />
                      <ReasonDialog
                        trigger={
                          <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${r.full_name}`}>
                            <Trash2 className="size-4" />
                          </Button>
                        }
                        title={`Remove ${r.full_name}?`}
                        description="The entry will be deleted from this session. The removal and your reason are kept in the audit log."
                        confirmLabel="Remove entry"
                        successMessage="Attendance entry removed."
                        onConfirm={async (reason) => {
                          const result = await removeAttendanceAction(r.record_id, reason);
                          if (result.ok) setRecords((rs) => rs.filter((x) => x.record_id !== r.record_id));
                          return result;
                        }}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Counter({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${strong ? "border-primary/30 bg-accent" : "bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CorrectDialog({ row, onSaved }: { row: AttendanceRow; onSaved: (status: AttendanceStatus, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AttendanceStatus>(row.status);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    if (reason.trim().length < 3) {
      toast.error("Please give a reason for the correction.");
      return;
    }
    startTransition(async () => {
      const result = await correctAttendanceAction(row.record_id, status, reason.trim());
      if (result.ok) {
        toast.success(result.message);
        onSaved(status, reason.trim());
        setOpen(false);
        setReason("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" aria-label={`Correct ${row.full_name}`}>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct attendance</DialogTitle>
          <DialogDescription>
            {row.full_name} is recorded as {STATUS_LABEL[row.status].toLowerCase()}. Corrections are kept in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="correct-status">New status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger id="correct-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correct-reason">Reason</Label>
            <Textarea id="correct-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || status === row.status}>
            {pending ? "Saving…" : "Save correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Lock, LockOpen, Plus, Trash2, UserMinus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { MemberPicker } from "@/components/shared/member-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import type { MemberLookupResult } from "@/features/members/lookup-action";
import {
  addVisitorAction,
  deleteSessionAction,
  markRemainingAbsentAction,
  removeVisitorAction,
  setSessionStatusAction,
  type VisitorInput,
} from "../actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });
  }
  return { run, pending, router };
}

function Confirm({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SessionActions({
  sessionId,
  status,
  canWrite,
  canCorrect,
  hasRecords,
}: {
  sessionId: string;
  status: "open" | "closed";
  canWrite: boolean;
  canCorrect: boolean;
  hasRecords: boolean;
}) {
  const { run, pending, router } = useRun();
  const canEdit = status === "open" ? canWrite : canCorrect;
  return (
    <>
      {canEdit && (
        <Confirm
          trigger={
            <Button variant="outline" disabled={pending}>
              <UserMinus /> Mark rest absent
            </Button>
          }
          title="Mark everyone else absent?"
          description="All active members without an entry in this session will be recorded as absent. You can correct individual entries afterwards."
          confirmLabel="Mark absent"
          onConfirm={() => run(() => markRemainingAbsentAction(sessionId))}
        />
      )}
      {status === "open" && canWrite && (
        <Confirm
          trigger={
            <Button variant="outline" disabled={pending}>
              <Lock /> Close session
            </Button>
          }
          title="Close this session?"
          description="After closing, attendance can only be changed by users with correction permission, and every change is recorded."
          confirmLabel="Close session"
          onConfirm={() => run(() => setSessionStatusAction(sessionId, "closed"))}
        />
      )}
      {status === "closed" && canCorrect && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => setSessionStatusAction(sessionId, "open"))}>
          <LockOpen /> Reopen
        </Button>
      )}
      {!hasRecords && canCorrect && (
        <Confirm
          trigger={
            <Button variant="ghost" className="text-destructive" disabled={pending}>
              <Trash2 /> Delete
            </Button>
          }
          title="Delete this session?"
          description="The session has no attendance entries. It will be permanently removed."
          confirmLabel="Delete session"
          onConfirm={() => run(() => deleteSessionAction(sessionId), () => router.push("/attendance"))}
        />
      )}
    </>
  );
}

const emptyVisitor: VisitorInput = { full_name: "", contact_number: "", address: "", invited_by_member_id: "", is_first_time: true, notes: "" };

export function VisitorsPanel({
  sessionId,
  visitors,
  canWrite,
}: {
  sessionId: string;
  visitors: Array<{ id: string; full_name: string; contact_number: string | null; address: string | null; is_first_time: boolean; notes: string | null }>;
  canWrite: boolean;
}) {
  const { run, pending } = useRun();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<VisitorInput>(emptyVisitor);
  const [inviter, setInviter] = useState<MemberLookupResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          Visitors <span className="font-normal text-muted-foreground">({visitors.length})</span>
        </h2>
        {canWrite && (
          <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="no-print">
                <Plus /> Add visitor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record a visitor</DialogTitle>
                <DialogDescription>Visitors are recorded separately from members.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="v_name" label="Full name" required error={errors.full_name} className="sm:col-span-2">
                  <Input id="v_name" value={values.full_name} onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))} autoFocus />
                </FormField>
                <FormField id="v_contact" label="Contact number" error={errors.contact_number}>
                  <Input id="v_contact" type="tel" value={values.contact_number} onChange={(e) => setValues((v) => ({ ...v, contact_number: e.target.value }))} />
                </FormField>
                <FormField id="v_address" label="Address" error={errors.address}>
                  <Input id="v_address" value={values.address} onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))} />
                </FormField>
                <div className="space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Invited by (member)</span>
                  <MemberPicker
                    selected={inviter}
                    onSelect={(m) => {
                      setInviter(m);
                      setValues((v) => ({ ...v, invited_by_member_id: m.id }));
                    }}
                    onClear={() => {
                      setInviter(null);
                      setValues((v) => ({ ...v, invited_by_member_id: "" }));
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox checked={values.is_first_time} onCheckedChange={(c) => setValues((v) => ({ ...v, is_first_time: c === true }))} />
                  First-time visitor
                </label>
                <FormField id="v_notes" label="Notes" error={errors.notes} className="sm:col-span-2">
                  <Textarea id="v_notes" rows={2} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
                </FormField>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(
                      async () => {
                        const r = await addVisitorAction(sessionId, values);
                        if (!r.ok) setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
                        return r;
                      },
                      () => {
                        setOpen(false);
                        setValues(emptyVisitor);
                        setInviter(null);
                        setErrors({});
                      },
                    )
                  }
                >
                  {pending ? "Saving…" : "Save visitor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {visitors.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No visitors recorded.</p>
      ) : (
        <ul className="divide-y text-sm">
          {visitors.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
              <div>
                <p className="font-medium">
                  {v.full_name}
                  {v.is_first_time && <span className="ml-2 rounded bg-gold/15 px-1.5 py-0.5 text-xs text-gold-foreground dark:text-gold">First time</span>}
                </p>
                <p className="text-xs text-muted-foreground">{[v.contact_number, v.address].filter(Boolean).join(" · ") || "No contact details"}</p>
                {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
              </div>
              {canWrite && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="no-print size-7"
                  aria-label={`Remove ${v.full_name}`}
                  disabled={pending}
                  onClick={() => run(() => removeVisitorAction(sessionId, v.id))}
                >
                  <X className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

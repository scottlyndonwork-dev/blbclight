"use client";

import { Archive, Camera, Plus, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { ReasonDialog } from "@/components/shared/reason-dialog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { todayManila } from "@/lib/dates";
import {
  addMemberMinistryAction,
  archiveMemberAction,
  assignHouseholdAction,
  changeMemberStatusAction,
  leaveHouseholdAction,
  removeBaptismAction,
  removeMemberMinistryAction,
  removeMemberPhotoAction,
  restoreMemberAction,
  saveBaptismAction,
  searchHouseholdsAction,
  uploadMemberPhotoAction,
} from "../actions";
import { HOUSEHOLD_RELATIONSHIPS, type BaptismInput } from "../schemas";

type Option = { id: string; name: string };

/** Runs a server action, shows feedback, and refreshes server data on success. */
function useRunAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<ActionResult<T>>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }
  return { run, pending };
}

// ---------------------------------------------------------------------------

export function ChangeStatusDialog({
  memberId,
  currentStatusId,
  statuses,
  trigger,
}: {
  memberId: string;
  currentStatusId: string;
  statuses: Option[];
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [statusId, setStatusId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayManila());
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const { run, pending } = useRunAction();

  function submit() {
    run(
      async () => {
        const result = await changeMemberStatusAction({ member_id: memberId, status_id: statusId, effective_date: effectiveDate, reason });
        if (!result.ok) setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        return result;
      },
      () => {
        setOpen(false);
        setReason("");
        setStatusId("");
        setErrors({});
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <ShieldCheck /> Change status
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change membership status</DialogTitle>
          <DialogDescription>The previous status is kept in the membership history.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="new_status" label="New status" required error={errors.status_id}>
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger id="new_status" className="w-full">
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                {statuses
                  .filter((s) => s.id !== currentStatusId)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="effective_date" label="Effective date" required error={errors.effective_date}>
            <Input id="effective_date" type="date" value={effectiveDate} max={todayManila()} onChange={(e) => setEffectiveDate(e.target.value)} />
          </FormField>
          <FormField id="status_reason" label="Reason" required error={errors.reason}>
            <Textarea id="status_reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !statusId}>
            {pending ? "Saving…" : "Change status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function ArchiveControls({ memberId, archived }: { memberId: string; archived: boolean }) {
  const { run, pending } = useRunAction();
  if (archived) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => restoreMemberAction(memberId))}>
        <RotateCcw /> {pending ? "Restoring…" : "Restore record"}
      </Button>
    );
  }
  return (
    <ReasonDialog
      trigger={
        <Button variant="outline">
          <Archive /> Archive
        </Button>
      }
      title="Archive this member record?"
      description="Archived records are hidden from the directory, attendance and pickers, but nothing is deleted. You can restore the record later."
      confirmLabel="Archive record"
      onConfirm={(reason) => archiveMemberAction(memberId, reason)}
      successMessage="Member record archived."
    />
  );
}

// ---------------------------------------------------------------------------

export function PhotoControls({ memberId, hasPhoto }: { memberId: string; hasPhoto: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { run, pending } = useRunAction();

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("The photo must be 2 MB or smaller.");
      return;
    }
    const data = new FormData();
    data.set("photo", file);
    run(() => uploadMemberPhotoAction(memberId, data));
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button size="sm" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
        <Camera /> {pending ? "Uploading…" : hasPhoto ? "Change photo" : "Add photo"}
      </Button>
      {hasPhoto && (
        <Button size="sm" variant="ghost" disabled={pending} aria-label="Remove photo" onClick={() => run(() => removeMemberPhotoAction(memberId))}>
          <X />
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function BaptismDialog({ memberId, initial }: { memberId: string; initial: BaptismInput | null }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<BaptismInput>(
    initial ?? { baptism_date: "", location: "", officiant: "", church_name: "", notes: "" },
  );
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const { run, pending } = useRunAction();
  const set = (key: keyof BaptismInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <div className="flex gap-2">
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogTrigger asChild>
          <Button variant={initial ? "outline" : "default"}>{initial ? "Edit baptism record" : "Record baptism"}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{initial ? "Edit baptism record" : "Record baptism"}</DialogTitle>
            <DialogDescription>Leave the date blank if the person was baptized but the date is unknown.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="b_date" label="Baptism date" error={errors.baptism_date}>
              <Input id="b_date" type="date" max={todayManila()} value={values.baptism_date} onChange={set("baptism_date")} />
            </FormField>
            <FormField id="b_location" label="Location" error={errors.location}>
              <Input id="b_location" value={values.location} onChange={set("location")} />
            </FormField>
            <FormField id="b_officiant" label="Officiated by" error={errors.officiant}>
              <Input id="b_officiant" value={values.officiant} onChange={set("officiant")} />
            </FormField>
            <FormField id="b_church" label="Church where baptized" error={errors.church_name}>
              <Input id="b_church" value={values.church_name} onChange={set("church_name")} />
            </FormField>
            <FormField id="b_notes" label="Notes" error={errors.notes} className="sm:col-span-2">
              <Textarea id="b_notes" rows={2} value={values.notes} onChange={set("notes")} />
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
                    const r = await saveBaptismAction(memberId, values);
                    if (!r.ok) setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
                    return r;
                  },
                  () => setOpen(false),
                )
              }
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {initial && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-destructive">
              <Trash2 /> Remove
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove the baptism record?</AlertDialogTitle>
              <AlertDialogDescription>
                Use this only if the record was entered by mistake. A copy is kept in the audit log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => removeBaptismAction(memberId))}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AddMinistryDialog({ memberId, ministries }: { memberId: string; ministries: Option[] }) {
  const [open, setOpen] = useState(false);
  const [ministryId, setMinistryId] = useState("");
  const [role, setRole] = useState("");
  const [startDate, setStartDate] = useState("");
  const { run, pending } = useRunAction();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Add ministry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to a ministry</DialogTitle>
          <DialogDescription>Ministries are managed in Settings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="ministry" label="Ministry or department" required>
            <Select value={ministryId} onValueChange={setMinistryId}>
              <SelectTrigger id="ministry" className="w-full">
                <SelectValue placeholder={ministries.length ? "Select a ministry" : "No ministries configured"} />
              </SelectTrigger>
              <SelectContent>
                {ministries.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="ministry_role" label="Role" hint="For example: Member, Leader, Coordinator">
            <Input id="ministry_role" value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} />
          </FormField>
          <FormField id="ministry_start" label="Start date">
            <Input id="ministry_start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !ministryId}
            onClick={() =>
              run(
                () => addMemberMinistryAction(memberId, { ministry_id: ministryId, role, start_date: startDate }),
                () => {
                  setOpen(false);
                  setMinistryId("");
                  setRole("");
                  setStartDate("");
                },
              )
            }
          >
            {pending ? "Saving…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMinistryButton({ memberId, assignmentId, name }: { memberId: string; assignmentId: string; name: string }) {
  const { run, pending } = useRunAction();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      aria-label={`Remove from ${name}`}
      disabled={pending}
      onClick={() => run(() => removeMemberMinistryAction(memberId, assignmentId))}
    >
      <X className="size-4" />
    </Button>
  );
}

// ---------------------------------------------------------------------------

export function HouseholdDialog({ memberId, defaultName }: { memberId: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; address: string | null }>>([]);
  const [householdId, setHouseholdId] = useState("");
  const [name, setName] = useState(defaultName);
  const [address, setAddress] = useState("");
  const [relationship, setRelationship] = useState<(typeof HOUSEHOLD_RELATIONSHIPS)[number]["value"]>("other");
  const { run, pending } = useRunAction();
  const [searching, startSearch] = useTransition();

  function search(term: string) {
    setQuery(term);
    startSearch(async () => {
      const r = await searchHouseholdsAction(term);
      if (r.ok) setResults(r.data);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) search("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Set family
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Family / household</DialogTitle>
          <DialogDescription>Link this member to an existing household or create a new one.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>
            Existing household
          </Button>
          <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>
            New household
          </Button>
        </div>
        {mode === "existing" ? (
          <div className="space-y-2">
            <Input placeholder="Search household name" value={query} onChange={(e) => search(e.target.value)} />
            <ul className="max-h-48 divide-y overflow-auto rounded-md border text-sm">
              {results.length === 0 && <li className="p-3 text-muted-foreground">{searching ? "Searching…" : "No households found."}</li>}
              {results.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setHouseholdId(h.id)}
                    className={`w-full px-3 py-2 text-left hover:bg-accent ${householdId === h.id ? "bg-accent font-medium" : ""}`}
                  >
                    {h.name}
                    {h.address && <span className="block text-xs text-muted-foreground">{h.address}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="grid gap-3">
            <FormField id="hh_name" label="Household name" required>
              <Input id="hh_name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField id="hh_address" label="Address">
              <Input id="hh_address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </FormField>
          </div>
        )}
        <FormField id="relationship" label="Relationship in the household" required>
          <Select value={relationship} onValueChange={(v) => setRelationship(v as typeof relationship)}>
            <SelectTrigger id="relationship" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUSEHOLD_RELATIONSHIPS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || (mode === "existing" ? !householdId : !name.trim())}
            onClick={() =>
              run(
                () =>
                  assignHouseholdAction(
                    memberId,
                    mode === "existing" ? { mode, household_id: householdId, relationship } : { mode, name, address, relationship },
                  ),
                () => setOpen(false),
              )
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveHouseholdButton({ memberId }: { memberId: string }) {
  const { run, pending } = useRunAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => leaveHouseholdAction(memberId))}>
      Remove from household
    </Button>
  );
}

"use client";

import { CheckCircle2, FileText, Paperclip, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { todayManila } from "@/lib/dates";
import {
  deleteAttachmentAction,
  deleteDraftAction,
  getAttachmentUrlAction,
  postTransactionAction,
  reverseTransactionAction,
  uploadAttachmentAction,
} from "../actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, after?: (data: T) => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        if (after) after(r.data);
        else router.refresh();
      } else toast.error(r.error);
    });
  }
  return { run, pending, router };
}

export function PostButton({ id, summary }: { id: string; summary: string }) {
  const { run, pending } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={pending}>
          <CheckCircle2 /> Post
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Post this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            {summary}. Once posted it will be included in fund balances and reports, and it can no longer be edited or deleted, only reversed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => postTransactionAction(id))}>Post transaction</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const { run, pending, router } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Delete draft
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>The draft was never posted, so it does not affect any balance. The deletion is recorded in the audit log.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => deleteDraftAction(id), () => router.push("/finance/transactions"))}>Delete draft</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReverseDialog({ id, txnDate, summary }: { id: string; txnDate: string; summary: string }) {
  const { run, pending, router } = useRun();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayManila());

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Undo2 /> Reverse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this transaction</DialogTitle>
          <DialogDescription>
            {summary}. A reversal entry with the same amount is recorded to cancel it out. The original stays on record, marked as reversed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reversal_date">Reversal date</Label>
            <Input id="reversal_date" type="date" min={txnDate} max={todayManila()} value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">The reversal is reported in the period of this date.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reversal_reason">Reason</Label>
            <Textarea id="reversal_reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              run(
                () => reverseTransactionAction(id, reason.trim(), date),
                () => {
                  setOpen(false);
                  router.refresh();
                },
              )
            }
          >
            {pending ? "Reversing…" : "Reverse transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Attachments({
  transactionId,
  attachments,
  canUpload,
  canDelete,
}: {
  transactionId: string;
  attachments: Array<{ id: string; file_name: string; storage_path: string; size_bytes: number; created_at: string }>;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const { run, pending } = useRun();
  const inputRef = useRef<HTMLInputElement>(null);
  const [opening, startOpening] = useTransition();

  function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Attachments must be 10 MB or smaller.");
      return;
    }
    const data = new FormData();
    data.set("file", file);
    run(() => uploadAttachmentAction(transactionId, data));
    if (inputRef.current) inputRef.current.value = "";
  }

  function open(path: string) {
    startOpening(async () => {
      const r = await getAttachmentUrlAction(path);
      if (r.ok) window.open(r.data, "_blank", "noopener");
      else toast.error(r.error);
    });
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Supporting documents</h2>
        {canUpload && (
          <>
            <input ref={inputRef} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
              <Paperclip /> {pending ? "Uploading…" : "Attach file"}
            </Button>
          </>
        )}
      </div>
      {attachments.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No receipts or documents attached. PDF or images up to 10 MB.</p>
      ) : (
        <ul className="divide-y text-sm">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <button type="button" className="flex min-w-0 items-center gap-2 text-left text-primary hover:underline" disabled={opening} onClick={() => open(a.storage_path)}>
                <FileText className="size-4 shrink-0" />
                <span className="truncate">{a.file_name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{Math.ceil(a.size_bytes / 1024)} KB</span>
              </button>
              {canDelete && (
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${a.file_name}`} disabled={pending} onClick={() => run(() => deleteAttachmentAction(transactionId, a.id))}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

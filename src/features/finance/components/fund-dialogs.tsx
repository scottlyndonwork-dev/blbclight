"use client";

import { ArrowRightLeft, Pencil, Plus, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { todayManila } from "@/lib/dates";
import { createTransferAction, reverseTransferAction, saveFundAction } from "../actions";
import type { FundInput, TransferInput } from "../schemas";

type Option = { id: string; name: string };

function fieldErrors(fe?: Record<string, string[] | undefined>) {
  return Object.fromEntries(Object.entries(fe ?? {}).map(([k, v]) => [k, v?.[0]]));
}

export function TransferDialog({ funds }: { funds: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [values, setValues] = useState<TransferInput>({ from_fund_id: "", to_fund_id: "", amount: "", transfer_date: todayManila(), reason: "" });
  const set = <K extends keyof TransferInput>(k: K, v: TransferInput[K]) => setValues((s) => ({ ...s, [k]: v }));

  function save() {
    startTransition(async () => {
      const r = await createTransferAction(values);
      if (!r.ok) {
        setErrors(fieldErrors(r.fieldErrors));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      setValues({ from_fund_id: "", to_fund_id: "", amount: "", transfer_date: todayManila(), reason: "" });
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <ArrowRightLeft /> Allocate between funds
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Allocate between funds</DialogTitle>
          <DialogDescription>Moves part of a fund&apos;s balance to another fund. Total cash on hand does not change.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="from_fund" label="From fund" required error={errors.from_fund_id}>
            <Select value={values.from_fund_id} onValueChange={(v) => set("from_fund_id", v)}>
              <SelectTrigger id="from_fund" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="to_fund" label="To fund" required error={errors.to_fund_id}>
            <Select value={values.to_fund_id} onValueChange={(v) => set("to_fund_id", v)}>
              <SelectTrigger id="to_fund" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {funds
                  .filter((f) => f.id !== values.from_fund_id)
                  .map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="transfer_amount" label="Amount (PHP)" required error={errors.amount}>
            <Input id="transfer_amount" inputMode="decimal" value={values.amount} onChange={(e) => set("amount", e.target.value)} className="text-right tabular-nums" />
          </FormField>
          <FormField id="transfer_date" label="Date" required error={errors.transfer_date}>
            <Input id="transfer_date" type="date" max={todayManila()} value={values.transfer_date} onChange={(e) => set("transfer_date", e.target.value)} />
          </FormField>
          <FormField id="transfer_reason" label="Reason" required error={errors.reason} className="sm:col-span-2">
            <Textarea id="transfer_reason" rows={2} maxLength={500} value={values.reason} onChange={(e) => set("reason", e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Record allocation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseTransferButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <ReasonDialog
      trigger={
        <Button size="icon" variant="ghost" className="size-7" aria-label={`Reverse ${label}`}>
          <Undo2 className="size-4" />
        </Button>
      }
      title={`Reverse allocation ${label}?`}
      description="An opposite allocation is recorded today. The original stays on record."
      confirmLabel="Reverse allocation"
      successMessage="Allocation reversed."
      onConfirm={async (reason) => {
        const r = await reverseTransferAction(id, reason);
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

const emptyFund: FundInput = {
  code: "",
  name: "",
  description: "",
  is_restricted: true,
  opening_balance: "",
  opening_balance_date: "",
  is_active: true,
};

export function FundDialog({ fund }: { fund?: { id: string } & FundInput }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [values, setValues] = useState<FundInput>(fund ?? emptyFund);
  const set = <K extends keyof FundInput>(k: K, v: FundInput[K]) => setValues((s) => ({ ...s, [k]: v }));

  function save() {
    startTransition(async () => {
      const r = await saveFundAction(fund?.id ?? null, values);
      if (!r.ok) {
        setErrors(fieldErrors(r.fieldErrors));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {fund ? (
          <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${fund.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus /> New fund
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fund ? "Edit fund" : "New fund"}</DialogTitle>
          <DialogDescription>Opening balances record money held before LIGHT was used. Changes are audited.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fund_name" label="Fund name" required error={errors.name}>
            <Input id="fund_name" value={values.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <FormField id="fund_code" label="Short code" required error={errors.code} hint="e.g. BUILDING">
            <Input id="fund_code" value={values.code} maxLength={16} onChange={(e) => set("code", e.target.value.toUpperCase())} className="font-mono" />
          </FormField>
          <FormField id="fund_desc" label="Description" error={errors.description} className="sm:col-span-2">
            <Textarea id="fund_desc" rows={2} maxLength={500} value={values.description} onChange={(e) => set("description", e.target.value)} />
          </FormField>
          <FormField id="fund_opening" label="Opening balance (PHP)" error={errors.opening_balance}>
            <Input id="fund_opening" inputMode="decimal" value={values.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} className="text-right tabular-nums" />
          </FormField>
          <FormField id="fund_opening_date" label="Opening balance date" error={errors.opening_balance_date}>
            <Input id="fund_opening_date" type="date" value={values.opening_balance_date} onChange={(e) => set("opening_balance_date", e.target.value)} />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={values.is_restricted} onCheckedChange={(c) => set("is_restricted", c)} /> Designated for a specific purpose
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={values.is_active} onCheckedChange={(c) => set("is_active", c)} /> Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save fund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

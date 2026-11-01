"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField, FormSection } from "@/components/shared/form-field";
import { MemberPicker } from "@/components/shared/member-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayManila } from "@/lib/dates";
import { formatPeso, parseMoney, toDecimalString, validateAmount } from "@/lib/money";
import type { MemberLookupResult } from "@/features/members/lookup-action";
import { createTransactionAction, updateDraftAction } from "../actions";
import { PAYMENT_METHODS, type TransactionInput } from "../schemas";

type Option = { id: string; name: string };

export function TransactionForm({
  kind,
  funds,
  categories,
  canPost,
  draftId,
  initial,
  initialMember,
}: {
  kind: "income" | "expense";
  funds: Option[];
  categories: Option[];
  canPost: boolean;
  draftId?: string;
  initial?: TransactionInput;
  initialMember?: MemberLookupResult | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<TransactionInput>(
    initial ?? {
      kind,
      fund_id: funds[0]?.id ?? "",
      category_id: "",
      amount: "",
      txn_date: todayManila(),
      description: "",
      reference_no: "",
      payer_payee: "",
      member_id: "",
      payment_method: "cash",
    },
  );
  const [member, setMember] = useState<MemberLookupResult | null>(initialMember ?? null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof TransactionInput>(key: K, value: TransactionInput[K]) => setValues((v) => ({ ...v, [key]: value }));
  const amountError = values.amount ? validateAmount(values.amount) : null;
  const amountPreview = !amountError && values.amount ? formatPeso(toDecimalString(parseMoney(values.amount.replace(/[₱,\s]/g, "")) ?? 0n)) : null;

  function submit(post: boolean) {
    setFormError(null);
    startTransition(async () => {
      const result = draftId ? await updateDraftAction(draftId, values) : await createTransactionAction(values, post);
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      const id = draftId ?? (result.data && typeof result.data === "object" && "id" in result.data ? result.data.id : null);
      router.push(id ? `/finance/transactions/${id}` : "/finance/transactions");
    });
  }

  const label = kind === "income" ? "income" : "expense";

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(canPost && !draftId);
      }}
    >
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormSection title={kind === "income" ? "Income details" : "Expense details"}>
        <FormField id="amount" label="Amount (PHP)" required error={errors.amount ?? amountError ?? undefined} hint={amountPreview ?? "For example 1500 or 1,500.50"}>
          <Input id="amount" inputMode="decimal" autoComplete="off" value={values.amount} onChange={(e) => set("amount", e.target.value)} className="text-right font-medium tabular-nums" autoFocus />
        </FormField>
        <FormField id="txn_date" label="Date" required error={errors.txn_date}>
          <Input id="txn_date" type="date" max={todayManila()} value={values.txn_date} onChange={(e) => set("txn_date", e.target.value)} />
        </FormField>
        <FormField id="category" label="Category" required error={errors.category_id}>
          <Select value={values.category_id} onValueChange={(v) => set("category_id", v)}>
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="fund" label="Fund" required error={errors.fund_id}>
          <Select value={values.fund_id} onValueChange={(v) => set("fund_id", v)}>
            <SelectTrigger id="fund" className="w-full">
              <SelectValue placeholder="Select a fund" />
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
        <FormField id="payment_method" label="Payment method" error={errors.payment_method}>
          <Select value={values.payment_method} onValueChange={(v) => set("payment_method", v as TransactionInput["payment_method"])}>
            <SelectTrigger id="payment_method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="reference_no" label="Receipt / reference no." error={errors.reference_no} hint="OR number, check number, transfer reference">
          <Input id="reference_no" maxLength={80} value={values.reference_no} onChange={(e) => set("reference_no", e.target.value)} />
        </FormField>
        <FormField id="description" label="Description" required error={errors.description} className="sm:col-span-2 lg:col-span-3">
          <Textarea id="description" rows={2} maxLength={500} value={values.description} onChange={(e) => set("description", e.target.value)} />
        </FormField>
        <FormField id="payer_payee" label={kind === "income" ? "Received from" : "Paid to"} error={errors.payer_payee}>
          <Input id="payer_payee" maxLength={200} value={values.payer_payee} onChange={(e) => set("payer_payee", e.target.value)} />
        </FormField>
        {kind === "income" && (
          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Member (optional)</span>
            <MemberPicker
              selected={member}
              onSelect={(m) => {
                setMember(m);
                set("member_id", m.id);
                if (!values.payer_payee) set("payer_payee", m.full_name);
              }}
              onClear={() => {
                setMember(null);
                set("member_id", "");
              }}
            />
            <p className="text-xs text-muted-foreground">Link tithes and pledges to a member for giving records.</p>
          </div>
        )}
      </FormSection>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {draftId
            ? "Changes to a draft do not affect balances until it is posted."
            : canPost
              ? `Posting records the ${label} permanently. Posted entries cannot be edited, only reversed.`
              : `Your role can save drafts. A treasurer must post them before they count in balances.`}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          {draftId ? (
            <Button type="button" onClick={() => submit(false)} disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
          ) : (
            <>
              <Button type="button" variant={canPost ? "outline" : "default"} onClick={() => submit(false)} disabled={pending}>
                Save as draft
              </Button>
              {canPost && (
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : `Post ${label}`}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </form>
  );
}

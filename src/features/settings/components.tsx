"use client";

import { Pencil, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveChurchSettingsAction, saveLookupAction, uploadLogoAction, type LookupInput, type LookupTable, type SettingsInput } from "./actions";

export function ChurchSettingsForm({ initial, canEdit }: { initial: SettingsInput; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();
  const set = (k: keyof SettingsInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function save() {
    startTransition(async () => {
      const r = await saveChurchSettingsAction(values);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      setErrors({});
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="church_name" label="Church name" required error={errors.church_name} className="sm:col-span-2">
        <Input id="church_name" value={values.church_name} onChange={set("church_name")} disabled={!canEdit} />
      </FormField>
      <FormField id="short_name" label="Short name" error={errors.short_name}>
        <Input id="short_name" value={values.short_name} onChange={set("short_name")} disabled={!canEdit} />
      </FormField>
      <FormField id="member_no_prefix" label="Member ID prefix" error={errors.member_no_prefix} hint="Used for new member IDs, e.g. LGT-2026-00001">
        <Input id="member_no_prefix" value={values.member_no_prefix} maxLength={6} onChange={set("member_no_prefix")} disabled={!canEdit} className="font-mono uppercase" />
      </FormField>
      <FormField id="address" label="Address" error={errors.address} className="sm:col-span-2">
        <Input id="address" value={values.address} onChange={set("address")} disabled={!canEdit} />
      </FormField>
      <FormField id="contact_number" label="Contact number" error={errors.contact_number}>
        <Input id="contact_number" value={values.contact_number} onChange={set("contact_number")} disabled={!canEdit} />
      </FormField>
      <FormField id="church_email" label="Email" error={errors.email}>
        <Input id="church_email" type="email" value={values.email} onChange={set("email")} disabled={!canEdit} />
      </FormField>
      <FormField id="website" label="Website" error={errors.website} className="sm:col-span-2">
        <Input id="website" value={values.website} onChange={set("website")} disabled={!canEdit} />
      </FormField>
      {canEdit && (
        <div className="flex justify-end sm:col-span-2">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function LogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 items-center justify-center overflow-hidden rounded-md border bg-white">
        {/* Private signed URL; not passed through the shared image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl ? <img src={logoUrl} alt="Church logo" className="size-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const data = new FormData();
          data.set("logo", file);
          startTransition(async () => {
            const r = await uploadLogoAction(data);
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            } else toast.error(r.error);
          });
          e.target.value = "";
        }}
      />
      <Button variant="outline" disabled={pending} onClick={() => ref.current?.click()}>
        <Upload /> {pending ? "Uploading…" : "Upload logo"}
      </Button>
    </div>
  );
}

export type LookupRow = {
  id: string;
  name: string;
  is_active: boolean;
  is_system?: boolean;
  default_start_time?: string | null;
  counts_as_active?: boolean;
  color?: string;
  kind?: "income" | "expense";
};

const COLORS = ["green", "gray", "amber", "blue", "red", "slate"] as const;

function LookupDialog({ table, row, trigger }: { table: LookupTable; row?: LookupRow; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<LookupInput>({
    name: row?.name ?? "",
    is_active: row?.is_active ?? true,
    default_start_time: row?.default_start_time?.slice(0, 5) ?? "",
    counts_as_active: row?.counts_as_active ?? false,
    color: (row?.color as LookupInput["color"]) ?? "gray",
    kind: row?.kind ?? "income",
  });

  function save() {
    startTransition(async () => {
      const r = await saveLookupAction(table, row?.id ?? null, values);
      if (!r.ok) {
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${row.name}` : "Add entry"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="lookup_name" label="Name" required>
            <Input id="lookup_name" value={values.name} maxLength={120} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
          </FormField>
          {table === "service_types" && (
            <FormField id="lookup_time" label="Usual start time">
              <Input id="lookup_time" type="time" value={values.default_start_time} onChange={(e) => setValues((v) => ({ ...v, default_start_time: e.target.value }))} />
            </FormField>
          )}
          {table === "financial_categories" && !row && (
            <FormField id="lookup_kind" label="Type">
              <Select value={values.kind} onValueChange={(k) => setValues((v) => ({ ...v, kind: k as "income" | "expense" }))}>
                <SelectTrigger id="lookup_kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
          {table === "membership_statuses" && (
            <>
              <FormField id="lookup_color" label="Badge color">
                <Select value={values.color} onValueChange={(c) => setValues((v) => ({ ...v, color: c as LookupInput["color"] }))}>
                  <SelectTrigger id="lookup_color" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <StatusBadge tone={c}>{c}</StatusBadge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={values.counts_as_active} onCheckedChange={(c) => setValues((v) => ({ ...v, counts_as_active: c }))} />
                Count as an active member in statistics
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={values.is_active} onCheckedChange={(c) => setValues((v) => ({ ...v, is_active: c }))} /> Available for selection
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !values.name.trim()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LookupList({ title, description, table, rows, canEdit }: { title: string; description: string; table: LookupTable; rows: LookupRow[]; canEdit: boolean }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {canEdit && (
          <LookupDialog
            table={table}
            trigger={
              <Button size="sm" variant="outline">
                <Plus /> Add
              </Button>
            }
          />
        )}
      </div>
      <ul className="divide-y text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2">
            <span className={r.is_active ? "" : "text-muted-foreground line-through"}>
              {r.color ? <StatusBadge tone={r.color}>{r.name}</StatusBadge> : r.name}
              {r.kind && <span className="ml-2 text-xs text-muted-foreground">{r.kind}</span>}
              {r.default_start_time && <span className="ml-2 text-xs text-muted-foreground">{r.default_start_time.slice(0, 5)}</span>}
              {r.is_system && <span className="ml-2 text-xs text-muted-foreground">built-in</span>}
            </span>
            {canEdit && !r.is_system && (
              <LookupDialog
                table={table}
                row={r}
                trigger={
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${r.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

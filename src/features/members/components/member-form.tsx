"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { FormField, FormSection } from "@/components/shared/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/dates";
import {
  findDuplicatesAction,
  registerMemberAction,
  updateMemberAction,
  type DuplicateCandidate,
} from "../actions";
import { CIVIL_STATUSES, GENDERS, memberCreateSchema, type MemberCreateInput } from "../schemas";

type Option = { id: string; name: string };

const NONE = "__none__";

export function MemberForm({
  mode,
  memberId,
  defaultValues,
  statuses,
  categories,
  canRecordBaptism,
}: {
  mode: "create" | "edit";
  memberId?: string;
  defaultValues: MemberCreateInput;
  statuses: Option[];
  categories: Option[];
  canRecordBaptism: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [duplicatesAcknowledged, setDuplicatesAcknowledged] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<MemberCreateInput>({
    resolver: zodResolver(memberCreateSchema),
    defaultValues,
    mode: "onTouched",
  });
  const { register, control, handleSubmit, formState, setError, getValues } = form;
  const errors = formState.errors;
  const isBaptized = useWatch({ control, name: "is_baptized" });

  async function checkDuplicates() {
    const v = getValues();
    if (!v.first_name || !v.last_name) return;
    const result = await findDuplicatesAction({
      first_name: v.first_name,
      last_name: v.last_name,
      birthdate: v.birthdate,
      email: v.email,
      contact_number: v.contact_number,
      exclude_id: memberId,
    });
    if (result.ok) {
      setDuplicates(result.data);
      setDuplicatesAcknowledged(false);
    }
  }

  const onSubmit = handleSubmit((values) => {
    if (mode === "create" && duplicates.length > 0 && !duplicatesAcknowledged) {
      setFormError("Possible duplicate records were found. Review them below and confirm before saving.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      if (mode === "create") {
        const result = await registerMemberAction(values);
        if (!result.ok) {
          applyErrors(result.fieldErrors);
          setFormError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success(result.message);
        router.push(`/members/${result.data.id}`);
      } else if (memberId) {
        const { status_id: _s, is_baptized: _b, baptism: _bp, ...update } = values;
        const result = await updateMemberAction(memberId, update);
        if (!result.ok) {
          applyErrors(result.fieldErrors);
          setFormError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success(result.message);
        router.push(`/members/${memberId}`);
      }
    });
  });

  function applyErrors(fieldErrors?: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors ?? {})) {
      if (messages?.[0]) setError(field as FieldPath<MemberCreateInput>, { message: messages[0] });
    }
  }

  const err = (name: keyof MemberCreateInput) => {
    const e = errors[name];
    return e && "message" in e ? (e.message as string | undefined) : undefined;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <FormSection title="Personal information">
        <FormField id="first_name" label="First name" required error={err("first_name")}>
          <Input id="first_name" autoComplete="off" {...register("first_name", { onBlur: checkDuplicates })} aria-invalid={Boolean(err("first_name"))} />
        </FormField>
        <FormField id="middle_name" label="Middle name" error={err("middle_name")}>
          <Input id="middle_name" autoComplete="off" {...register("middle_name")} />
        </FormField>
        <FormField id="last_name" label="Last name" required error={err("last_name")}>
          <Input id="last_name" autoComplete="off" {...register("last_name", { onBlur: checkDuplicates })} aria-invalid={Boolean(err("last_name"))} />
        </FormField>
        <FormField id="suffix" label="Suffix" hint="Jr., Sr., III" error={err("suffix")}>
          <Input id="suffix" autoComplete="off" {...register("suffix")} />
        </FormField>
        <FormField id="gender" label="Gender" error={err("gender")}>
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  {GENDERS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="civil_status" label="Civil status" error={err("civil_status")}>
          <Controller
            control={control}
            name="civil_status"
            render={({ field }) => (
              <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                <SelectTrigger id="civil_status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  {CIVIL_STATUSES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField id="birthdate" label="Birthdate" error={err("birthdate")}>
          <Input id="birthdate" type="date" {...register("birthdate", { onBlur: checkDuplicates })} />
        </FormField>
      </FormSection>

      <FormSection title="Contact and address">
        <FormField id="contact_number" label="Contact number" error={err("contact_number")}>
          <Input id="contact_number" type="tel" inputMode="tel" placeholder="0917 123 4567" {...register("contact_number", { onBlur: checkDuplicates })} />
        </FormField>
        <FormField id="email" label="Email address" error={err("email")}>
          <Input id="email" type="email" {...register("email", { onBlur: checkDuplicates })} />
        </FormField>
        <FormField id="address_line" label="House no. / street" error={err("address_line")}>
          <Input id="address_line" {...register("address_line")} />
        </FormField>
        <FormField id="barangay" label="Barangay" error={err("barangay")}>
          <Input id="barangay" {...register("barangay")} />
        </FormField>
        <FormField id="city" label="City / municipality" error={err("city")}>
          <Input id="city" {...register("city")} />
        </FormField>
        <FormField id="province" label="Province" error={err("province")}>
          <Input id="province" {...register("province")} />
        </FormField>
        <FormField id="postal_code" label="Postal code" error={err("postal_code")}>
          <Input id="postal_code" inputMode="numeric" maxLength={4} {...register("postal_code")} />
        </FormField>
      </FormSection>

      <FormSection title="Church information">
        <FormField id="date_registered" label="Date registered" required error={err("date_registered")}>
          <Input id="date_registered" type="date" {...register("date_registered")} />
        </FormField>
        <FormField id="membership_date" label="Membership date" hint="When the person was received as a member" error={err("membership_date")}>
          <Input id="membership_date" type="date" {...register("membership_date")} />
        </FormField>
        <FormField id="category_id" label="Membership category" error={err("category_id")}>
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                <SelectTrigger id="category_id" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        {mode === "create" && (
          <FormField id="status_id" label="Membership status" required error={err("status_id")}>
            <Controller
              control={control}
              name="status_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status_id" className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        )}
        <FormField id="previous_church" label="Previous church" error={err("previous_church")}>
          <Input id="previous_church" {...register("previous_church")} />
        </FormField>
        <FormField id="notes" label="Notes" error={err("notes")} className="sm:col-span-2 lg:col-span-3">
          <Textarea id="notes" rows={3} {...register("notes")} />
        </FormField>
      </FormSection>

      {mode === "create" && canRecordBaptism && (
        <section className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Controller
              control={control}
              name="is_baptized"
              render={({ field }) => (
                <Checkbox id="is_baptized" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
              )}
            />
            <label htmlFor="is_baptized" className="text-sm font-semibold">
              This person has been baptized
            </label>
          </div>
          {isBaptized && (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField id="baptism_date" label="Baptism date" error={errors.baptism?.baptism_date?.message}>
                <Input id="baptism_date" type="date" {...register("baptism.baptism_date")} />
              </FormField>
              <FormField id="baptism_location" label="Location" error={errors.baptism?.location?.message}>
                <Input id="baptism_location" {...register("baptism.location")} />
              </FormField>
              <FormField id="baptism_officiant" label="Officiated by" error={errors.baptism?.officiant?.message}>
                <Input id="baptism_officiant" {...register("baptism.officiant")} />
              </FormField>
              <FormField id="baptism_church" label="Church where baptized" hint="Leave blank if baptized in this church" error={errors.baptism?.church_name?.message}>
                <Input id="baptism_church" {...register("baptism.church_name")} />
              </FormField>
            </div>
          )}
        </section>
      )}

      {duplicates.length > 0 && (
        <Alert className="border-warning/40 bg-warning/5">
          <AlertTriangle className="text-warning" />
          <AlertTitle>Possible duplicate registration</AlertTitle>
          <AlertDescription>
            <p>These existing records look similar. Please check before saving:</p>
            <ul className="mt-2 space-y-1">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <Link href={`/members/${d.id}`} target="_blank" className="font-medium text-primary hover:underline">
                    {d.full_name}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    ({d.member_no}
                    {d.birthdate ? `, born ${formatDate(d.birthdate)}` : ""}) — {d.reason}
                  </span>
                </li>
              ))}
            </ul>
            {mode === "create" && (
              <label className="mt-3 flex items-center gap-2 font-medium text-foreground">
                <Checkbox checked={duplicatesAcknowledged} onCheckedChange={(c) => setDuplicatesAcknowledged(c === true)} />
                I have checked these records and this is a different person.
              </label>
            )}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Personal information is collected for church records and handled in accordance with the Data Privacy Act of 2012 (RA 10173).
      </p>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Register member" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

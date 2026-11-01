"use client";

import { Eye, FileCheck2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { MemberPicker } from "@/components/shared/member-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayManila } from "@/lib/dates";
import type { MemberLookupResult } from "@/features/members/lookup-action";
import { issueCertificateAction, previewCertificateAction } from "../actions";
import type { TemplateField } from "../template";

export type IssueTemplate = {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  requiresMember: boolean;
  isDefault: boolean;
  fields: TemplateField[];
};

export type IssueDefaults = {
  templateId?: string;
  member?: MemberLookupResult | null;
  recipientName?: string;
  fieldValues?: Record<string, string>;
  signatoryIds?: string[];
  replaces?: { id: string; referenceNo: string } | null;
};

export function IssueForm({
  templates,
  signatories,
  defaults,
}: {
  templates: IssueTemplate[];
  signatories: Array<{ id: string; full_name: string; title: string }>;
  defaults: IssueDefaults;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(defaults.templateId ?? templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? "");
  const [member, setMember] = useState<MemberLookupResult | null>(defaults.member ?? null);
  const [recipientName, setRecipientName] = useState(defaults.recipientName ?? "");
  const [issuedOn, setIssuedOn] = useState(todayManila());
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(defaults.fieldValues ?? {});
  const [signatoryIds, setSignatoryIds] = useState<string[]>(defaults.signatoryIds ?? (signatories[0] ? [signatories[0].id] : []));
  const [replaceReason, setReplaceReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.id === templateId);
  const grouped = useMemo(() => {
    const map = new Map<string, IssueTemplate[]>();
    for (const t of templates) map.set(t.typeName, [...(map.get(t.typeName) ?? []), t]);
    return [...map.entries()];
  }, [templates]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const input = () => ({
    template_id: templateId,
    member_id: member?.id ?? null,
    recipient_name: recipientName,
    issued_on: issuedOn,
    field_values: fieldValues,
    signatory_ids: signatoryIds,
    replaces_certificate_id: defaults.replaces?.id ?? null,
    replace_reason: defaults.replaces ? replaceReason : undefined,
  });

  function preview() {
    setError(null);
    startTransition(async () => {
      const result = await previewCertificateAction(input());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.data.pdfBase64), (c) => c.charCodeAt(0));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    });
  }

  function issue() {
    setError(null);
    startTransition(async () => {
      const result = await issueCertificateAction(input());
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.push(`/certificates/${result.data.id}`);
    });
  }

  const memberRequired = template?.requiresMember ?? true;
  const ready = Boolean(template) && signatoryIds.length > 0 && (!memberRequired || member) && (!defaults.replaces || replaceReason.trim().length >= 3);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {defaults.replaces && (
          <Alert>
            <AlertDescription>
              You are issuing a replacement for <span className="font-mono font-medium">{defaults.replaces.referenceNo}</span>. The original will be marked as
              replaced and will no longer verify as valid.
            </AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
          <FormField id="template" label="Certificate" required className="sm:col-span-2">
            <Select value={templateId} onValueChange={setTemplateId} disabled={Boolean(defaults.replaces)}>
              <SelectTrigger id="template" className="w-full">
                <SelectValue placeholder="Select a certificate template" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([typeName, list]) => (
                  <SelectGroup key={typeName}>
                    <SelectLabel>{typeName}</SelectLabel>
                    {list.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">
              Member{memberRequired && <span className="text-destructive"> *</span>}
            </span>
            <MemberPicker selected={member} onSelect={setMember} onClear={() => setMember(null)} />
            {!memberRequired && <p className="text-xs text-muted-foreground">Optional for this certificate. Leave empty for a non-member recipient.</p>}
          </div>

          <FormField
            id="recipient"
            label="Name printed on the certificate"
            required={!member}
            hint={member ? "Leave blank to use the member's full name as recorded." : undefined}
            className="sm:col-span-2"
          >
            <Input id="recipient" value={recipientName} maxLength={200} onChange={(e) => setRecipientName(e.target.value)} />
          </FormField>

          <FormField id="issued_on" label="Date of issuance" required>
            <Input id="issued_on" type="date" max={todayManila()} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </FormField>

          {template?.fields.map((f) => (
            <FormField key={f.key} id={`field_${f.key}`} label={f.label} required={f.required}>
              <Input
                id={`field_${f.key}`}
                type={f.type === "date" ? "date" : "text"}
                maxLength={300}
                value={fieldValues[f.key] ?? ""}
                onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </FormField>
          ))}

          {defaults.replaces && (
            <FormField id="replace_reason" label="Reason for replacement" required className="sm:col-span-2">
              <Textarea id="replace_reason" rows={2} maxLength={500} value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)} />
            </FormField>
          )}
        </section>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={preview} disabled={pending || !template}>
            <Eye /> {pending ? "Working…" : "Preview"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={pending || !ready}>
                <FileCheck2 /> Issue certificate
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Issue this certificate?</AlertDialogTitle>
                <AlertDialogDescription>
                  A reference number will be assigned and the certificate becomes part of the permanent record. Issued certificates cannot be edited, only
                  voided or replaced. Preview it first if you have not.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={issue}>Issue certificate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <aside className="h-fit rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Authorized signatories</h2>
        <p className="mb-3 text-xs text-muted-foreground">Select up to four, in signing order.</p>
        {signatories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signatories configured. Add them under Certificate templates.</p>
        ) : (
          <ul className="space-y-2">
            {signatories.map((s) => {
              const checked = signatoryIds.includes(s.id);
              return (
                <li key={s.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      disabled={!checked && signatoryIds.length >= 4}
                      onCheckedChange={(c) => setSignatoryIds((ids) => (c === true ? [...ids, s.id] : ids.filter((x) => x !== s.id)))}
                    />
                    <span>
                      <span className="font-medium">{s.full_name}</span>
                      <span className="block text-xs text-muted-foreground">{s.title}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <Dialog open={Boolean(previewUrl)} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-5xl sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Certificate preview</DialogTitle>
          </DialogHeader>
          {previewUrl && <iframe src={previewUrl} title="Certificate preview" className="h-[70vh] w-full rounded-md border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

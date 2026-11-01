"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveSignatoryAction, saveTemplateAction, type TemplateInput } from "../actions";
import { BUILT_IN_PLACEHOLDERS, placeholdersIn, type TemplateField } from "../template";

const blankTemplate = (typeId: string): TemplateInput => ({
  type_id: typeId,
  name: "",
  title: "",
  subtitle: "",
  body: "{{full_name}}\n\n",
  footer_text: "",
  fields: [],
  orientation: "landscape",
  show_qr: true,
  is_default: false,
  is_active: true,
});

export function TemplateDialog({
  types,
  templateId,
  initial,
  trigger,
}: {
  types: Array<{ id: string; name: string }>;
  templateId?: string;
  initial?: TemplateInput;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<TemplateInput>(initial ?? blankTemplate(types[0]?.id ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof TemplateInput>(key: K, value: TemplateInput[K]) => setValues((v) => ({ ...v, [key]: value }));

  const knownKeys = new Set<string>([...BUILT_IN_PLACEHOLDERS.map((p) => p.key), ...values.fields.map((f) => f.key)]);
  const unknown = placeholdersIn(values.body).filter((k) => !knownKeys.has(k));

  function insertPlaceholder(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return set("body", values.body + token);
    const start = el.selectionStart ?? values.body.length;
    const end = el.selectionEnd ?? start;
    set("body", values.body.slice(0, start) + token + values.body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function updateField(index: number, patch: Partial<TemplateField>) {
    set(
      "fields",
      values.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveTemplateAction(templateId ?? null, values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{templateId ? "Edit template" : "New certificate template"}</DialogTitle>
          <DialogDescription>Changes apply to certificates issued from now on. Issued certificates keep their original wording.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="t_type" label="Certificate type" required>
            <Select value={values.type_id} onValueChange={(v) => set("type_id", v)} disabled={Boolean(templateId)}>
              <SelectTrigger id="t_type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="t_name" label="Template name" required hint="Shown to staff when issuing">
            <Input id="t_name" value={values.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
          </FormField>
          <FormField id="t_title" label="Certificate title" required>
            <Input id="t_title" value={values.title} maxLength={150} onChange={(e) => set("title", e.target.value)} />
          </FormField>
          <FormField id="t_subtitle" label="Opening line" hint="For example: This is to certify that">
            <Input id="t_subtitle" value={values.subtitle} maxLength={200} onChange={(e) => set("subtitle", e.target.value)} />
          </FormField>
          <FormField
            id="t_body"
            label="Certificate wording"
            required
            className="sm:col-span-2"
            hint="The first line is printed large as the recipient's name. Click a placeholder below to insert it."
            error={unknown.length ? `Unknown placeholders: ${unknown.join(", ")}. Add them as custom fields or remove them.` : undefined}
          >
            <Textarea id="t_body" ref={bodyRef} rows={6} maxLength={4000} value={values.body} onChange={(e) => set("body", e.target.value)} className="font-mono text-sm" />
          </FormField>
          <div className="flex flex-wrap gap-1 sm:col-span-2">
            {[...BUILT_IN_PLACEHOLDERS, ...values.fields.filter((f) => f.key).map((f) => ({ key: f.key, label: f.label }))].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => insertPlaceholder(p.key)}
                className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs hover:border-primary"
                title={p.label}
              >
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
          <FormField id="t_footer" label="Footer text" hint="Optional verse or note" className="sm:col-span-2">
            <Textarea id="t_footer" rows={2} maxLength={500} value={values.footer_text} onChange={(e) => set("footer_text", e.target.value)} />
          </FormField>

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Custom fields</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={values.fields.length >= 12}
                onClick={() => set("fields", [...values.fields, { key: "", label: "", type: "text", required: true }])}
              >
                <Plus /> Add field
              </Button>
            </div>
            {values.fields.length === 0 && <p className="text-xs text-muted-foreground">No custom fields. Member details are filled automatically.</p>}
            {values.fields.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_110px_auto_auto] items-center gap-2">
                <Input
                  aria-label="Field key"
                  placeholder="key (e.g. spouse_name)"
                  value={f.key}
                  onChange={(e) => updateField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                  className="font-mono text-xs"
                />
                <Input aria-label="Field label" placeholder="Label" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                <Select value={f.type} onValueChange={(v) => updateField(i, { type: v as TemplateField["type"] })}>
                  <SelectTrigger aria-label="Field type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox checked={f.required} onCheckedChange={(c) => updateField(i, { required: c === true })} /> Required
                </label>
                <Button type="button" size="icon" variant="ghost" aria-label="Remove field" onClick={() => set("fields", values.fields.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <FormField id="t_orientation" label="Page orientation">
            <Select value={values.orientation} onValueChange={(v) => set("orientation", v as TemplateInput["orientation"])}>
              <SelectTrigger id="t_orientation" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">Landscape</SelectItem>
                <SelectItem value="portrait">Portrait</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="space-y-2 pt-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={values.show_qr} onCheckedChange={(c) => set("show_qr", c)} /> Print verification QR code
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={values.is_default} onCheckedChange={(c) => set("is_default", c)} /> Default template for this type
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={values.is_active} onCheckedChange={(c) => set("is_active", c)} /> Active
            </label>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || unknown.length > 0}>
            {pending ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SignatoryDialog({
  signatory,
}: {
  signatory?: { id: string; full_name: string; title: string; is_active: boolean; has_signature: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(signatory?.is_active ?? true);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveSignatoryAction(signatory?.id ?? null, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {signatory ? (
          <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${signatory.full_name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus /> Add signatory
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{signatory ? "Edit signatory" : "Add signatory"}</DialogTitle>
          <DialogDescription>Authorized persons who sign certificates. A signature image is optional.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          <FormField id="s_name" label="Full name" required>
            <Input id="s_name" name="full_name" defaultValue={signatory?.full_name} maxLength={150} required />
          </FormField>
          <FormField id="s_title" label="Title / position" required hint="For example: Senior Pastor">
            <Input id="s_title" name="title" defaultValue={signatory?.title} maxLength={150} required />
          </FormField>
          <FormField id="s_signature" label="Signature image" hint={signatory?.has_signature ? "A signature is on file. Upload a new one to replace it." : "PNG with a transparent background works best. Max 1 MB."}>
            <Input id="s_signature" name="signature" type="file" accept="image/png,image/jpeg" />
          </FormField>
          <input type="hidden" name="is_active" value={String(active)} />
          {signatory && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} />
              Active (can be selected when issuing)
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

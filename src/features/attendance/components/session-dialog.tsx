"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayManila } from "@/lib/dates";
import { createSessionAction, updateSessionAction, type SessionInput } from "../actions";

type ServiceType = { id: string; name: string; default_start_time: string | null };

export function SessionDialog({
  serviceTypes,
  session,
  trigger,
}: {
  serviceTypes: ServiceType[];
  session?: { id: string } & SessionInput;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [values, setValues] = useState<SessionInput>(
    session ?? {
      service_type_id: serviceTypes[0]?.id ?? "",
      session_date: todayManila(),
      start_time: serviceTypes[0]?.default_start_time?.slice(0, 5) ?? "09:00",
      title: "",
      notes: "",
    },
  );

  function pickType(id: string) {
    const type = serviceTypes.find((t) => t.id === id);
    setValues((v) => ({ ...v, service_type_id: id, start_time: session ? v.start_time : (type?.default_start_time?.slice(0, 5) ?? v.start_time) }));
  }

  function submit() {
    startTransition(async () => {
      const result = session ? await updateSessionAction(session.id, values) : await createSessionAction(values);
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      if (!session && result.data && typeof result.data === "object" && "id" in result.data) {
        router.push(`/attendance/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New session
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{session ? "Edit session" : "New attendance session"}</DialogTitle>
          <DialogDescription>Choose the service or activity, then start recording attendance.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="service_type" label="Service or activity" required error={errors.service_type_id} className="sm:col-span-2">
            <Select value={values.service_type_id} onValueChange={pickType}>
              <SelectTrigger id="service_type" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {serviceTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="session_date" label="Date" required error={errors.session_date}>
            <Input id="session_date" type="date" max={todayManila()} value={values.session_date} onChange={(e) => setValues((v) => ({ ...v, session_date: e.target.value }))} />
          </FormField>
          <FormField id="start_time" label="Start time" required error={errors.start_time}>
            <Input id="start_time" type="time" value={values.start_time} onChange={(e) => setValues((v) => ({ ...v, start_time: e.target.value }))} />
          </FormField>
          <FormField id="title" label="Title" hint="Optional, e.g. Youth Camp Day 1" error={errors.title} className="sm:col-span-2">
            <Input id="title" maxLength={150} value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
          </FormField>
          <FormField id="session_notes" label="Notes" error={errors.notes} className="sm:col-span-2">
            <Textarea id="session_notes" rows={2} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !values.service_type_id}>
            {pending ? "Saving…" : session ? "Save changes" : "Create and start recording"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

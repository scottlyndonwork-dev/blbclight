"use client";

import { MailPlus, Plus, Settings2, ShieldOff, ShieldCheck, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import {
  createRoleAction,
  inviteUserAction,
  resendInviteAction,
  setRolePermissionAction,
  setUserActiveAction,
  setUserRolesAction,
} from "./actions";

type Role = { id: string; key: string; name: string; description: string };

function RoleChecklist({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <ul className="space-y-2">
      {roles.map((r) => (
        <li key={r.id}>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={value.includes(r.id)} onCheckedChange={(c) => onChange(c === true ? [...value, r.id] : value.filter((x) => x !== r.id))} />
            <span>
              <span className="font-medium">{r.name}</span>
              <span className="block text-xs text-muted-foreground">{r.description}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

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
  return { run, pending };
}

export function InviteUserDialog({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const { run, pending } = useRun();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <MailPlus /> Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>They will receive an email to set their password. Give only the access their duties require.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="invite_name" label="Full name" required error={errors.full_name}>
            <Input id="invite_name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="invite_email" label="Email address" required error={errors.email}>
            <Input id="invite_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <div className="space-y-2">
            <span className="text-sm font-medium">Roles</span>
            <RoleChecklist roles={roles} value={roleIds} onChange={setRoleIds} />
            {errors.role_ids && <p className="text-xs text-destructive">{errors.role_ids}</p>}
          </div>
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
                  const r = await inviteUserAction({ email, full_name: name, role_ids: roleIds });
                  if (!r.ok) setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
                  return r;
                },
                () => {
                  setOpen(false);
                  setEmail("");
                  setName("");
                  setRoleIds([]);
                  setErrors({});
                },
              )
            }
          >
            {pending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserRowActions({
  userId,
  email,
  name,
  active,
  isSelf,
  roles,
  currentRoleIds,
}: {
  userId: string;
  email: string;
  name: string;
  active: boolean;
  isSelf: boolean;
  roles: Role[];
  currentRoleIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [roleIds, setRoleIds] = useState(currentRoleIds);
  const { run, pending } = useRun();

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Settings2 /> Roles
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roles for {name}</DialogTitle>
            <DialogDescription>Changes take effect on the user&apos;s next page load and are recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <RoleChecklist roles={roles} value={roleIds} onChange={setRoleIds} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => run(() => setUserRolesAction(userId, roleIds), () => setOpen(false))}>
              {pending ? "Saving…" : "Save roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resendInviteAction(email))} aria-label={`Send password link to ${email}`} title="Send password link">
        <Send />
      </Button>
      {!isSelf && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setUserActiveAction(userId, !active))} className={active ? "text-destructive" : ""}>
          {active ? <ShieldOff /> : <ShieldCheck />} {active ? "Deactivate" : "Reactivate"}
        </Button>
      )}
    </div>
  );
}

export function PermissionToggle({ roleId, permissionId, granted, locked }: { roleId: string; permissionId: string; granted: boolean; locked: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(granted);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Checkbox
      aria-label="Grant permission"
      checked={locked || optimistic}
      disabled={locked || pending}
      onCheckedChange={(c) =>
        startTransition(async () => {
          setOptimistic(c === true);
          const r = await setRolePermissionAction(roleId, permissionId, c === true);
          if (!r.ok) toast.error(r.error);
          router.refresh();
        })
      }
    />
  );
}

export function CreateRoleDialog() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ key: "", name: "", description: "" });
  const { run, pending } = useRun();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> New role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>Create a custom role, then choose its permissions.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <FormField id="role_name" label="Role name" required>
            <Input
              id="role_name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value, key: v.key || "" }))}
              onBlur={() => setValues((v) => ({ ...v, key: v.key || v.name.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "") }))}
            />
          </FormField>
          <FormField id="role_key" label="Role key" required hint="Lowercase with underscores">
            <Input id="role_key" value={values.key} onChange={(e) => setValues((v) => ({ ...v, key: e.target.value }))} className="font-mono" />
          </FormField>
          <FormField id="role_desc" label="Description">
            <Input id="role_desc" value={values.description} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => run(() => createRoleAction(values), () => setOpen(false))}>
            {pending ? "Saving…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

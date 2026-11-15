"use client";

import { KeyRound, Plus, Settings2, ShieldOff, ShieldCheck, UserPlus } from "lucide-react";
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
  setRolePermissionAction,
  setUserActiveAction,
  setUserPasswordAction,
  setUserRolesAction,
  updateUserNameAction,
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
  const [fullName, setFullName] = useState(name);
  const [roleIds, setRoleIds] = useState(currentRoleIds);
  const { run, pending } = useRun();

  async function save(): Promise<ActionResult<null>> {
    if (fullName.trim() !== name) {
      const r = await updateUserNameAction(userId, fullName);
      if (!r.ok) return r;
    }
    const rolesChanged = roleIds.length !== currentRoleIds.length || roleIds.some((id) => !currentRoleIds.includes(id));
    if (rolesChanged) return setUserRolesAction(userId, roleIds);
    return { ok: true, data: null, message: "Changes saved." };
  }

  return (
    <div className="flex justify-end gap-1">
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          if (o) {
            setFullName(name);
            setRoleIds(currentRoleIds);
          }
          setOpen(o);
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Settings2 /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {name}</DialogTitle>
            <DialogDescription>
              {email}. Changes take effect on the user&apos;s next page load and are recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormField id={`name_${userId}`} label="Full name" required>
              <Input id={`name_${userId}`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </FormField>
            <div className="space-y-2">
              <span className="text-sm font-medium">Roles</span>
              <RoleChecklist roles={roles} value={roleIds} onChange={setRoleIds} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => run(save, () => setOpen(false))}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!isSelf && <SetPasswordDialog userId={userId} name={name} />}
      {!isSelf && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setUserActiveAction(userId, !active))} className={active ? "text-destructive" : ""}>
          {active ? <ShieldOff /> : <ShieldCheck />} {active ? "Deactivate" : "Reactivate"}
        </Button>
      )}
    </div>
  );
}

function SetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { run, pending } = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setPassword("");
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <KeyRound /> Set password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a temporary password for {name}</DialogTitle>
          <DialogDescription>
            Give it to them in person. They should change it from the account menu after signing in.
          </DialogDescription>
        </DialogHeader>
        <FormField id={`pw_${userId}`} label="Temporary password" required hint="At least 10 characters, with letters and numbers.">
          <Input id={`pw_${userId}`} type="text" autoComplete="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => run(() => setUserPasswordAction(userId, password), () => setOpen(false))}>
            {pending ? "Saving…" : "Set password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Explains how to create an account in Supabase; LIGHT does not send emails. */
export function AddUserGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add a user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>Accounts are created in Supabase, then given a name and roles here.</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-3 pl-5 text-sm">
          <li>
            Open the Supabase dashboard and go to <strong>Authentication → Users</strong>.
          </li>
          <li>
            Click <strong>Add user → Create new user</strong>. Enter their email and a temporary password (at least 10
            characters, with letters and numbers), keep <strong>Auto Confirm User</strong> ticked, then click{" "}
            <strong>Create user</strong>.
          </li>
          <li>
            Come back to this page and refresh. The new account appears with no roles; click <strong>Edit</strong> to
            enter their full name and choose their roles. Until they have a role, they cannot see any records.
          </li>
          <li>
            Give them their email and temporary password in person. After signing in, they should choose their own
            password from the account menu: <strong>Change password</strong>.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          If someone forgets their password, click <strong>Set password</strong> next to their name and give them a new
          temporary one.
        </p>
      </DialogContent>
    </Dialog>
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

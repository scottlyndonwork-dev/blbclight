"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { MemberPicker } from "@/components/shared/member-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { MemberLookupResult } from "../lookup-action";
import { ChangeStatusDialog } from "./profile-widgets";

/** Pick a member, then open the status change dialog for them. */
export function StatusChangeLauncher({
  statuses,
}: {
  statuses: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<MemberLookupResult | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setMember(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <ShieldCheck /> Change a member&apos;s status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change membership status</DialogTitle>
          <DialogDescription>Find the member whose status you want to change.</DialogDescription>
        </DialogHeader>
        <MemberPicker autoFocus selected={member} onSelect={setMember} onClear={() => setMember(null)} />
        {member && (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span>
              Current status: <span className="font-medium">{member.status_name}</span>
            </span>
            <ChangeStatusDialog
              memberId={member.id}
              currentStatusId={statuses.find((s) => s.name === member.status_name)?.id ?? ""}
              statuses={statuses}
              trigger={<Button size="sm">Continue</Button>}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

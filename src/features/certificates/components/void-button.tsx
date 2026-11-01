"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { voidCertificateAction } from "../actions";

export function VoidCertificateButton({ certificateId, trigger }: { certificateId: string; trigger: ReactNode }) {
  const router = useRouter();
  return (
    <ReasonDialog
      trigger={trigger}
      title="Void this certificate?"
      description="The certificate stays on record but will show as invalid on the verification page. This cannot be undone; issue a replacement if needed."
      confirmLabel="Void certificate"
      successMessage="Certificate voided."
      onConfirm={async (reason) => {
        const result = await voidCertificateAction(certificateId, reason);
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}

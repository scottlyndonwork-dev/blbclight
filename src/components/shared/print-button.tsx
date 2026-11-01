"use client";

import { Slot } from "radix-ui";
import type { ReactNode } from "react";

/** Opens the browser print dialog. Elements with the `no-print` class are hidden when printing. */
export function PrintButton({ trigger }: { trigger: ReactNode }) {
  return <Slot.Root onClick={() => window.print()}>{trigger}</Slot.Root>;
}

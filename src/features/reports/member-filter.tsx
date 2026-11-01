"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MemberPicker } from "@/components/shared/member-picker";
import type { MemberLookupResult } from "@/features/members/lookup-action";

/** Member picker bound to the `member` search param. */
export function ReportMemberFilter({ initial }: { initial: MemberLookupResult | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(initial);

  function update(member: MemberLookupResult | null) {
    setSelected(member);
    const params = new URLSearchParams(searchParams.toString());
    if (member) params.set("member", member.id);
    else params.delete("member");
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  return <MemberPicker className="w-full sm:w-80" selected={selected} onSelect={update} onClear={() => update(null)} />;
}

"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import { authorizeAction } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

export type MemberLookupResult = { id: string; member_no: string; full_name: string; status_name: string };

/** Identity-only member search used by pickers across modules. */
export async function lookupMembersAction(query: string, limit = 8): Promise<ActionResult<MemberLookupResult[]>> {
  const { denied } = await authorizeAction(["members.read", "attendance.write", "attendance.read", "finance.write", "certificates.issue"]);
  if (denied) return denied;
  const term = query.trim().slice(0, 60);
  if (!term) return ok([]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_lookup", { p_query: term, p_limit: Math.min(Math.max(limit, 1), 25) });
  if (error) return fail(friendlyDbError(error));
  return ok(data ?? []);
}

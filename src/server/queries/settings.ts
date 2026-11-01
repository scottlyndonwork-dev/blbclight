import "server-only";
import { cache } from "react";
import { createClient } from "@/server/supabase/server";

export const getChurchSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("church_settings")
    .select("church_name, short_name, address, contact_number, email, website, logo_path, member_no_prefix, timezone, currency, updated_at")
    .maybeSingle();
  return data;
});

export type ChurchSettings = NonNullable<Awaited<ReturnType<typeof getChurchSettings>>>;

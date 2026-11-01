"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import type { Permission } from "@/lib/permissions";
import { authorizeAction } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";

const settingsSchema = z.object({
  church_name: z.string().trim().min(2, "Enter the church name.").max(200),
  short_name: z.string().trim().min(1).max(40),
  address: z.string().trim().max(300),
  contact_number: z.string().trim().max(40),
  email: z.string().trim().max(254).refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email."),
  website: z.string().trim().max(200),
  member_no_prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, "Use 2 to 6 capital letters."),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export async function saveChurchSettingsAction(input: SettingsInput): Promise<ActionResult<null>> {
  const { user, denied } = await authorizeAction(["settings.manage"]);
  if (denied) return denied;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.from("church_settings").update({ ...parsed.data, updated_by: user.id }).eq("id", true);
  if (error) return fail(friendlyDbError(error, "Settings could not be saved."));
  revalidatePath("/", "layout");
  return ok(null, "Church settings saved.");
}

export async function uploadLogoAction(formData: FormData): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["settings.manage"]);
  if (denied) return denied;
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : null;
  if (!ext) return fail("Use a PNG or JPG image (used on certificates).");
  if (file.size > 2 * 1024 * 1024) return fail("The logo must be 2 MB or smaller.");
  const supabase = await createClient();
  const path = `logo/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("church-assets").upload(path, file, { contentType: file.type });
  if (uploadError) return fail("The logo could not be uploaded.");
  const { error } = await supabase.from("church_settings").update({ logo_path: path }).eq("id", true);
  if (error) {
    await supabase.storage.from("church-assets").remove([path]);
    return fail(friendlyDbError(error));
  }
  // Previous logos are kept: issued certificates reference them in their snapshot.
  revalidatePath("/settings");
  return ok(null, "Logo updated. It will appear on certificates issued from now on.");
}

// ---------------------------------------------------------------------------
// Lookup lists
// ---------------------------------------------------------------------------

const LOOKUPS = {
  membership_categories: { permission: "settings.manage", extra: [] },
  ministries: { permission: "settings.manage", extra: [] },
  service_types: { permission: "settings.manage", extra: ["default_start_time"] },
  membership_statuses: { permission: "settings.manage", extra: ["counts_as_active", "color"] },
  financial_categories: { permission: "finance.manage_funds", extra: ["kind"] },
} as const satisfies Record<string, { permission: Permission; extra: readonly string[] }>;

export type LookupTable = keyof typeof LOOKUPS;

const lookupSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  is_active: z.boolean(),
  default_start_time: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
  counts_as_active: z.boolean().optional(),
  color: z.enum(["green", "gray", "amber", "blue", "red", "slate"]).optional(),
  kind: z.enum(["income", "expense"]).optional(),
});

export type LookupInput = z.input<typeof lookupSchema>;

function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "x$1")
      .slice(0, 40) || `item_${Date.now()}`
  );
}

export async function saveLookupAction(table: LookupTable, id: string | null, input: LookupInput): Promise<ActionResult<null>> {
  const config = LOOKUPS[table];
  if (!config) return fail("Unknown list.");
  const { denied } = await authorizeAction([config.permission]);
  if (denied) return denied;
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the values.");
  const v = parsed.data;
  const supabase = await createClient();

  let error;
  switch (table) {
    case "membership_categories":
    case "ministries": {
      const row = { name: v.name, is_active: v.is_active };
      ({ error } = id ? await supabase.from(table).update(row).eq("id", id) : await supabase.from(table).insert(row));
      break;
    }
    case "service_types": {
      const row = { name: v.name, is_active: v.is_active, default_start_time: v.default_start_time || null };
      ({ error } = id ? await supabase.from(table).update(row).eq("id", id) : await supabase.from(table).insert({ ...row, code: slug(v.name), sort_order: 100 }));
      break;
    }
    case "membership_statuses": {
      const row = { name: v.name, is_active: v.is_active, counts_as_active: v.counts_as_active ?? false, color: v.color ?? "gray" };
      ({ error } = id ? await supabase.from(table).update(row).eq("id", id) : await supabase.from(table).insert({ ...row, key: slug(v.name), sort_order: 100 }));
      break;
    }
    case "financial_categories": {
      if (!id && !v.kind) return fail("Choose income or expense.");
      ({ error } = id
        ? await supabase.from(table).update({ name: v.name, is_active: v.is_active }).eq("id", id)
        : await supabase.from(table).insert({ name: v.name, is_active: v.is_active, kind: v.kind ?? "income", sort_order: 100 }));
      break;
    }
  }
  if (error) {
    return fail(
      error.code === "42501" || error.message?.includes("row-level security")
        ? "Built-in entries cannot be changed. You can add your own."
        : friendlyDbError(error, "The entry could not be saved."),
    );
  }
  revalidatePath("/settings");
  return ok(null, "Saved.");
}

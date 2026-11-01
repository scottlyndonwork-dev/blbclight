"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";

export type AuthFormState = { error?: string; message?: string; email?: string };

const signInSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().optional(),
});

async function requestMetadata() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** Only allow redirects to local application paths. */
function safeNext(next: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")) return next;
  return "/dashboard";
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  const metadata = await requestMetadata();

  if (error || !data.user) {
    await logFailedSignIn(parsed.data.email, metadata);
    return { error: "The email or password is incorrect, or the account is not active.", email };
  }

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Contact your administrator.", email };
  }

  await supabase.rpc("record_sign_in", { p_metadata: metadata });
  redirect(safeNext(parsed.data.next));
}

/** Failed attempts have no session, so they are recorded with the service role. */
async function logFailedSignIn(email: string, metadata: Record<string, string | null>) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      action: "auth.login_failed",
      entity_type: "user",
      summary: "Failed sign-in attempt",
      metadata: { ...metadata, email: email.toLowerCase().slice(0, 254) },
    });
  } catch {
    // Logging must never block the sign-in response.
  }
}

export async function signOutAction() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await supabase.rpc("log_event", { p_action: "auth.logout", p_entity_type: "user", p_entity_id: data.user.id });
  }
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
  });
  // Same response whether or not the account exists, to avoid account enumeration.
  return { message: "If an account exists for that email, a password reset link has been sent." };
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(128)
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/\d/, "Include at least one number."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The passwords do not match.", path: ["confirm"] });

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message.includes("different") ? "Choose a password different from your current one." : "Could not update the password. Please try again." };
  await supabase.rpc("log_event", { p_action: "auth.password_changed", p_entity_type: "user", p_entity_id: auth.user.id });
  redirect("/dashboard");
}

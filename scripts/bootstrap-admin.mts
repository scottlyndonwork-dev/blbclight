/**
 * Creates (or promotes) the first Super Administrator.
 *
 *   pnpm bootstrap:admin admin@church.org "Full Name"
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * NEXT_PUBLIC_SITE_URL in .env.local. Prints a one-time invitation link
 * (no email is sent); opening it lets the new admin set their password.
 */
import { createClient } from "@supabase/supabase-js";

const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: pnpm bootstrap:admin admin@church.org "Full Name"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(): Promise<string | null> {
  const { data } = await admin.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  return data?.id ?? null;
}

let userId = await findUserId();
// A new user gets an invitation; an existing one gets a password-reset link.
const type = userId ? "recovery" : "invite";
const { data: link, error: linkError } =
  type === "invite"
    ? await admin.auth.admin.generateLink({ type, email, options: { data: { full_name: fullName } } })
    : await admin.auth.admin.generateLink({ type, email });
if (linkError || !link.user) {
  console.error("Could not create the sign-in link:", linkError?.message);
  process.exit(1);
}
userId = link.user.id;

// Link straight to the app's /auth/confirm route (token_hash flow), not to
// Supabase's verify endpoint, which returns tokens in a URL fragment the
// server never sees.
const confirmUrl = new URL("/auth/confirm", siteUrl);
confirmUrl.searchParams.set("token_hash", link.properties.hashed_token);
confirmUrl.searchParams.set("type", type);
confirmUrl.searchParams.set("next", "/reset-password");
console.log("\nOne-time link (open it to set the password):\n");
console.log(confirmUrl.toString(), "\n");

if (fullName) await admin.from("profiles").update({ full_name: fullName, is_active: true }).eq("id", userId);

const { data: role } = await admin.from("roles").select("id").eq("key", "super_admin").single();
if (!role) {
  console.error("Roles are missing. Apply the database migrations first (pnpm db:push).");
  process.exit(1);
}
const { error: roleError } = await admin
  .from("user_roles")
  .upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
if (roleError) {
  console.error("Could not assign the role:", roleError.message);
  process.exit(1);
}

console.log(`Done. ${email} is a Super Administrator.`);

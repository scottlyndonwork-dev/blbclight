/**
 * Sets a user's password directly through the Supabase Admin API and
 * confirms their email. The password is typed into this terminal (hidden)
 * and is never written to disk or shown.
 *
 *   pnpm set-password admin@church.org
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: pnpm set-password admin@church.org");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

/** Reads a line from the terminal without echoing it. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const rlOutput = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    rlOutput._writeToOutput = (s: string) => {
      if (!muted) rlOutput.output.write(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

// Same rules as the app's set-password form (src/features/auth/actions.ts).
function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(password)) return "Include at least one letter.";
  if (!/\d/.test(password)) return "Include at least one number.";
  return null;
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: profile } = await admin.from("profiles").select("id, is_active").eq("email", email).maybeSingle();
if (!profile) {
  console.error(`No LIGHT account exists for ${email}. Create it first with pnpm bootstrap:admin.`);
  process.exit(1);
}

const password = await askHidden("New password (hidden): ");
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
if ((await askHidden("Confirm password (hidden): ")) !== password) {
  console.error("The passwords do not match.");
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(profile.id, { password, email_confirm: true });
if (error) {
  console.error("Could not set the password:", error.message);
  process.exit(1);
}

console.log(`Password set for ${email}.${profile.is_active ? "" : " Note: this account is deactivated in LIGHT."}`);

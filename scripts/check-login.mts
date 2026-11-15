/**
 * Tries a password sign-in directly against Supabase and prints the exact
 * result, to tell a wrong password apart from a configuration problem.
 * The password is typed hidden and the test session is signed out at once.
 *
 *   pnpm check-login admin@church.org
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!email || !url || !anonKey) {
  console.error("Usage: pnpm check-login admin@church.org (needs .env.local)");
  process.exit(1);
}

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

const password = await askHidden("Password to test (hidden): ");
console.log(`Typed ${password.length} characters${password !== password.trim() ? " (includes leading/trailing spaces)" : ""}.`);
console.log(`Supabase project: ${new URL(url).host}`);

const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error(`Sign-in FAILED: ${error.message} (code: ${error.code ?? "none"}, status: ${error.status ?? "?"})`);
  process.exit(1);
}
console.log(`Sign-in OK for ${data.user.email}. The password is correct.`);
await supabase.auth.signOut({ scope: "local" });

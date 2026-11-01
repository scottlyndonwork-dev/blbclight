import type { Metadata } from "next";

export const metadata: Metadata = { title: "Setup required" };

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">LIGHT needs to be connected to Supabase</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The application is running, but its database connection has not been configured yet.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm">
        <li>
          Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code> and
          fill in <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
          <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code>.
        </li>
        <li>
          Apply the database migrations: <code className="rounded bg-muted px-1">pnpm dlx supabase link</code> then{" "}
          <code className="rounded bg-muted px-1">pnpm db:push</code>.
        </li>
        <li>
          Create the first Super Administrator: <code className="rounded bg-muted px-1">pnpm bootstrap:admin you@church.org &quot;Your Name&quot;</code>.
        </li>
        <li>Restart the development server.</li>
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">See README.md for the complete setup and deployment guide.</p>
    </div>
  );
}

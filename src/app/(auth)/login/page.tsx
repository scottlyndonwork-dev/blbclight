import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/features/auth/components";

export const metadata: Metadata = { title: "Sign in" };

async function LoginForm({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === "session" && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Your session has ended or your account is not active. Please sign in again.
        </p>
      )}
      {error === "link" && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          That link is invalid or has expired. Please request a new one.
        </p>
      )}
      <SignInForm next={next} />
    </>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return (
    <>
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="mb-5 text-sm text-muted-foreground">Use the account provided by your church administrator.</p>
      <Suspense fallback={<div className="h-56" />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}

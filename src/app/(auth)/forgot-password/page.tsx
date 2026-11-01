import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="mb-5 text-sm text-muted-foreground">Enter your email address and we will send you a reset link.</p>
      <ForgotPasswordForm />
    </>
  );
}

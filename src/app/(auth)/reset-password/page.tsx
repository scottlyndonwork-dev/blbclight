import type { Metadata } from "next";
import { SetPasswordForm } from "@/features/auth/components";

export const metadata: Metadata = { title: "Set password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Set your password</h1>
      <p className="mb-5 text-sm text-muted-foreground">Choose a strong password you have not used elsewhere.</p>
      <SetPasswordForm />
    </>
  );
}

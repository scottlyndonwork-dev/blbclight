import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">The page or record you are looking for does not exist or may have been moved.</p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}

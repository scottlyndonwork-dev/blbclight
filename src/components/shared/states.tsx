import { AlertTriangle, Inbox, Lock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent text-primary ring-8 ring-accent/40">
        <Icon className="size-8" />
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-base text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this information",
  description = "Please check your connection and try again. If the problem continues, contact your administrator.",
  action,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 size-6 text-destructive" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={Lock}
        title="You don't have access to this page"
        description={message ?? "Your role does not include permission to view this information. Contact a Super Administrator if you need access."}
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}

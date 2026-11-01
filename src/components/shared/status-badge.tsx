import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-success/10 text-success border-success/20",
  gray: "bg-muted text-muted-foreground border-border",
  amber: "bg-warning/10 text-warning border-warning/25",
  blue: "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300",
  red: "bg-destructive/10 text-destructive border-destructive/20",
  slate: "bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300",
  gold: "bg-gold/15 text-gold-foreground border-gold/30 dark:text-gold",
} as const;

export type BadgeTone = keyof typeof TONES;

export function StatusBadge({ tone = "gray", children, className }: { tone?: BadgeTone | string | null; children: React.ReactNode; className?: string }) {
  const key = (tone && tone in TONES ? tone : "gray") as BadgeTone;
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium", TONES[key], className)}>
      {children}
    </span>
  );
}

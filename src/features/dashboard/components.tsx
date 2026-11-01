import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Dashboard building blocks. Colors stay within the brand (navy, blue, yellow);
   green/amber/red are reserved for status meaning. */

export function WelcomeBanner({ title, subtitle, controls }: { title: string; subtitle: string; controls: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-linear-to-br from-[#e6effb] via-[#f3f7fd] to-white shadow-sm dark:from-[#14233d] dark:via-[#111c31] dark:to-[#0d1524]">
      <BannerArt />
      <div className="relative flex flex-col gap-4 p-5 sm:gap-6 sm:p-8 md:pr-56 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-secondary-foreground sm:text-4xl">{title}</h1>
          <p className="mt-1 text-base text-foreground/80 sm:mt-2 sm:text-lg">{subtitle}</p>
          <div className="mt-3 hidden h-1 w-12 rounded-full bg-gold sm:block" aria-hidden="true" />
          <blockquote className="mt-3 max-w-xl border-l-4 border-gold pl-3 font-serif text-base leading-relaxed text-secondary-foreground/90 italic sm:mt-4 sm:border-0 sm:pl-0 sm:text-lg">
            &ldquo;Let your light so shine before men, that they may see your good works, and glorify your Father which is in
            heaven.&rdquo;
            <footer className="mt-1 font-sans text-base font-semibold not-italic text-primary">Matthew 5:16</footer>
          </blockquote>
        </div>
        <div className="relative flex flex-col items-stretch gap-2 sm:items-start sm:gap-3 2xl:items-end">{controls}</div>
      </div>
    </section>
  );
}

/** Soft light rays and a lighthouse on the right of the banner (decorative). */
function BannerArt() {
  return (
    <svg
      viewBox="0 0 520 260"
      preserveAspectRatio="xMaxYMax meet"
      className="pointer-events-none absolute right-0 bottom-0 hidden h-full max-h-72 w-auto opacity-90 md:block"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="banner-glow" cx="0.78" cy="0.32" r="0.5">
          <stop offset="0" stopColor="#f5d465" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f5d465" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="banner-ray" x1="1" x2="0">
          <stop offset="0" stopColor="#f5d465" stopOpacity="0.4" />
          <stop offset="1" stopColor="#f5d465" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="520" height="260" fill="url(#banner-glow)" />
      <path d="M402 84 L120 20 L120 150 Z" fill="url(#banner-ray)" />
      <path d="M418 84 L520 50 L520 120 Z" fill="#f5d465" fillOpacity="0.25" />
      <path d="M0 230 Q120 200 250 220 T520 205 L520 260 L0 260 Z" fill="#1f4e96" fillOpacity="0.08" />
      <path d="M0 245 Q150 225 300 240 T520 232 L520 260 L0 260 Z" fill="#1f4e96" fillOpacity="0.12" />
      <g>
        <path d="M396 100 h28 l9 120 h-46 z" fill="#d7b533" />
        <path d="M393 128 h34 v12 h-34 z M391 168 h38 v12 h-38 z" fill="#ffffff" fillOpacity="0.85" />
        <rect x="390" y="92" width="40" height="9" rx="2" fill="#16273d" />
        <rect x="398" y="72" width="24" height="20" rx="2" fill="#16273d" />
        <rect x="402" y="76" width="16" height="12" fill="#f5d465" />
        <path d="M394 72 l16 -16 l16 16 z" fill="#16273d" />
        <path d="M370 220 h80 l12 14 h-104 z" fill="#16273d" />
      </g>
    </svg>
  );
}

export type QuickAction = { href: string; label: string; description: string; icon: LucideIcon };

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <nav aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {actions.map(({ href, label, description, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex min-h-20 items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Icon className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold">{label}</span>
            <span className="block text-sm text-muted-foreground">{description}</span>
          </span>
          <ArrowRight className="ml-auto size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ))}
    </nav>
  );
}

const TONES = {
  blue: "bg-[#e3ecfa] text-[#1f4e96] dark:bg-[#1c2f52] dark:text-[#8fb4e6]",
  green: "bg-[#e1f3e9] text-[#1e7a4c] dark:bg-[#173326] dark:text-[#6fcf9a]",
  slate: "bg-[#eceff4] text-[#4a586e] dark:bg-[#222d40] dark:text-[#aab6c8]",
  yellow: "bg-[#fbf1cf] text-[#8a6a0a] dark:bg-[#3a3214] dark:text-[#e8c75a]",
  sky: "bg-[#e0f0fb] text-[#1d6fa5] dark:bg-[#15304a] dark:text-[#7cc0ec]",
  navy: "bg-[#e4e8f0] text-[#16273d] dark:bg-[#1b2740] dark:text-[#c8d6ec]",
} as const;

export type Tone = keyof typeof TONES;

export function MemberStat({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: LucideIcon; tone: Tone }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", TONES[tone])}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tabular-nums tracking-tight">{value.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

const PANEL_HEADERS = {
  navy: { band: "bg-[#16273d] text-white dark:bg-[#0f1c33]", icon: "bg-white/15 text-[#f5d465]", sub: "text-white/80", link: "border-white/30 text-white hover:bg-white/10" },
  yellow: {
    band: "bg-[#fbf1cf] text-[#16273d] dark:bg-[#3a3214] dark:text-[#f3e3a8]",
    icon: "bg-[#d7b533] text-[#16273d]",
    sub: "text-[#16273d]/75 dark:text-[#f3e3a8]/80",
    link: "border-[#16273d]/25 text-[#16273d] hover:bg-[#16273d]/5 dark:border-[#f3e3a8]/30 dark:text-[#f3e3a8]",
  },
  plain: { band: "border-b", icon: "bg-accent text-primary", sub: "text-muted-foreground", link: "border-border text-primary hover:bg-accent" },
} as const;

export function Panel({
  title,
  description,
  icon: Icon,
  href,
  variant = "plain",
  children,
  bodyClassName,
}: {
  title: string;
  description?: ReactNode;
  icon: LucideIcon;
  href?: string;
  variant?: keyof typeof PANEL_HEADERS;
  children: ReactNode;
  bodyClassName?: string;
}) {
  const style = PANEL_HEADERS[variant];
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className={cn("flex items-center gap-3 px-5 py-4", style.band)}>
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", style.icon)}>
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold">{title}</h2>
          {description && <p className={cn("text-sm", style.sub)}>{description}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className={cn("no-print ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition", style.link)}
          >
            View all <ArrowRight className="size-4" />
          </Link>
        )}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Figure({ label, value, note, icon: Icon, valueClassName }: { label: string; value: ReactNode; note?: ReactNode; icon?: LucideIcon; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        {Icon && <Icon className="size-4" />} {label}
      </p>
      <p className={cn("text-2xl font-bold tabular-nums", valueClassName)}>{value}</p>
      {note && <p className="truncate text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

/** A single percentage as a ring; the number is always printed, so it never relies on the arc alone. */
export function RateRing({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 72 72" className="size-14 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${clamped}%`}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="8"
          strokeLinecap={clamped > 0 ? "round" : "butt"}
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
        />
      </svg>
      <div>
        <p className="text-sm font-medium whitespace-nowrap text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{clamped}%</p>
        <p className="text-sm whitespace-nowrap text-muted-foreground">of active members</p>
      </div>
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Updates URL search params without a full page reload. */
function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(changes: Record<string, string | null>, options: { resetPage?: boolean } = { resetPage: true }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    if (options.resetPage) params.delete("page");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return { searchParams, update, pending };
}

/** Debounced search box bound to the `q` search param. */
export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { searchParams, update, pending } = useUrlParams();
  const initial = searchParams.get(param) ?? "";
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ [param]: next.trim() || null }), 350);
  }

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("pl-8", pending && "opacity-80")}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export type FilterOption = { value: string; label: string };

/** Select bound to a search param. "all" clears the filter. */
export function FilterSelect({
  param,
  options,
  placeholder,
  allLabel = "All",
  className,
}: {
  param: string;
  options: FilterOption[];
  placeholder: string;
  allLabel?: string;
  className?: string;
}) {
  const { searchParams, update } = useUrlParams();
  const value = searchParams.get(param) ?? "all";
  return (
    <Select value={value} onValueChange={(v) => update({ [param]: v === "all" ? null : v })}>
      <SelectTrigger className={cn("w-full sm:w-44", className)} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Date inputs bound to `from` and `to` search params, with presets. */
export function DateRangeFilter({
  from,
  to,
  presets,
}: {
  from: string;
  to: string;
  presets: FilterOption[];
}) {
  const { searchParams, update } = useUrlParams();
  const preset = searchParams.get("range") ?? (searchParams.get("from") ? "custom" : "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset || "default"} onValueChange={(v) => update({ range: v === "custom" || v === "default" ? null : v, from: null, to: null })}>
        <SelectTrigger className="w-40" aria-label="Date range">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default range</SelectItem>
          {presets.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        aria-label="From date"
        className="w-[9.5rem]"
        value={from}
        max={to}
        onChange={(e) => e.target.value && update({ from: e.target.value, to, range: null })}
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        className="w-[9.5rem]"
        value={to}
        min={from}
        onChange={(e) => e.target.value && update({ from, to: e.target.value, range: null })}
      />
    </div>
  );
}

/**
 * Wraps secondary filters. On phones and tablets they fold behind a
 * "Filters" button (showing how many are in use); on large screens they
 * are always visible.
 */
export function CollapsibleFilters({ params, children }: { params: string[]; children: ReactNode }) {
  const { searchParams } = useUrlParams();
  const [open, setOpen] = useState(false);
  const active = params.filter((p) => searchParams.get(p)).length;
  return (
    <>
      <Button type="button" variant="outline" className="w-full justify-between lg:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-2">
          <SlidersHorizontal /> Filters
        </span>
        {active > 0 ? <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{active} on</span> : <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>}
      </Button>
      <div className={cn(open ? "grid" : "hidden", "gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center")}>{children}</div>
    </>
  );
}

/** Large one-tap period buttons (e.g. This week / This month / This year). */
export function PeriodButtons({ options, active }: { options: FilterOption[]; active: string }) {
  const { update, pending } = useUrlParams();
  return (
    <div role="group" aria-label="Period" className={cn("grid grid-cols-3 gap-2 sm:flex sm:flex-wrap", pending && "opacity-70")}>
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          variant={active === o.value ? "default" : "outline"}
          aria-pressed={active === o.value}
          className="rounded-full px-2 shadow-sm sm:px-5"
          onClick={() => update({ range: o.value, from: null, to: null })}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** Server-side pagination controls bound to the `page` search param. */
export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { update, pending } = useUrlParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="no-print flex flex-col items-center justify-between gap-2 border-t px-3 py-2.5 text-sm text-muted-foreground sm:flex-row">
      <p>
        {total === 0 ? "No records" : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || pending}
          onClick={() => update({ page: String(page - 1) }, { resetPage: false })}
        >
          <ChevronLeft /> Previous
        </Button>
        <span className="px-2 tabular-nums">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages || pending}
          onClick={() => update({ page: String(page + 1) }, { resetPage: false })}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { lookupMembersAction, type MemberLookupResult } from "@/features/members/lookup-action";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Debounced, keyboard-friendly member search (name or member ID).
 * Arrow keys move, Enter selects, Escape clears.
 */
export function MemberPicker({
  onSelect,
  placeholder = "Search member name or ID",
  autoFocus,
  clearOnSelect = false,
  selected,
  onClear,
  className,
  inputRef: externalRef,
}: {
  onSelect: (member: MemberLookupResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  clearOnSelect?: boolean;
  selected?: MemberLookupResult | null;
  onClear?: () => void;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberLookupResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;
  const listId = useId();

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function search(term: string) {
    setQuery(term);
    if (timer.current) clearTimeout(timer.current);
    if (!term.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++requestId.current;
      startTransition(async () => {
        const r = await lookupMembersAction(term);
        if (id !== requestId.current) return; // a newer search is in flight
        setResults(r.ok ? r.data : []);
        setActive(0);
        setOpen(true);
      });
    }, 200);
  }

  function choose(member: MemberLookupResult) {
    onSelect(member);
    setOpen(false);
    setResults([]);
    setQuery(clearOnSelect ? "" : member.full_name);
    if (clearOnSelect) inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[active];
      if (pick && open) choose(pick);
    } else if (e.key === "Escape") {
      setQuery("");
      setResults([]);
      setOpen(false);
    }
  }

  if (selected && !clearOnSelect) {
    return (
      <div className={cn("flex h-9 items-center justify-between rounded-md border bg-background px-3 text-sm", className)}>
        <span className="truncate">
          <span className="font-medium">{selected.full_name}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">{selected.member_no}</span>
        </span>
        {onClear && (
          <button type="button" onClick={onClear} aria-label="Clear selected member" className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => search(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
        className="pl-8"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">{pending ? "Searching…" : "No matching members"}</li>
          ) : (
            results.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5", i === active && "bg-accent")}
              >
                <span className="truncate font-medium">{m.full_name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <span className="font-mono">{m.member_no}</span> · {m.status_name}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

"use client";

import { LogOut, Monitor, Moon, Sun, Type } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useTransition } from "react";
import { signOutAction } from "@/features/auth/actions";
import { applyTextSize, readTextSize, TEXT_SIZES, type TextSize } from "@/lib/text-size";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ fullName, email, roles }: { fullName: string; email: string; roles: string[] }) {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  // Read when the menu opens; the server cannot know the stored preference.
  const [textSize, setTextSize] = useState<TextSize>("normal");

  return (
    <DropdownMenu onOpenChange={(open) => open && setTextSize(readTextSize())}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2" aria-label="Account menu">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initials(fullName) || "U"}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-base font-medium sm:inline">{fullName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          {roles.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{roles.join(", ")}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Type className="size-3.5" /> Text size
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={textSize}
          onValueChange={(value) => {
            const size = value as TextSize;
            setTextSize(size);
            applyTextSize(size);
          }}
        >
          {TEXT_SIZES.map((s, i) => (
            <DropdownMenuRadioItem key={s.value} value={s.value} onSelect={(e) => e.preventDefault()}>
              <span style={{ fontSize: `${1 + i * 0.125}rem` }}>{s.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(e) => {
            e.preventDefault();
            startTransition(() => signOutAction());
          }}
        >
          <LogOut /> {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

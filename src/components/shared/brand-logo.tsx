import Image from "next/image";
import { cn } from "@/lib/utils";

/** The church logo (public/brand), rendered at `size` CSS pixels. */
export function BrandLogo({ size, className, priority }: { size: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src={size > 128 ? "/brand/logo-512.png" : "/brand/logo-256.png"}
      alt="Church logo"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 rounded-full", className)}
    />
  );
}

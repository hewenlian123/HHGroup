import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden={props["aria-hidden"] ?? true}
      className={cn(
        "animate-pulse rounded-hh-standard bg-[var(--hh-l3-hover)] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

type InlineLoadingProps = React.HTMLAttributes<HTMLDivElement> & {
  /** `sm` ≈ icon spinners; `md` for larger controls */
  size?: "sm" | "md";
};

/** Compact pulse block for buttons and inline states (replaces spinners; stable size). */
export function InlineLoading({ className, size = "sm", ...props }: InlineLoadingProps) {
  return (
    <span role="status" aria-live="polite" aria-label="Loading" {...props}>
      <Skeleton
        className={cn(
          "inline-block shrink-0 rounded-hh-compact",
          size === "md" ? "h-4 w-4" : "h-3.5 w-3.5",
          className
        )}
      />
    </span>
  );
}

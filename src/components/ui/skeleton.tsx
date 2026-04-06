import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} {...props} />;
}

type InlineLoadingProps = React.HTMLAttributes<HTMLDivElement> & {
  /** `sm` ≈ icon spinners; `md` for larger controls */
  size?: "sm" | "md";
};

/** Compact pulse block for buttons and inline states (replaces spinners; stable size). */
export function InlineLoading({ className, size = "sm", ...props }: InlineLoadingProps) {
  return (
    <Skeleton
      role="status"
      aria-live="polite"
      className={cn(
        "inline-block shrink-0 rounded-md",
        size === "md" ? "h-4 w-4" : "h-3.5 w-3.5",
        className
      )}
      {...props}
    />
  );
}

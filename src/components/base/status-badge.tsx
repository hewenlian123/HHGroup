"use client";

import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

const dotColors: Record<StatusBadgeVariant, string> = {
  default: "bg-[#111111]",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  muted: "bg-gray-400",
};

export interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
}

/** Minimal status: dot + text. No pill background or heavy styling. */
export function StatusBadge({ label, variant = "default", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-[#111111]",
        variant === "muted" && "text-[#6B7280]",
        variant === "danger" && "text-red-600 dark:text-red-400",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColors[variant])} aria-hidden />
      {label}
    </span>
  );
}

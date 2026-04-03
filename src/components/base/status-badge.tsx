"use client";

import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

/** Filled pills (no outline): success = green, warning = amber, danger = red, muted/default = gray */
const variantPillClass: Record<StatusBadgeVariant, string> = {
  default: "hh-pill-neutral",
  success: "hh-pill-success",
  warning: "hh-pill-warning",
  danger: "hh-pill-danger",
  muted: "hh-pill-neutral",
};

export interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
}

export function StatusBadge({ label, variant = "default", className }: StatusBadgeProps) {
  return <span className={cn(variantPillClass[variant], className)}>{label}</span>;
}

import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "default" | "success" | "warning" | "danger" | "muted" | "info";

const variantPillClass: Record<StatusBadgeVariant, ComponentProps<typeof Badge>["variant"]> = {
  default: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  muted: "neutral",
  info: "information",
};

const variantDotClass: Record<StatusBadgeVariant, string> = {
  default: "bg-[var(--hh-text-tertiary)]",
  success: "bg-[var(--hh-success)]",
  warning: "bg-[var(--hh-warning)]",
  danger: "bg-[var(--hh-danger)]",
  muted: "bg-[var(--hh-text-tertiary)]",
  info: "bg-[var(--hh-information)]",
};

export interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
  showDot?: boolean;
}

export function statusBadgeVariantClass(variant: StatusBadgeVariant = "default") {
  return variantPillClass[variant] ?? variantPillClass.default;
}

export function statusBadgeDotClass(variant: StatusBadgeVariant = "default") {
  return variantDotClass[variant] ?? variantDotClass.default;
}

export function StatusBadge({
  label,
  variant = "default",
  className,
  showDot = true,
}: StatusBadgeProps) {
  return (
    <Badge
      variant={statusBadgeVariantClass(variant)}
      className={cn("h-[26px] shrink-0 gap-hh-1 !rounded-hh-pill px-2.5 text-hh-status", className)}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusBadgeDotClass(variant))}
        />
      ) : null}
      {label}
    </Badge>
  );
}

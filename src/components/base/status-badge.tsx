import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

const badgeBaseClass =
  "inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium leading-none tracking-normal";

const variantPillClass: Record<StatusBadgeVariant, string> = {
  default:
    "border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[var(--neo-text-secondary)]",
  success:
    "border-emerald-500/20 bg-[var(--neo-emerald-soft)] text-[var(--neo-emerald)] dark:bg-emerald-500/15 dark:text-emerald-300",
  warning:
    "border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]",
  danger: "border-rose-500/20 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  muted: "border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[var(--neo-text-tertiary)]",
};

const variantDotClass: Record<StatusBadgeVariant, string> = {
  default: "bg-[var(--neo-text-tertiary)]",
  success: "bg-[var(--neo-emerald)] dark:bg-emerald-300",
  warning: "bg-[var(--neo-gold)] dark:bg-[var(--neo-gold-soft)]",
  danger: "bg-rose-600 dark:bg-rose-300",
  muted: "bg-[var(--neo-text-tertiary)]",
};

export interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
  showDot?: boolean;
}

export function statusBadgeVariantClass(variant: StatusBadgeVariant = "default") {
  return cn(badgeBaseClass, variantPillClass[variant] ?? variantPillClass.default);
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
    <span className={cn(statusBadgeVariantClass(variant), className)}>
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusBadgeDotClass(variant))}
        />
      ) : null}
      {label}
    </span>
  );
}

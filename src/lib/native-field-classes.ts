import { cn } from "@/lib/utils";

/** Filter bar: 36px height — aligns with `Input` / SaaS field spec. */
export const FILTER_CONTROL_CLASS = cn(
  "hh-focus-ring hh-type-text-entry h-hh-control-standard min-h-hh-control-standard max-h-hh-control-standard w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-hh-3 text-[var(--neo-text-primary)] shadow-none transition-colors duration-150 ease-out",
  "placeholder:text-[var(--neo-text-tertiary)] focus-visible:border-[var(--hh-border-strong)]",
  "disabled:cursor-not-allowed disabled:opacity-50 max-lg:!min-h-9",
  "dark:border-[var(--neo-border)] dark:bg-[var(--neo-surface-raised)] dark:text-[var(--neo-text-primary)]"
);

/** Native `<select>` — default forms; filter bars use `filterSelectClassName`. */
export function nativeSelectClassName(extra?: string) {
  return cn(
    "hh-focus-ring hh-type-text-entry h-hh-control-comfortable w-full appearance-none rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-hh-3 py-hh-2 text-[var(--neo-text-primary)] shadow-none",
    "transition-all duration-150 ease-out placeholder:text-[var(--neo-text-tertiary)] hover:bg-[var(--neo-surface-muted)]",
    "focus-visible:border-[var(--hh-border-strong)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "max-lg:min-h-[44px] lg:min-h-10 dark:border-[var(--neo-border)] dark:bg-[var(--neo-surface-raised)] dark:text-[var(--neo-text-primary)]",
    extra
  );
}

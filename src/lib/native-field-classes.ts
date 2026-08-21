import { cn } from "@/lib/utils";

/** Filter bar: 36px height — aligns with `Input` / SaaS field spec. */
export const FILTER_CONTROL_CLASS = cn(
  "hh-type-text-entry h-9 min-h-9 max-h-9 w-full rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 text-[var(--neo-text-primary)] shadow-none outline-none transition-all duration-150 ease-out",
  "placeholder:text-[var(--neo-text-tertiary)] focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-50 max-lg:!min-h-9",
  "dark:border-[var(--neo-border)] dark:bg-[var(--neo-surface-raised)] dark:text-[var(--neo-text-primary)]"
);

/** Native `<select>` — default forms; filter bars use `filterSelectClassName`. */
export function nativeSelectClassName(extra?: string) {
  return cn(
    "hh-type-text-entry h-10 w-full appearance-none rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 py-2 text-[var(--neo-text-primary)] shadow-none",
    "transition-all duration-150 ease-out placeholder:text-[var(--neo-text-tertiary)] hover:bg-[var(--neo-surface-muted)]",
    "focus-visible:border-[var(--neo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "max-lg:min-h-[44px] lg:min-h-10 dark:border-[var(--neo-border)] dark:bg-[var(--neo-surface-raised)] dark:text-[var(--neo-text-primary)]",
    extra
  );
}

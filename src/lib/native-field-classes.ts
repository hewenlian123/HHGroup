import { cn } from "@/lib/utils";

/** Filter bar: 36px height — aligns with `Input` / SaaS field spec. */
export const FILTER_CONTROL_CLASS = cn(
  "hh-focus-ring hh-type-text-entry h-hh-control-standard min-h-[var(--hh-control-height-standard)] max-h-[var(--hh-control-height-standard)] w-full rounded-hh-compact border border-[var(--hh-input)] bg-[var(--hh-input-background)] px-hh-3 text-[var(--hh-text-primary)] shadow-none transition-colors duration-150 ease-out",
  "placeholder:text-[var(--hh-text-tertiary)]",
  "hover:border-[var(--hh-border-emphasis)] focus-visible:border-[var(--hh-ring)]",
  "disabled:cursor-not-allowed disabled:bg-[var(--hh-l2-operational-surface)] disabled:opacity-50 max-lg:!min-h-9"
);

/** Native `<select>` — default forms; filter bars use `filterSelectClassName`. */
export function nativeSelectClassName(extra?: string) {
  return cn(
    "hh-focus-ring hh-type-text-entry h-hh-control-standard w-full appearance-none rounded-hh-compact border border-[var(--hh-input)] bg-[var(--hh-input-background)] px-hh-3 py-hh-2 text-[var(--hh-text-primary)] shadow-none",
    "transition-[background-color,border-color,box-shadow,color] duration-150 ease-out placeholder:text-[var(--hh-text-tertiary)] hover:border-[var(--hh-border-emphasis)] focus-visible:border-[var(--hh-ring)]",
    "focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:bg-[var(--hh-l2-operational-surface)] disabled:opacity-50",
    "max-lg:min-h-[44px] lg:min-h-[var(--hh-control-height-standard)]",
    extra
  );
}

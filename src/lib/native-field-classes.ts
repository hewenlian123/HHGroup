import { cn } from "@/lib/utils";

/** Filter bar: 36px height — aligns with `Input` / SaaS field spec. */
export const FILTER_CONTROL_CLASS = cn(
  "h-9 min-h-9 max-h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-text-primary shadow-none outline-none transition-all duration-150 ease-out",
  "placeholder:text-text-secondary focus-visible:border-brand-primary focus-visible:ring-1 focus-visible:ring-brand-primary",
  "disabled:cursor-not-allowed disabled:opacity-50 max-lg:!min-h-9 max-lg:text-sm",
  "dark:border-border dark:bg-card dark:text-foreground"
);

/** Native `<select>` — default forms; filter bars use `filterSelectClassName`. */
export function nativeSelectClassName(extra?: string) {
  return cn(
    "h-10 w-full appearance-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-text-primary shadow-none",
    "transition-all duration-150 ease-out placeholder:text-text-secondary hover:bg-gray-50/80 dark:hover:bg-muted/30",
    "focus-visible:border-brand-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-primary",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "max-lg:min-h-[44px] lg:min-h-10 dark:border-border dark:bg-card dark:text-foreground",
    extra
  );
}

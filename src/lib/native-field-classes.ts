import { cn } from "@/lib/utils";

/** Filter bar: 36px height, 13px text — merges with Input/Select (overrides default h-10). */
export const FILTER_CONTROL_CLASS = cn(
  "h-9 min-h-9 max-h-9 w-full rounded-lg border-[0.5px] border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] shadow-none outline-none transition-colors",
  "placeholder:text-[#9CA3AF] focus-visible:border-[#111827] focus-visible:ring-2 focus-visible:ring-[#111827]/10",
  "disabled:cursor-not-allowed disabled:opacity-50 max-lg:!min-h-9 max-lg:text-[13px]",
  "dark:border-border dark:bg-card dark:text-foreground"
);

/** Native `<select>` — default forms; filter bars use `filterSelectClassName`. */
export function nativeSelectClassName(extra?: string) {
  return cn(
    "h-10 w-full appearance-none rounded-lg border-[0.5px] border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] shadow-none",
    "transition-colors placeholder:text-[#6B7280]",
    "focus-visible:outline-none focus-visible:border-[#111827] focus-visible:ring-2 focus-visible:ring-[#111827]/15",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "max-lg:min-h-[44px] lg:min-h-10 dark:border-border dark:bg-card dark:text-foreground",
    extra
  );
}

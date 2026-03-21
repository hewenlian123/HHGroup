import { cn } from "@/lib/utils";

/** Native `<select>` — matches `Input` / Projects field styling. */
export function nativeSelectClassName(extra?: string) {
  return cn(
    "h-10 w-full appearance-none rounded-lg border border-[#EBEBE9] bg-white px-3 py-2 text-sm text-[#2D2D2D] shadow-sm",
    "transition-colors placeholder:text-gray-400",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D2D2D]/10",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "max-lg:min-h-[44px] lg:min-h-10 dark:border-border dark:bg-card dark:text-foreground",
    extra
  );
}

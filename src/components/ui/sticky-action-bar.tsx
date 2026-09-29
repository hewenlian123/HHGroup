import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Mobile action row used on invoice detail. Sits above the bottom nav. */
export function StickyActionBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 z-20 flex items-center gap-2.5 border-t border-[var(--hh-line)] bg-[var(--hh-surface)] px-4 py-3 xl:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    />
  );
}

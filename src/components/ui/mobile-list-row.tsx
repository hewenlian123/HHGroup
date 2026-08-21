import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export interface MobileListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  selected?: boolean;
}

/** Responsive operational row with the same states as the desktop table row. */
export const MobileListRow = React.forwardRef<HTMLDivElement, MobileListRowProps>(
  ({ asChild = false, className, selected = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        data-state={selected ? "selected" : undefined}
        aria-selected={selected || undefined}
        className={cn(
          "hh-focus-ring group flex min-h-hh-touch min-w-0 items-center gap-hh-3 rounded-hh-standard px-hh-3 py-hh-3 transition-colors duration-150 ease-out",
          "hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]",
          "data-[state=selected]:border-[var(--hh-border-strong)] data-[state=selected]:bg-[var(--hh-l3-selected)]",
          TYPO.body,
          className
        )}
        {...props}
      />
    );
  }
);
MobileListRow.displayName = "MobileListRow";

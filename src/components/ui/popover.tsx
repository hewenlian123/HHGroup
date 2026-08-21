"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { motionPopoverLayer } from "@/lib/motion-system";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  /** Preserve the legacy dark portal by default; shared theme-aware controls may opt out. */
  themeScope?: "dark" | "light" | "inherit";
};

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "start", sideOffset = 4, themeScope = "dark", ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        themeScope === "dark" && "dark",
        "z-50 w-auto overflow-visible rounded-md border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] p-0 text-[var(--neo-text-primary)] shadow-floating outline-none",
        motionPopoverLayer,
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };

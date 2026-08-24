"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { motionPopoverLayer } from "@/lib/motion-system";
import { TYPO } from "@/lib/typography";
import { useHhPortalContainer, useHhTheme } from "@/contexts/hh-theme-context";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  /** Explicit scope only for bounded exceptions such as the estimate glass calendar. */
  themeScope?: "dark" | "light" | "inherit";
};

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "start", sideOffset = 4, themeScope = "inherit", ...props }, ref) => {
  const portalContainer = useHhPortalContainer();
  const inherited = useHhTheme();
  const theme =
    themeScope === "dark"
      ? "neo-dark"
      : themeScope === "light"
        ? "document-light"
        : inherited.theme;
  return (
    <PopoverPrimitive.Portal container={portalContainer ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        data-hh-context={inherited.context}
        data-hh-theme={theme}
        className={cn(
          "z-50 w-auto overflow-visible rounded-hh-standard border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] p-0 text-[var(--hh-text-primary)] shadow-floating outline-none",
          TYPO.body,
          motionPopoverLayer,
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };

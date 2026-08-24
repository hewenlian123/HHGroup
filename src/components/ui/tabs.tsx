"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { motionInputFocus } from "@/lib/motion-system";
import { TYPO } from "@/lib/typography";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "hh-touch-min inline-flex h-hh-control-standard items-center gap-hh-1 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-1 text-[var(--hh-text-secondary)]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "hh-touch-min inline-flex items-center justify-center whitespace-nowrap rounded-hh-compact px-hh-3 py-1.5 touch-manipulation transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--hh-l3-selected)] data-[state=active]:text-[var(--hh-text-primary)] data-[state=inactive]:hover:bg-[var(--hh-l3-hover)] data-[state=inactive]:hover:text-[var(--hh-text-primary)] active:bg-[var(--hh-l3-pressed)] active:duration-100",
      TYPO.button,
      motionInputFocus,
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("hh-focus-ring mt-4", className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

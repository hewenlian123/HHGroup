"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { motionInputFocus } from "@/lib/motion-system";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "hh-touch-min inline-flex h-hh-control-standard items-center gap-hh-1 rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-1 text-[var(--neo-text-secondary)]",
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
      "hh-touch-min inline-flex items-center justify-center whitespace-nowrap rounded-hh-compact px-hh-3 py-1.5 text-sm font-medium touch-manipulation transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--hh-l3-selected)] data-[state=active]:text-[var(--neo-text-primary)] data-[state=inactive]:hover:-translate-y-px data-[state=inactive]:hover:bg-[var(--hh-l3-hover)] data-[state=inactive]:hover:text-[var(--neo-text-primary)] active:scale-[0.97] active:bg-[var(--hh-l3-pressed)] active:duration-100 max-md:active:scale-[0.96]",
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
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

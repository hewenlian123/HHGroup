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
      "hh-touch-min inline-flex h-hh-control-standard items-end gap-hh-4 border-b border-[var(--hh-border)] bg-transparent text-[var(--hh-text-secondary)]",
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
      "hh-touch-min -mb-px inline-flex items-center justify-center whitespace-nowrap border-b-2 border-transparent px-hh-1 py-1.5 touch-manipulation transition-[border-color,color] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-[var(--hh-accent-primary)] data-[state=active]:text-[var(--hh-accent-primary)] data-[state=inactive]:hover:text-[var(--hh-text-primary)]",
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

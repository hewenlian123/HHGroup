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
      "hh-touch-min relative -mb-px inline-flex items-center justify-center whitespace-nowrap border-b-2 border-transparent px-hh-1 py-1.5 touch-manipulation transition-colors duration-fast ease-motion-out after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-center after:scale-x-0 after:bg-[var(--hh-accent-primary)] after:opacity-0 after:transition-[transform,opacity] after:duration-standard after:ease-motion-out data-[state=active]:text-[var(--hh-accent-primary)] data-[state=active]:after:scale-x-100 data-[state=active]:after:opacity-100 data-[state=inactive]:hover:text-[var(--hh-text-primary)] motion-reduce:after:transition-none disabled:pointer-events-none disabled:opacity-50",
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

"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Optional class for the content panel. */
  className?: string;
}

/** Right-side drawer for editing/creation. Minimal style, no heavy background. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full max-w-md border-l border-border/60 bg-background p-6 shadow-[var(--shadow-0)] sm:max-w-md",
          "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          className
        )}
      >
        {(title || description) && (
          <SheetHeader>
            {title && <SheetTitle className="text-base font-semibold">{title}</SheetTitle>}
            {description && (
              <SheetDescription className="text-sm text-muted-foreground">
                {description}
              </SheetDescription>
            )}
          </SheetHeader>
        )}
        <div className={cn((title || description) && "mt-4")}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}

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
import { TYPO } from "@/lib/typography";

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
          "flex h-full w-full max-w-md flex-col gap-0 border-l border-[var(--hh-border-strong)] bg-[var(--hh-l5-task-surface)] p-0 text-[var(--neo-text-primary)] shadow-task sm:max-w-md",
          className
        )}
      >
        {(title || description) && (
          <SheetHeader className="border-b border-[var(--hh-border)] p-hh-task-mobile pr-12 text-left md:p-hh-task-desktop md:pr-12">
            {title && (
              <SheetTitle className="text-base font-semibold text-[var(--neo-text-primary)]">
                {title}
              </SheetTitle>
            )}
            {description && (
              <SheetDescription className={TYPO.mutedText}>{description}</SheetDescription>
            )}
          </SheetHeader>
        )}
        <div className="mobile-native-scroll min-h-0 flex-1 overflow-y-auto p-hh-task-mobile pb-[calc(var(--hh-task-padding-mobile)+env(safe-area-inset-bottom))] md:p-hh-task-desktop md:pb-[calc(var(--hh-task-padding-desktop)+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
          "dark flex h-full w-full max-w-md flex-col gap-0 border-l border-[var(--neo-border)] bg-[var(--neo-surface-raised)] p-0 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)] sm:max-w-md",
          "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          className
        )}
      >
        {(title || description) && (
          <SheetHeader className="border-b border-[var(--neo-border)] px-5 py-4 pr-12 text-left">
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
        <div className="mobile-native-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

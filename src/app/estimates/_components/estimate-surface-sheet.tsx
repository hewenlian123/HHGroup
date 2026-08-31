"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";
import {
  estimateSurfaceSheetClassName,
  type EstimateSurfaceSheetKind,
} from "./estimate-surface-sheet-class";

export { estimateSurfaceSheetClassName } from "./estimate-surface-sheet-class";
export type { EstimateSurfaceSheetKind } from "./estimate-surface-sheet-class";

export type EstimateSurfaceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface: EstimateSurfaceSheetKind;
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  testId?: string;
};

/**
 * Controlled visual shell for Estimate-owned task surfaces.
 *
 * The caller remains the single owner of state, forms, and actions. This shell
 * intentionally supplies presentation, focus management, and responsive width
 * only so prototype-local behavior is never duplicated.
 */
export function EstimateSurfaceSheet({
  open,
  onOpenChange,
  surface,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  testId,
}: EstimateSurfaceSheetProps): React.ReactElement {
  const openerRef = React.useRef<HTMLElement | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(estimateSurfaceSheetClassName(surface, className), "[&>button]:z-10")}
        data-estimate-surface={surface}
        data-testid={testId}
        onOpenAutoFocus={() => {
          const activeElement = document.activeElement;
          openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => openerRef.current?.focus());
        }}
      >
        <SheetHeader className={EB.sheetHeader}>
          <SheetTitle className={EB.sheetTitle}>{title}</SheetTitle>
          <SheetDescription className="text-hh-metadata text-[var(--hh-text-tertiary)]">
            {description}
          </SheetDescription>
        </SheetHeader>
        <div className={cn(EB.sheetContent, contentClassName)}>{children}</div>
        {footer ? <SheetFooter className={EB.sheetFooter}>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}

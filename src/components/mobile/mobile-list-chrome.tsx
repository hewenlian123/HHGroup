"use client";

import * as React from "react";
import Link from "next/link";
import { Filter, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OS } from "@/lib/typography";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Vertical rhythm on small screens; horizontal padding comes from `.page-container`. */
export const mobileListPagePaddingClass = "max-md:!py-2.5";

export function MobileListHeader({
  title,
  fab,
  tone = "canvas",
}: {
  title: string;
  fab: React.ReactNode;
  tone?: "canvas" | "page";
}) {
  return (
    <div
      data-neo-mobile-list-header={tone}
      className="flex h-11 shrink-0 items-center justify-between gap-3 md:hidden"
    >
      <h1
        className={cn(
          "text-base font-medium tracking-normal",
          tone === "canvas" ? "text-[var(--neo-canvas-text-primary)]" : "text-text-primary"
        )}
      >
        {title}
      </h1>
      {fab}
    </div>
  );
}

export function MobileFabPlus({ href, ariaLabel }: { href: string; ariaLabel: string }) {
  return (
    <Link
      href={href}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[var(--neo-graphite-900)] text-white shadow-[0_10px_26px_rgba(0,0,0,0.22)] ring-1 ring-black/10"
      aria-label={ariaLabel}
    >
      <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
    </Link>
  );
}

export function MobileFabButton({
  ariaLabel,
  onClick,
  className,
}: {
  ariaLabel: string;
  onClick: () => void;
  /** e.g. `h-11 w-11` for 44px minimum tap targets */
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-white/[0.08] bg-[var(--neo-graphite-900)] text-white shadow-[0_10px_26px_rgba(0,0,0,0.22)] ring-1 ring-black/10",
        className
      )}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
    </button>
  );
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  title = "Filters",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-[1.5rem] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileSearchFiltersRow({
  searchSlot,
  onOpenFilters,
  activeFilterCount,
  filterSheetOpen,
  filtersTriggerClassName,
}: {
  searchSlot: React.ReactNode;
  onOpenFilters: () => void;
  activeFilterCount: number;
  /** For aria-expanded */
  filterSheetOpen: boolean;
  /** e.g. min-h-[44px] to align with touch-sized search inputs */
  filtersTriggerClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2 md:hidden">
      <div className="min-w-0 flex-1">{searchSlot}</div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-9 shrink-0 gap-1.5 rounded-sm px-2.5", filtersTriggerClassName)}
        onClick={onOpenFilters}
        aria-expanded={filterSheetOpen}
      >
        <Filter className="h-4 w-4 shrink-0" aria-hidden />
        <span>Filters</span>
        {activeFilterCount > 0 ? (
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center px-1.5 text-[10px] tabular-nums"
          >
            {activeFilterCount}
          </Badge>
        ) : null}
      </Button>
    </div>
  );
}

export function MobileEmptyState({
  icon,
  message,
  action,
}: {
  icon: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(OS.emptyState, "flex flex-col items-center px-4 py-10 md:hidden")}>
      <div className="text-[var(--neo-text-secondary)]">{icon}</div>
      <p className="mt-3 text-center text-sm text-[var(--neo-text-secondary)]">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

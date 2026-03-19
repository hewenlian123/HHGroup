"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  Camera,
  Receipt,
  Hammer,
  CheckCircle,
  AlertTriangle,
  FilePen,
  DollarSign,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useLaborAddEntry } from "@/contexts/labor-add-entry-context";

/**
 * FAB: mobile and tablet only (screen width < 1024px).
 * 56px circle, black, white "+", shadow.
 * Opens bottom sheet menu with quick actions.
 * Desktop layout unchanged (hidden lg:).
 */
const LINK_ACTIONS_TOP = [
  { label: "Upload Photo", href: "/site-photos/upload", icon: Camera },
  { label: "Upload Receipt", href: "/upload-receipt", icon: Receipt },
] as const;

const LINK_ACTIONS_REST = [
  { label: "New Task", href: "/tasks/new", icon: CheckCircle },
  { label: "New Punch Issue", href: "/punch-list/new", icon: AlertTriangle },
  { label: "Create Change Order", href: "/projects/change-orders/new", icon: FilePen },
  { label: "New Expense", href: "/financial/expenses/new", icon: DollarSign },
] as const;

export function FloatingActionButton() {
  const [open, setOpen] = React.useState(false);
  const laborAddEntry = useLaborAddEntry();

  return (
    <>
      <div
        className={cn(
          "fixed z-40 right-4 lg:hidden",
          "bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.5rem)] md:bottom-6"
        )}
        aria-label="Quick actions"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-lg",
            "transition-opacity hover:bg-black/90 active:opacity-90",
            "focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2"
          )}
          aria-label="Open quick actions"
        >
          <Plus className="h-6 w-6" aria-hidden />
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className={cn(
            "rounded-t-xl border-t border-border/60 p-0 max-lg:max-h-[85vh]",
            "pb-[env(safe-area-inset-bottom,0px)]",
            "[&>button]:max-lg:min-h-[44px] [&>button]:max-lg:min-w-[44px]"
          )}
        >
          <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle className="text-base font-semibold">Quick actions</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col py-2" aria-label="Quick actions">
            {LINK_ACTIONS_TOP.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[48px] items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground",
                  "transition-colors active:bg-muted/50 hover:bg-muted/30"
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                {label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                laborAddEntry?.triggerOpenDailyEntry();
                setOpen(false);
              }}
              className={cn(
                "flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground",
                "transition-colors active:bg-muted/50 hover:bg-muted/30"
              )}
            >
              <Hammer className="h-5 w-5 shrink-0 text-muted-foreground" />
              Add Labor Entry
            </button>
            {LINK_ACTIONS_REST.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[48px] items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground",
                  "transition-colors active:bg-muted/50 hover:bg-muted/30"
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                {label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

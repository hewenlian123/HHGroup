"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { prefetchRoutes, QUICK_ACTION_ROUTES, runWhenIdle } from "@/lib/route-prefetch";

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
  /** Project-scoped create lives under `/projects/[id]/change-orders/new`; hub is `/change-orders`. */
  { label: "Create Change Order", href: "/change-orders", icon: FilePen },
  { label: "New Expense", href: "/financial/expenses/new", icon: DollarSign },
] as const;

function logQuickAction(label: string, detail?: string) {
  if (process.env.NODE_ENV === "development") {
    console.log("[QuickActions] click:", label, detail ?? "");
  }
}

const quickActionRowClass = cn(
  "flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground",
  "cursor-pointer touch-manipulation relative z-[1] select-none border-0 bg-transparent",
  "rounded-none transition-[background-color,transform] duration-75",
  "hover:bg-muted/30 active:bg-muted/60 max-lg:active:scale-[0.99]"
);

function QuickActionNavButton({
  label,
  href,
  icon: Icon,
  onClose,
  router,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <button
      type="button"
      className={quickActionRowClass}
      onPointerDown={() => router.prefetch(href)}
      onClick={() => {
        logQuickAction(label, href);
        onClose();
        requestAnimationFrame(() => {
          router.push(href);
        });
      }}
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground pointer-events-none" aria-hidden />
      {label}
    </button>
  );
}

export function FloatingActionButton() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const laborAddEntry = useLaborAddEntry();

  React.useEffect(() => {
    return runWhenIdle(() => prefetchRoutes(router, [...QUICK_ACTION_ROUTES]));
  }, [router]);

  React.useEffect(() => {
    if (!open) return;
    prefetchRoutes(router, [...QUICK_ACTION_ROUTES, "/labor"]);
  }, [open, router]);

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
          onClick={() => {
            logQuickAction("FAB open sheet");
            setOpen(true);
          }}
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-lg",
            "cursor-pointer touch-manipulation transition-opacity hover:bg-black/90 active:opacity-90 active:scale-[0.97]",
            "focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2"
          )}
          aria-label="Open quick actions"
        >
          <Plus className="h-6 w-6 pointer-events-none" aria-hidden />
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "rounded-t-xl border-t border-border/60 p-0 max-lg:max-h-[85vh]",
            "pb-[env(safe-area-inset-bottom,0px)]",
            "[&>button]:max-lg:min-h-[44px] [&>button]:max-lg:min-w-[44px]"
          )}
        >
          <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle className="text-base font-semibold">Quick actions</SheetTitle>
          </SheetHeader>
          <nav
            className="relative z-[1] flex flex-col py-2 touch-manipulation"
            aria-label="Quick actions"
          >
            {LINK_ACTIONS_TOP.map(({ label, href, icon }) => (
              <QuickActionNavButton
                key={href}
                label={label}
                href={href}
                icon={icon}
                onClose={() => setOpen(false)}
                router={router}
              />
            ))}
            <button
              type="button"
              className={quickActionRowClass}
              onPointerDown={() => router.prefetch("/labor")}
              onClick={() => {
                logQuickAction("Add Labor Entry", "/labor?addDaily=1");
                const handled = laborAddEntry?.triggerOpenDailyEntry() ?? false;
                setOpen(false);
                if (!handled) {
                  requestAnimationFrame(() => router.push("/labor?addDaily=1"));
                }
              }}
            >
              <Hammer
                className="h-5 w-5 shrink-0 text-muted-foreground pointer-events-none"
                aria-hidden
              />
              Add Labor Entry
            </button>
            {LINK_ACTIONS_REST.map(({ label, href, icon }) => (
              <QuickActionNavButton
                key={href}
                label={label}
                href={href}
                icon={icon}
                onClose={() => setOpen(false)}
                router={router}
              />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

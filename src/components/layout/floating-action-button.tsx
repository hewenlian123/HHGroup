"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  Camera,
  Receipt,
  Hammer,
  CheckCircle,
  AlertTriangle,
  FilePen,
  DollarSign,
  FolderKanban,
} from "lucide-react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useLaborAddEntry } from "@/contexts/labor-add-entry-context";
import { prefetchRoutes, QUICK_ACTION_ROUTES, runWhenIdle } from "@/lib/route-prefetch";
import { shouldHideFloatingQuickActionFab } from "@/lib/floating-fab-visibility";

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
  { label: "New Project", href: "/projects/new", icon: FolderKanban },
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

const FAB_SPRING = { type: "spring" as const, stiffness: 260, damping: 20 };

const quickActionRowClass = cn(
  "hh-row-interactive flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-foreground max-lg:py-3",
  "cursor-pointer touch-manipulation relative z-[1] select-none border-0 bg-transparent",
  "rounded-none transition-[transform] duration-75 max-lg:active:scale-[0.99]"
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
  const pathname = usePathname();
  const laborAddEntry = useLaborAddEntry();
  const hiddenForPage = shouldHideFloatingQuickActionFab(pathname);

  React.useEffect(() => {
    return runWhenIdle(() => prefetchRoutes(router, [...QUICK_ACTION_ROUTES]));
  }, [router]);

  React.useEffect(() => {
    if (!open) return;
    prefetchRoutes(router, [...QUICK_ACTION_ROUTES, "/labor"]);
  }, [open, router]);

  if (hiddenForPage) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "fixed z-40 right-4 lg:hidden",
          /* bottom-20 (5rem) + safe area — clears bottom tab bar */
          "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]"
        )}
        aria-label="Quick actions"
      >
        <motion.button
          type="button"
          onClick={() => {
            logQuickAction("FAB open sheet");
            setOpen(true);
          }}
          whileTap={{ scale: 0.9 }}
          transition={FAB_SPRING}
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-lg",
            "cursor-pointer touch-manipulation hover:bg-black/90",
            "focus:outline-none focus:ring-2 focus:ring-black/30 focus:ring-offset-2"
          )}
          aria-label="Open quick actions"
        >
          <Plus className="h-6 w-6 pointer-events-none" aria-hidden />
        </motion.button>
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
          <motion.div
            className="flex max-h-[inherit] flex-col"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={FAB_SPRING}
          >
            <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
              <SheetTitle className="text-base font-medium">Quick actions</SheetTitle>
            </SheetHeader>
            <nav
              className="relative z-[1] flex flex-col py-1.5 touch-manipulation max-lg:py-2"
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
                    try {
                      window.sessionStorage.setItem("hh.openLaborEntryFromFab", "1");
                    } catch {
                      // ignore storage failures; fallback path still navigates
                    }
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
          </motion.div>
        </SheetContent>
      </Sheet>
    </>
  );
}

"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Receipt, Hammer, FilePen, DollarSign, FolderKanban } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useLaborAddEntry } from "@/contexts/labor-add-entry-context";
import { prefetchRoutes, QUICK_ACTION_ROUTES, runWhenIdle } from "@/lib/route-prefetch";
import { shouldHideFloatingQuickActionFab } from "@/lib/floating-fab-visibility";
import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";

/**
 * FAB: mobile and tablet only (screen width < 1024px).
 * Canonical floating action with the shared action and depth roles.
 * Opens bottom sheet menu with quick actions.
 * Desktop layout unchanged (hidden lg:).
 */
const LINK_ACTIONS_TOP = [{ ...UPLOAD_RECEIPT_ACTION, icon: Receipt }] as const;

const LINK_ACTIONS_REST = [
  { label: "New Project", href: "/projects/new", icon: FolderKanban },
  /** Project-scoped create lives under `/projects/[id]/change-orders/new`; hub is `/change-orders`. */
  { label: "Create Change Order", href: "/change-orders", icon: FilePen },
  { label: "New Expense", href: "/financial/expenses/new", icon: DollarSign },
] as const;

const quickActionRowClass = cn(
  "hh-row-interactive flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-foreground max-lg:py-3",
  "cursor-pointer touch-manipulation relative z-[1] select-none border-0 bg-transparent",
  "rounded-none transition-colors duration-100 active:bg-[var(--hh-l3-pressed)]"
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
    if (hiddenForPage) return;
    return runWhenIdle(() => prefetchRoutes(router, [...QUICK_ACTION_ROUTES]));
  }, [hiddenForPage, router]);

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
          "fixed right-3 z-40 lg:hidden sm:right-4",
          /* Keep the quick action clear of the bottom nav, toast stack, and iOS home indicator. */
          "bottom-[calc(5.5rem+env(safe-area-inset-bottom_0px))] sm:bottom-[calc(5.25rem+env(safe-area-inset-bottom_0px))]"
        )}
        aria-label="Quick actions"
      >
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          className={cn(
            "hh-focus-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border-floating)] bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] shadow-floating",
            "cursor-pointer touch-manipulation transition-opacity duration-100 hover:opacity-90 active:opacity-80 sm:h-14 sm:w-14"
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
            "pb-[env(safe-area-inset-bottom_0px)]",
            "[&>button]:max-lg:min-h-[44px] [&>button]:max-lg:min-w-[44px]"
          )}
        >
          <div className="flex max-h-[inherit] flex-col">
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
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

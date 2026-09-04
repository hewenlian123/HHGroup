"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { FloatingActionButton } from "./floating-action-button";
import { ScrollLockRecovery } from "./scroll-lock-recovery";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { SystemHealthPoller } from "@/components/system-health/system-health-poller";
import { NeoCommandPalette } from "@/components/command/neo-command-palette";
import { cn } from "@/lib/utils";
import { useIsTabletNav } from "@/hooks/use-is-tablet-nav";
import { useHhPortalContainer } from "@/contexts/hh-theme-context";

function slot(name: string) {
  return typeof document === "undefined"
    ? null
    : document.querySelector(`[data-app-shell-${name}-slot]`);
}

export function AppShellChrome({
  pathname,
  bare,
  integratedEstimateWorkspace,
}: {
  pathname: string | null;
  bare: boolean;
  integratedEstimateWorkspace: boolean;
}) {
  const searchParams = useSearchParams();
  const isTabletNav = useIsTabletNav();
  const portalContainer = useHhPortalContainer();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [tabletSidebarExpanded, setTabletSidebarExpanded] = React.useState(false);
  const commandTriggerRef = React.useRef<HTMLElement | null>(null);
  const mobileNavigationTriggerRef = React.useRef<HTMLElement | null>(null);
  const workerMode =
    (pathname === "/labor/daily" || pathname === "/labor/daily-entry") &&
    searchParams?.get("mode")?.toLowerCase() === "worker";

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("hh.sidebarCollapsed") === "1");
    } catch {}
  }, []);
  React.useEffect(() => {
    try {
      window.localStorage.setItem("hh.sidebarCollapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);
  React.useEffect(() => {
    setTabletSidebarExpanded(false);
  }, [pathname]);

  const toggleSidebar = React.useCallback(() => {
    if (isTabletNav) setTabletSidebarExpanded((value) => !value);
    else setCollapsed((value) => !value);
  }, [isTabletNav]);

  const openCommandPalette = React.useCallback(() => {
    commandTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCommandOpen(true);
  }, []);

  const handleCommandOpenChange = React.useCallback((open: boolean) => {
    if (open) {
      commandTriggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setCommandOpen(true);
      return;
    }
    setCommandOpen(false);
    window.requestAnimationFrame(() => commandTriggerRef.current?.focus());
  }, []);

  const openMobileNavigation = React.useCallback(() => {
    mobileNavigationTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMobileOpen(true);
  }, []);

  const handleMobileOpenChange = React.useCallback((open: boolean) => {
    if (open) {
      mobileNavigationTriggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMobileOpen(true);
      return;
    }
    setMobileOpen(false);
    window.requestAnimationFrame(() => mobileNavigationTriggerRef.current?.focus());
  }, []);

  if (bare || workerMode) return <ScrollLockRecovery />;

  const sidebar = slot("sidebar") ?? portalContainer ?? document.body;
  const topbar = slot("topbar") ?? portalContainer ?? document.body;
  const bottom = slot("bottom") ?? portalContainer ?? document.body;

  return (
    <>
      {createPortal(
        <Sidebar
          className="hidden sm:flex shrink-0 transition-[width] duration-200"
          collapsed={isTabletNav ? !tabletSidebarExpanded : collapsed}
          onToggleCollapsed={toggleSidebar}
        />,
        sidebar
      )}
      {createPortal(
        <Topbar
          onOpenSidebar={openMobileNavigation}
          onToggleSidebar={toggleSidebar}
          onOpenCommandPalette={openCommandPalette}
          integratedEstimateWorkspace={integratedEstimateWorkspace}
        />,
        topbar
      )}
      {createPortal(
        <>
          <BottomNav className="fixed bottom-0 left-0 right-0 z-30 sm:hidden" />
          <FloatingActionButton />
          <NeoCommandPalette open={commandOpen} onOpenChange={handleCommandOpenChange} />
          <Sheet open={mobileOpen} onOpenChange={handleMobileOpenChange}>
            <SheetContent
              side="left"
              className={cn(
                "w-hh-sidebar-expanded max-w-[85vw] p-0 shadow-none transition-transform duration-200 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
                "border-r border-[var(--hh-border-default)] bg-[var(--hh-surface-workspace)]"
              )}
            >
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <SheetDescription className="sr-only">
                Main HH Project OS navigation sections and module links.
              </SheetDescription>
              <Sidebar
                className="h-full w-full !rounded-none !border-none !shadow-none"
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <SystemHealthPoller />
          <PWAInstallPrompt />
          <ScrollLockRecovery />
        </>,
        bottom
      )}
    </>
  );
}

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "./sidebar";
import { WorkspaceNavigation } from "./workspace-navigation";
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
  }, []);

  const desktopNavigationQuery = integratedEstimateWorkspace
    ? "(min-width: 1200px)"
    : "(min-width: 640px)";

  const desktopNavigationTriggerSelector = integratedEstimateWorkspace
    ? "[data-app-shell-sidebar-slot] [data-sidebar-collapse] button"
    : '[data-app-topbar] [aria-label="Toggle sidebar"]';

  React.useEffect(() => {
    const desktopNavigation = window.matchMedia(desktopNavigationQuery);
    const closeMobileNavigation = () => {
      if (!desktopNavigation.matches) return;
      setMobileOpen(false);
    };
    // CSS may hide the restored opener before or after the media-query event.
    const restoreHiddenOpenerFocus = (event: FocusEvent) => {
      const opener = mobileNavigationTriggerRef.current;
      if (
        !mobileOpen &&
        desktopNavigation.matches &&
        event.target === opener &&
        !event.relatedTarget &&
        opener?.getClientRects().length === 0
      ) {
        document.querySelector<HTMLElement>(desktopNavigationTriggerSelector)?.focus();
      }
    };
    closeMobileNavigation();
    desktopNavigation.addEventListener("change", closeMobileNavigation);
    document.addEventListener("focusout", restoreHiddenOpenerFocus);
    return () => {
      desktopNavigation.removeEventListener("change", closeMobileNavigation);
      document.removeEventListener("focusout", restoreHiddenOpenerFocus);
    };
  }, [mobileOpen, desktopNavigationQuery, desktopNavigationTriggerSelector]);

  if (bare || workerMode) return <ScrollLockRecovery />;

  const sidebar = slot("sidebar") ?? portalContainer ?? document.body;
  const topbar = slot("topbar") ?? portalContainer ?? document.body;
  const workspace = slot("workspace");
  const bottom = slot("bottom") ?? portalContainer ?? document.body;

  return (
    <>
      {workspace &&
        !integratedEstimateWorkspace &&
        createPortal(<WorkspaceNavigation pathname={pathname ?? ""} />, workspace)}
      {createPortal(
        <Sidebar
          className="hidden shrink-0 sm:flex"
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
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const trigger = window.matchMedia(desktopNavigationQuery).matches
                  ? document.querySelector<HTMLElement>(desktopNavigationTriggerSelector)
                  : mobileNavigationTriggerRef.current;
                trigger?.focus();
              }}
              side="left"
              className={cn(
                "w-hh-sidebar-expanded max-w-[85vw] p-0 shadow-none",
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

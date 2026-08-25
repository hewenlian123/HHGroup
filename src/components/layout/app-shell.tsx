"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { FloatingActionButton } from "./floating-action-button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PWAInstallPrompt } from "../pwa-install-prompt";
import { SystemHealthProvider } from "@/contexts/system-health-context";
import { BreadcrumbOverrideProvider } from "@/contexts/breadcrumb-override-context";
import { LaborAddEntryProvider } from "@/contexts/labor-add-entry-context";
import { AttachmentPreviewProvider } from "@/contexts/attachment-preview-context";
import { SystemHealthPoller } from "@/components/system-health/system-health-poller";
import { NeoCommandPalette } from "@/components/command/neo-command-palette";
import { cn } from "@/lib/utils";
import { useIsTabletNav } from "@/hooks/use-is-tablet-nav";
import { ScrollLockRecovery } from "./scroll-lock-recovery";
import { ToastProvider } from "@/components/toast/toast-provider";
import {
  HhRouteThemeRoot,
  type HhContextName,
  type HhThemeName,
} from "@/contexts/hh-theme-context";
import {
  applyOperationalThemeMode,
  operationalThemeName,
  readOperationalThemeMode,
  type OperationalThemeMode,
} from "@/lib/operational-theme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTabletNav = useIsTabletNav();
  const modeParam = searchParams?.get("mode")?.toLowerCase() ?? "";
  const workerModeUrl =
    (pathname === "/labor/daily-entry" || pathname === "/labor/daily") && modeParam === "worker";
  const authPage =
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/unlock";
  const barePage =
    authPage ||
    pathname === "/receipt" ||
    pathname === "/upload-receipt" ||
    pathname?.startsWith("/upload-receipt/") ||
    pathname?.startsWith("/receipt/print/") ||
    workerModeUrl;
  const documentRoute = Boolean(
    pathname &&
    (pathname.startsWith("/receipt/print/") ||
      /^\/estimates\/[^/]+\/print(?:\/|$)/.test(pathname) ||
      /^\/estimates\/[^/]+\/payments\/[^/]+\/preview(?:\/|$)/.test(pathname) ||
      /^\/financial\/invoices\/[^/]+\/print(?:\/|$)/.test(pathname) ||
      /^\/materials\/[^/]+\/print(?:\/|$)/.test(pathname) ||
      /^\/workers\/[^/]+\/statement\/print(?:\/|$)/.test(pathname) ||
      /^\/labor\/payments\/[^/]+\/receipt(?:\/|$)/.test(pathname))
  );
  const viewerRoute = Boolean(
    pathname &&
    (/^\/estimates\/[^/]+\/preview(?:\/|$)/.test(pathname) ||
      /^\/financial\/invoices\/[^/]+\/preview(?:\/|$)/.test(pathname) ||
      /^\/materials\/[^/]+\/preview(?:\/|$)/.test(pathname))
  );
  const publicWorkerIntake =
    pathname === "/receipt" ||
    pathname === "/upload-receipt" ||
    pathname?.startsWith("/upload-receipt/") ||
    workerModeUrl;
  const routeContext: HhContextName = documentRoute
    ? "document-route"
    : viewerRoute
      ? "viewer"
      : authPage
        ? "auth"
        : publicWorkerIntake
          ? "public-worker-intake"
          : "operational";
  const [operationalThemeMode, setOperationalThemeMode] =
    React.useState<OperationalThemeMode>(readOperationalThemeMode);
  const routeTheme: HhThemeName = documentRoute
    ? "document-light"
    : viewerRoute
      ? "neo-dark"
      : authPage
        ? "auth"
        : publicWorkerIntake
          ? "public"
          : operationalThemeName(operationalThemeMode);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  /** When true on tablet, sidebar shows labels; when false, icon rail only. */
  const [tabletSidebarExpanded, setTabletSidebarExpanded] = React.useState(false);

  React.useEffect(() => {
    applyOperationalThemeMode(operationalThemeMode);
  }, [operationalThemeMode]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("hh.sidebarCollapsed");
      if (raw === "1") setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem("hh.sidebarCollapsed", collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  React.useEffect(() => {
    setTabletSidebarExpanded(false);
  }, [pathname]);

  const handleToggleSidebar = React.useCallback(() => {
    if (isTabletNav) {
      setTabletSidebarExpanded((e) => !e);
    } else {
      setCollapsed((c) => !c);
    }
  }, [isTabletNav]);

  if (barePage) {
    const printReceiptBg = pathname?.startsWith("/receipt/print/");
    return (
      <HhRouteThemeRoot
        context={routeContext}
        theme={routeTheme}
        className={printReceiptBg ? "min-h-screen bg-[#f5f5f5]" : "min-h-screen bg-workspace"}
      >
        <ToastProvider>
          <AttachmentPreviewProvider>
            <ScrollLockRecovery />
            {children}
          </AttachmentPreviewProvider>
        </ToastProvider>
      </HhRouteThemeRoot>
    );
  }

  return (
    <HhRouteThemeRoot context={routeContext} theme={routeTheme}>
      <ToastProvider>
        <AttachmentPreviewProvider>
          <BreadcrumbOverrideProvider>
            <SystemHealthProvider>
              <LaborAddEntryProvider>
                <ScrollLockRecovery />
                <SystemHealthPoller />
                <div className="app-shell hh-app-shell neo-app-shell flex min-h-0 overflow-hidden bg-canvas sm:p-hh-sidebar-inset">
                  {/* Tablet/Desktop (640px+): sidebar fixed left, collapsible. */}
                  <Sidebar
                    className="hidden sm:flex shrink-0 transition-[width] duration-200"
                    collapsed={isTabletNav ? !tabletSidebarExpanded : collapsed}
                    onToggleCollapsed={handleToggleSidebar}
                  />
                  {/* Mobile (<640px): slide-out drawer (hamburger menu). */}
                  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetContent
                      side="left"
                      className={cn(
                        "w-hh-sidebar-expanded max-w-[85vw] p-0 shadow-none transition-transform duration-200 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
                        "border-r border-[var(--hh-border)] bg-canvas"
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
                  <div
                    data-app-main-column
                    className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  >
                    <Topbar
                      onOpenSidebar={() => setMobileOpen(true)}
                      onToggleSidebar={handleToggleSidebar}
                      onOpenCommandPalette={() => setCommandOpen(true)}
                      operationalThemeMode={operationalThemeMode}
                      showOperationalThemeToggle={routeContext === "operational"}
                      onToggleOperationalTheme={() =>
                        setOperationalThemeMode((mode) => (mode === "dark" ? "light" : "dark"))
                      }
                    />
                    <main
                      data-app-scroll-root
                      className={cn(
                        "neo-workspace-canvas min-h-0 flex-1 scroll-smooth overflow-y-auto overflow-x-hidden overscroll-y-contain bg-canvas [-webkit-overflow-scrolling:touch]",
                        "pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0"
                      )}
                    >
                      {children}
                    </main>
                    <BottomNav className="fixed bottom-0 left-0 right-0 z-30 sm:hidden" />
                    <FloatingActionButton />
                    <NeoCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
                  </div>
                </div>
                <PWAInstallPrompt />
              </LaborAddEntryProvider>
            </SystemHealthProvider>
          </BreadcrumbOverrideProvider>
        </AttachmentPreviewProvider>
      </ToastProvider>
    </HhRouteThemeRoot>
  );
}

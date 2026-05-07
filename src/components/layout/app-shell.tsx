"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { FloatingActionButton } from "./floating-action-button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ToastProvider } from "../toast/toast-provider";
import { PWAInstallPrompt } from "../pwa-install-prompt";
import { SystemHealthProvider } from "@/contexts/system-health-context";
import { BreadcrumbOverrideProvider } from "@/contexts/breadcrumb-override-context";
import { LaborAddEntryProvider } from "@/contexts/labor-add-entry-context";
import { AttachmentPreviewProvider } from "@/contexts/attachment-preview-context";
import { SystemHealthPoller } from "@/components/system-health/system-health-poller";
import { cn } from "@/lib/utils";
import { useIsTabletNav } from "@/hooks/use-is-tablet-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTabletNav = useIsTabletNav();
  const modeParam = searchParams?.get("mode")?.toLowerCase() ?? "";
  const workerModeUrl =
    (pathname === "/labor/daily-entry" || pathname === "/labor/daily") && modeParam === "worker";
  const barePage =
    pathname === "/receipt" ||
    pathname === "/upload-receipt" ||
    pathname?.startsWith("/upload-receipt/") ||
    pathname?.startsWith("/receipt/print/") ||
    workerModeUrl;
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  /** When true on tablet, sidebar shows labels; when false, icon rail only. */
  const [tabletSidebarExpanded, setTabletSidebarExpanded] = React.useState(false);

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
      <ToastProvider>
        <AttachmentPreviewProvider>
          <div
            className={printReceiptBg ? "min-h-screen bg-[#f5f5f5]" : "min-h-screen bg-slate-50"}
          >
            {children}
          </div>
        </AttachmentPreviewProvider>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AttachmentPreviewProvider>
        <BreadcrumbOverrideProvider>
          <SystemHealthProvider>
            <LaborAddEntryProvider>
              <SystemHealthPoller />
              <div className="app-shell flex h-screen overflow-hidden bg-slate-50 dark:bg-background">
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
                      "w-[210px] max-w-[85vw] p-0 shadow-none transition-transform duration-200 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
                      "border-r border-white/[0.08] bg-[linear-gradient(180deg,#081225_0%,#0F172A_100%)]"
                    )}
                  >
                    <Sidebar
                      className="h-full w-full border-none"
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
                <div data-app-main-column className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <Topbar
                    onOpenSidebar={() => setMobileOpen(true)}
                    onToggleSidebar={handleToggleSidebar}
                  />
                  <main
                    className={cn(
                      "flex-1 scroll-smooth overflow-y-auto overflow-x-hidden bg-slate-50",
                      "pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0"
                    )}
                  >
                    {children}
                  </main>
                  <BottomNav className="fixed bottom-0 left-0 right-0 z-30 sm:hidden" />
                  <FloatingActionButton />
                </div>
              </div>
              <PWAInstallPrompt />
            </LaborAddEntryProvider>
          </SystemHealthProvider>
        </BreadcrumbOverrideProvider>
      </AttachmentPreviewProvider>
    </ToastProvider>
  );
}

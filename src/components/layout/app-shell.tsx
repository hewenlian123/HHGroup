"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { FloatingActionButton } from "./floating-action-button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ToastProvider } from "../toast/toast-provider";
import { PWAInstallPrompt } from "../pwa-install-prompt";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const barePage =
    pathname === "/receipt" ||
    pathname === "/upload-receipt" ||
    pathname?.startsWith("/upload-receipt/");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

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

  if (barePage) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-[#F2F2F4]">{children}</div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="app-shell flex h-screen overflow-hidden bg-[#F7F7F8]">
        {/* Desktop/Tablet: fixed sidebar (md and up). */}
        <Sidebar
          className="hidden md:flex shrink-0 transition-[width] duration-200"
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
        />
        {/* Mobile: drawer overlay */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[18rem] max-w-[85vw] p-0 transition-transform duration-200 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left"
          >
            <Sidebar className="h-full w-full border-none" onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar onOpenSidebar={() => setMobileOpen(true)} />
          <main className={cn("flex-1 overflow-y-auto bg-[#F7F7F8] pb-14 md:pb-0")}>{children}</main>
          <BottomNav className="fixed bottom-0 left-0 right-0 z-30 md:hidden" />
          <FloatingActionButton />
        </div>
      </div>
      <PWAInstallPrompt />
    </ToastProvider>
  );
}

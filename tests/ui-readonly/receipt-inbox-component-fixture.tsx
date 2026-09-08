import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ToastProvider } from "@/components/toast/toast-provider";
import { AttachmentPreviewProvider } from "@/contexts/attachment-preview-context";
import { HhRouteThemeRoot } from "@/contexts/hh-theme-context";
import { ExpensesPageClient } from "@/app/financial/expenses/expenses-client";

// Exact structural shell classes from AppShell; chrome/auth are outside this component test.
createRoot(document.getElementById("receipt-fixture")!).render(
  <AppRouterContext.Provider
    value={{
      back() {},
      forward() {},
      refresh() {},
      push() {},
      replace() {},
      prefetch: async () => {},
    }}
  >
    <PathnameContext.Provider value="/financial/inbox">
      <SearchParamsContext.Provider value={new URLSearchParams("date_kind=all")}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
            })
          }
        >
          <HhRouteThemeRoot context="operational" theme="operational-light">
            <ToastProvider>
              <AttachmentPreviewProvider>
                <div className="app-shell hh-app-shell flex min-h-0 overflow-hidden bg-[var(--hh-surface-workspace)] [font-family:var(--hh-font-family-sans)]">
                  <div
                    data-app-shell-sidebar-slot
                    className="hidden shrink-0 empty:w-hh-sidebar-expanded sm:block"
                  />
                  <div
                    data-app-main-column
                    className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  >
                    <div data-app-shell-topbar-slot className="shrink-0 empty:h-14" />
                    <div data-app-shell-workspace-slot className="shrink-0" />
                    <main
                      data-app-scroll-root
                      className="min-h-0 flex-1 scroll-smooth overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[var(--hh-surface-canvas)] [-webkit-overflow-scrolling:touch] pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0"
                    >
                      <ExpensesPageClient pool="inbox" />
                    </main>
                    <div data-app-shell-bottom-slot />
                  </div>
                </div>
              </AttachmentPreviewProvider>
            </ToastProvider>
          </HhRouteThemeRoot>
        </QueryClientProvider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  </AppRouterContext.Provider>
);

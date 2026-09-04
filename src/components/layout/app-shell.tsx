"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { ToastProvider } from "@/components/toast/toast-provider";
import { AttachmentPreviewProvider } from "@/contexts/attachment-preview-context";
import { BreadcrumbOverrideProvider } from "@/contexts/breadcrumb-override-context";
import {
  HhRouteThemeRoot,
  type HhContextName,
  type HhThemeName,
} from "@/contexts/hh-theme-context";
import { LaborAddEntryProvider } from "@/contexts/labor-add-entry-context";
import { SystemHealthProvider } from "@/contexts/system-health-context";

type AppShellProps = {
  children: React.ReactNode;
};

const AppShellChrome = dynamic(
  () => import("./app-shell-chrome").then((module) => module.AppShellChrome),
  { ssr: false }
);

function AppShellProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AttachmentPreviewProvider>{children}</AttachmentPreviewProvider>
    </ToastProvider>
  );
}

/**
 * Server-renderable structural shell used while isolating the client-only
 * chrome import graph. Route content intentionally remains in the HTML.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const authPage =
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/unlock";
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
    pathname?.startsWith("/upload-receipt/");
  const barePage =
    authPage ||
    pathname === "/receipt" ||
    pathname === "/upload-receipt" ||
    pathname?.startsWith("/upload-receipt/") ||
    pathname?.startsWith("/receipt/print/");
  const estimatePathSegments = pathname?.split("/").filter(Boolean) ?? [];
  const integratedEstimateWorkspace =
    estimatePathSegments[0] === "estimates" &&
    Boolean(estimatePathSegments[1]) &&
    (estimatePathSegments[1] === "new" ||
      estimatePathSegments.length === 2 ||
      estimatePathSegments[2] === "snapshot");
  const routeContext: HhContextName = documentRoute
    ? "document-route"
    : viewerRoute
      ? "viewer"
      : authPage
        ? "auth"
        : publicWorkerIntake
          ? "public-worker-intake"
          : "operational";
  const routeTheme: HhThemeName = documentRoute
    ? "document-light"
    : viewerRoute
      ? "operational-light"
      : authPage
        ? "auth"
        : publicWorkerIntake
          ? "public"
          : "operational-light";

  if (barePage) {
    const printReceiptBg = pathname?.startsWith("/receipt/print/");
    return (
      <HhRouteThemeRoot
        context={routeContext}
        theme={routeTheme}
        className={printReceiptBg ? "min-h-screen bg-[#f5f5f5]" : "min-h-screen bg-workspace"}
      >
        <AppShellProviders>
          <AppShellChrome pathname={pathname} bare integratedEstimateWorkspace={false} />
          {children}
        </AppShellProviders>
      </HhRouteThemeRoot>
    );
  }

  return (
    <HhRouteThemeRoot context={routeContext} theme={routeTheme}>
      <AppShellProviders>
        <BreadcrumbOverrideProvider>
          <SystemHealthProvider>
            <LaborAddEntryProvider>
              <div
                className="app-shell hh-app-shell flex min-h-0 overflow-hidden bg-[var(--hh-surface-workspace)] [font-family:var(--hh-font-family-sans)]"
                data-integrated-estimate-workspace={
                  integratedEstimateWorkspace ? "true" : undefined
                }
              >
                <div data-app-shell-sidebar-slot />
                <AppShellChrome
                  pathname={pathname}
                  bare={false}
                  integratedEstimateWorkspace={integratedEstimateWorkspace}
                />
                <div
                  data-app-main-column
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  <div data-app-shell-topbar-slot />
                  <main
                    data-app-scroll-root
                    className="min-h-0 flex-1 scroll-smooth overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[var(--hh-surface-canvas)] [-webkit-overflow-scrolling:touch] pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0"
                  >
                    {children}
                  </main>
                  <div data-app-shell-bottom-slot />
                </div>
              </div>
            </LaborAddEntryProvider>
          </SystemHealthProvider>
        </BreadcrumbOverrideProvider>
      </AppShellProviders>
    </HhRouteThemeRoot>
  );
}

/**
 * Routes to warm on mobile for instant navigation (Bottom nav, FAB, idle).
 */
export const BOTTOM_NAV_ROUTES = [
  "/dashboard",
  "/projects",
  "/labor",
  "/financial/expenses",
  "/documents",
] as const;

export const QUICK_ACTION_ROUTES = [
  "/site-photos/upload",
  "/upload-receipt",
  "/tasks/new",
  "/punch-list/new",
  "/change-orders",
  "/financial/expenses/new",
  "/labor",
] as const;

export type AppRouterLike = { prefetch: (href: string) => void };

export function prefetchRoutes(router: AppRouterLike, hrefs: readonly string[]): void {
  for (const href of hrefs) {
    try {
      router.prefetch(href);
    } catch {
      /* ignore */
    }
  }
}

/** Schedule work when the main thread is idle (fallback: short timeout). */
export function runWhenIdle(fn: () => void, timeoutMs = 2000): () => void {
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(() => fn(), { timeout: timeoutMs });
    return () => cancelIdleCallback(id);
  }
  const t = window.setTimeout(fn, 120);
  return () => clearTimeout(t);
}

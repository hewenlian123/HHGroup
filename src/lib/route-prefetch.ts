/**
 * Routes to warm on mobile for instant navigation (Bottom nav, FAB, idle).
 */
import { HH_PROJECT_OS_MOBILE_NAV_ITEMS } from "@/lib/navigation/ia";
import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";

export const BOTTOM_NAV_ROUTES = HH_PROJECT_OS_MOBILE_NAV_ITEMS.map((item) => item.href);

export const QUICK_ACTION_ROUTES = [
  "/site-photos/upload",
  UPLOAD_RECEIPT_ACTION.href,
  "/projects/new",
  "/tasks/new",
  "/punch-list/new",
  "/change-orders",
  "/financial/expenses/new",
  "/labor",
] as const;

export const OWNER_NAV_PREFETCH_ROUTES = [
  "/dashboard",
  "/projects",
  "/financial",
  UPLOAD_RECEIPT_ACTION.href,
  "/financial/expenses",
  "/financial/invoices",
  "/financial/bank",
  "/financial/owner",
  "/reports",
  "/reports/workforce",
  "/labor",
  "/settings",
  "/system-health",
] as const;

export const BOTTOM_NAV_VISIBLE_MEDIA_QUERY = "(max-width: 639px)";
export const QUICK_ACTION_FAB_VISIBLE_MEDIA_QUERY = "(max-width: 1023px)";

export function shouldBulkPrefetchOwnerNav(_pathname: string): boolean {
  return false;
}

export function shouldBulkPrefetchMobileNav(
  pathname: string,
  mobileNavigationVisible: boolean
): boolean {
  return mobileNavigationVisible && shouldBulkPrefetchOwnerNav(pathname);
}

export type AppRouterLike = { prefetch: (href: string) => void };

const PREFETCH_BATCH_SIZE = 4;
const PREFETCH_BATCH_IDLE_TIMEOUT_MS = 600;

function prefetchRouteBatch(
  router: AppRouterLike,
  hrefs: readonly string[],
  startIndex: number
): () => void {
  let cancelled = false;
  let cancelScheduledBatch: (() => void) | undefined;
  const endIndex = Math.min(startIndex + PREFETCH_BATCH_SIZE, hrefs.length);
  for (let index = startIndex; index < endIndex; index += 1) {
    const href = hrefs[index];
    try {
      router.prefetch(href);
    } catch {
      /* ignore */
    }
  }
  if (endIndex < hrefs.length) {
    cancelScheduledBatch = runWhenIdle(() => {
      if (cancelled) return;
      cancelScheduledBatch = prefetchRouteBatch(router, hrefs, endIndex);
    }, PREFETCH_BATCH_IDLE_TIMEOUT_MS);
  }
  return () => {
    cancelled = true;
    cancelScheduledBatch?.();
  };
}

export function prefetchRoutes(router: AppRouterLike, hrefs: readonly string[]): () => void {
  return prefetchRouteBatch(router, hrefs, 0);
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

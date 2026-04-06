/**
 * List/hub screens already expose a primary create action in {@link MobileListHeader}.
 * Hide the global quick-action FAB on those routes to avoid duplicate affordances.
 *
 * Dashboard (`/dashboard`) is excluded so the FAB remains the single entry for
 * New Project and other shortcuts (mobile header is title-only there).
 */
export function shouldHideFloatingQuickActionFab(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/$/, "") || "/";

  const exact = new Set([
    "/projects",
    "/workers",
    "/workers/summary",
    "/bills",
    "/customers",
    "/estimates",
    "/change-orders",
    "/tasks",
    "/punch-list",
    "/schedule",
    "/site-photos",
    "/inspection-log",
    "/materials/catalog",
    "/labor",
    "/financial/invoices",
    "/financial/payments",
    "/financial/accounts",
    "/financial/deposits",
    "/financial/vendors",
    "/financial/expenses",
    "/financial/commissions",
    "/subcontractors",
    "/settings/company",
    "/documents",
  ]);

  if (exact.has(p)) return true;
  if (p.startsWith("/labor/")) return true;
  if (p.startsWith("/financial/receipt-queue")) return true;

  return false;
}

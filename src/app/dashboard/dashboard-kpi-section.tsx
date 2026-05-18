import { DashboardKpiStrip } from "./dashboard-kpi-strip";
import {
  emptyDashboardContractReview,
  getApBillsSummaryCached,
  getLaborCostThisWeekCached,
  getOverdueInvoicesCached,
  getProjectRiskOverviewCached,
  getRecentTransactionsCached,
  loadDashboardProjectsBundle,
} from "./dashboard-bundle";

export async function DashboardKpiSection() {
  try {
    const [bundle, apBillsSummary, overdueInvoices, laborCostThisWeek, riskOverview, recentTx] =
      await Promise.all([
        loadDashboardProjectsBundle(),
        getApBillsSummaryCached(),
        getOverdueInvoicesCached(),
        getLaborCostThisWeekCached(),
        getProjectRiskOverviewCached(),
        getRecentTransactionsCached(24),
      ]);

    const readyProjectIds = new Set(
      (bundle.contractReview ?? emptyDashboardContractReview).readyProjectIds
    );
    const negativeMarginCount = bundle.projects.reduce((n, p) => {
      if (!readyProjectIds.has(p.id)) return n;
      const m = bundle.profitMap.get(p.id)?.margin ?? 0;
      return n + (m < 0 ? 1 : 0);
    }, 0);

    const operationalRiskCount =
      riskOverview.summary.highCount +
      riskOverview.summary.overBudgetCount +
      riskOverview.summary.laborOverCount +
      riskOverview.summary.lowRunwayCount;

    let cashIn = 0;
    let cashOut = 0;
    for (const t of recentTx) {
      if (t.amount >= 0) cashIn += t.amount;
      else cashOut += Math.abs(t.amount);
    }
    const ledgerNet = cashIn - cashOut;

    return (
      <DashboardKpiStrip
        overdueInvoices={overdueInvoices}
        apBillsSummary={apBillsSummary}
        laborCostThisWeek={laborCostThisWeek}
        negativeMarginCount={negativeMarginCount}
        operationalRiskCount={operationalRiskCount}
        ledgerNet={ledgerNet}
      />
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly =
      msg.includes("Supabase is not configured") || msg.includes("not configured")
        ? "Database connection is not configured. Check NEXT_PUBLIC_SUPABASE_URL and keys in the deployment environment."
        : `Could not load KPIs: ${msg}`;
    return (
      <p className="border-b border-border/45 pb-3 text-sm text-muted-foreground" role="status">
        {friendly}
      </p>
    );
  }
}

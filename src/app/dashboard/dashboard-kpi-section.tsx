import { DashboardKpiStrip } from "./dashboard-kpi-strip";
import {
  getApBillsSummaryCached,
  getLaborCostThisWeekCached,
  getOverdueInvoicesCached,
  loadDashboardProjectsBundle,
} from "./dashboard-bundle";

export async function DashboardKpiSection() {
  try {
    const [bundle, overdueInvoices, apBillsSummary, laborCostThisWeek] = await Promise.all([
      loadDashboardProjectsBundle(),
      getOverdueInvoicesCached(),
      getApBillsSummaryCached(),
      getLaborCostThisWeekCached(),
    ]);
    return (
      <DashboardKpiStrip
        stats={bundle.stats}
        overdueInvoices={overdueInvoices}
        apBillsSummary={apBillsSummary}
        laborCostThisWeek={laborCostThisWeek}
        projectProfitSummary={bundle.stats.totalProfit}
      />
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly =
      msg.includes("Supabase is not configured") || msg.includes("not configured")
        ? "Database connection is not configured. Check NEXT_PUBLIC_SUPABASE_URL and keys in the deployment environment."
        : `Could not load KPIs: ${msg}`;
    return (
      <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
        {friendly}
      </p>
    );
  }
}

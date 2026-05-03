import { fmtUsd } from "./dashboard-shared";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";

type ApBillsSummaryKpi = {
  dueThisWeekCount: number;
  dueThisWeekAmount: number;
};

type KpiStats = {
  activeProjects: number;
};

export function DashboardKpiStrip({
  stats,
  overdueInvoices,
  apBillsSummary,
  laborCostThisWeek,
  projectProfitSummary,
}: {
  stats: KpiStats;
  overdueInvoices: OverdueInvoiceRow[];
  apBillsSummary: ApBillsSummaryKpi;
  laborCostThisWeek: number;
  projectProfitSummary: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4 lg:gap-4">
      <div className="kpi-metric relative overflow-hidden">
        <p className="kpi-metric-label">Active Projects</p>
        <p className="kpi-metric-value mt-0.5 tabular-nums text-text-primary dark:text-foreground">
          {stats.activeProjects}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">in portfolio</p>
        <svg
          viewBox="0 0 80 20"
          className="mt-1.5 h-4 w-full text-[#9CA3AF] max-md:mt-1 md:mt-2 md:h-5"
          aria-hidden
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,14 20,10 40,12 60,6 80,10"
          />
        </svg>
      </div>
      <div className="kpi-metric relative overflow-hidden">
        <p className="kpi-metric-label">Outstanding Invoices</p>
        <p className="kpi-metric-value mt-0.5 tabular-nums text-text-primary dark:text-foreground">
          ${fmtUsd(overdueInvoices.reduce((sum, i) => sum + (i.balanceDue ?? 0), 0))}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{overdueInvoices.length} pending</p>
        <svg
          viewBox="0 0 80 20"
          className="mt-1.5 h-4 w-full text-[#9CA3AF] max-md:mt-1 md:mt-2 md:h-5"
          aria-hidden
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,10 20,14 40,8 60,12 80,6"
          />
        </svg>
      </div>
      <div className="kpi-metric relative overflow-hidden">
        <p className="kpi-metric-label">Bills Due</p>
        <p className="kpi-metric-value mt-0.5 tabular-nums text-text-primary dark:text-foreground">
          {apBillsSummary.dueThisWeekCount} · ${fmtUsd(apBillsSummary.dueThisWeekAmount)}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">Due this week</p>
        <svg
          viewBox="0 0 80 20"
          className="mt-1.5 h-4 w-full text-[#9CA3AF] max-md:mt-1 md:mt-2 md:h-5"
          aria-hidden
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,12 20,8 40,14 60,10 80,12"
          />
        </svg>
      </div>
      <div className="kpi-metric relative overflow-hidden">
        <p className="kpi-metric-label">Labor Cost (This Month)</p>
        <p className="kpi-metric-value mt-0.5 tabular-nums text-text-primary dark:text-foreground">
          ${fmtUsd(laborCostThisWeek)}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">This month</p>
        <svg
          viewBox="0 0 80 20"
          className="mt-1.5 h-4 w-full text-[#9CA3AF] max-md:mt-1 md:mt-2 md:h-5"
          aria-hidden
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,8 20,12 40,10 60,14 80,8"
          />
        </svg>
      </div>
      <div className="kpi-metric relative overflow-hidden">
        <p className="kpi-metric-label">Profit</p>
        <p
          className={
            projectProfitSummary >= 0
              ? "kpi-metric-value mt-0.5 tabular-nums text-hh-profit-positive dark:text-hh-profit-positive"
              : "kpi-metric-value mt-0.5 tabular-nums text-red-600 dark:text-red-400"
          }
        >
          {projectProfitSummary >= 0 ? "$" : "−$"}
          {fmtUsd(Math.abs(projectProfitSummary))}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">This month</p>
        <svg
          viewBox="0 0 80 20"
          className="mt-1.5 h-4 w-full text-[#9CA3AF] max-md:mt-1 md:mt-2 md:h-5"
          aria-hidden
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,14 20,12 40,8 60,10 80,6"
          />
        </svg>
      </div>
    </div>
  );
}

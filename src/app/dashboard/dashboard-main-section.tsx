import {
  getBillsSummaryAll,
  getPaymentsSummaryAll,
  getSubcontractsWithDetailsAll,
  type RecentTransaction,
} from "@/lib/data";
import { DollarSign, FolderKanban, TrendingUp, Wallet } from "lucide-react";
import { formatCompactCurrency } from "@/lib/formatters";
import {
  getApBillsSummaryCached,
  getExpensesThisMonthCached,
  getLaborCostThisWeekCached,
  getOverdueInvoicesCached,
  getRecentTransactionsCached,
  loadDashboardProjectsBundle,
} from "./dashboard-bundle";
import { DashboardView } from "./dashboard-view";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { emitRscTiming } from "@/lib/performance/server-timing";
import {
  FinancialDataUnavailableError,
  classifyFinancialAvailabilityFailure,
  type FinancialAvailabilityFailureKind,
} from "@/lib/financial-availability";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";

const FAILURE_LABEL: Record<FinancialAvailabilityFailureKind, string> = {
  permission_denied: "unavailable because access was denied",
  schema_failure: "unavailable because the data contract is not available",
  network_failure: "temporarily unavailable because the data service could not be reached",
  unavailable_source: "unavailable because a required source did not return data",
  unknown_failure: "temporarily unavailable",
};

function dashboardUnavailableMessage(error: unknown): string {
  const kind =
    error instanceof FinancialDataUnavailableError
      ? error.kind
      : classifyFinancialAvailabilityFailure(error);
  return `Dashboard data is ${FAILURE_LABEL[kind]}. Financial values were not displayed.`;
}

export async function DashboardMainSection({
  searchParamsPromise: _searchParamsPromise,
}: {
  searchParamsPromise?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const pageStartedAt = performance.now();
  const serverDataStartedAt = performance.now();
  void _searchParamsPromise;
  let requiredData: {
    transactions: RecentTransaction[];
    bundle: Awaited<ReturnType<typeof loadDashboardProjectsBundle>>;
    subcontractsDetails: Awaited<ReturnType<typeof getSubcontractsWithDetailsAll>>;
    billsSummary: Awaited<ReturnType<typeof getBillsSummaryAll>>;
    paymentsSummary: Awaited<ReturnType<typeof getPaymentsSummaryAll>>;
    apBillsSummary: Awaited<ReturnType<typeof getApBillsSummaryCached>>;
    laborCostThisWeek: number;
    expensesThisMonth: number;
    overdueInvoices: Awaited<ReturnType<typeof getOverdueInvoicesCached>>;
  };
  try {
    const projectSupabase = await createServerSupabaseClient({ noStore: true });
    if (!projectSupabase) throw new Error("Authenticated project session is not configured.");
    const primaryDataPromise = Promise.all([
      getRecentTransactionsCached(20, projectSupabase),
      loadDashboardProjectsBundle(projectSupabase),
    ]);
    const subcontractDataPromise = Promise.all([
      getSubcontractsWithDetailsAll(projectSupabase),
      getBillsSummaryAll(projectSupabase),
      getPaymentsSummaryAll(projectSupabase),
    ]);
    const metricDataPromise = Promise.all([
      getApBillsSummaryCached(projectSupabase),
      getLaborCostThisWeekCached(projectSupabase),
      getExpensesThisMonthCached(projectSupabase),
      getOverdueInvoicesCached(projectSupabase),
    ]);

    const [primaryData, subcontractData, metricData] = await Promise.all([
      primaryDataPromise,
      subcontractDataPromise,
      metricDataPromise,
    ]);
    const [transactions, bundle] = primaryData;
    const [subcontractsDetails, billsSummary, paymentsSummary] = subcontractData;
    const [apBillsSummary, laborCostThisWeek, expensesThisMonth, overdueInvoices] = metricData;
    requiredData = {
      transactions,
      bundle,
      subcontractsDetails,
      billsSummary,
      paymentsSummary,
      apBillsSummary,
      laborCostThisWeek,
      expensesThisMonth,
      overdueInvoices,
    };
  } catch (error) {
    console.error("[dashboard] required data load failed", error);
    return (
      <ServerDataLoadFallback
        message={dashboardUnavailableMessage(error)}
        backHref="/dashboard"
        backLabel="Retry dashboard"
      />
    );
  }
  const {
    transactions,
    bundle,
    subcontractsDetails,
    billsSummary,
    paymentsSummary,
    apBillsSummary,
    laborCostThisWeek,
    expensesThisMonth,
    overdueInvoices,
  } = requiredData;
  const { stats, riskOverview, projects, profitMap, contractReview } = bundle;
  const serverDataCompletedAt = performance.now();

  const riskByProjectId = new Map(
    riskOverview.projects.map((r) => [r.projectId, r.riskLevel] as const)
  );

  const approvedBySubcontractId = new Map<string, number>();
  for (const r of billsSummary) {
    if (r.status !== "Approved" && r.status !== "Paid") continue;
    const sum = (approvedBySubcontractId.get(r.subcontract_id) ?? 0) + r.amount;
    approvedBySubcontractId.set(r.subcontract_id, sum);
  }
  const paidBySubcontractId = new Map<string, number>();
  for (const r of paymentsSummary) {
    const sum = (paidBySubcontractId.get(r.subcontract_id) ?? 0) + r.amount;
    paidBySubcontractId.set(r.subcontract_id, sum);
  }
  const outstandingSubcontracts = subcontractsDetails
    .map((s) => {
      const approved = approvedBySubcontractId.get(s.id) ?? 0;
      const paid = paidBySubcontractId.get(s.id) ?? 0;
      const balance = approved - paid;
      return { ...s, balance };
    })
    .filter((r) => r.balance > 0);

  const projectHealthRows = projects.map((project) => {
    const canonical = profitMap.get(project.id);
    const contractReviewRow = contractReview.needsReviewProjects.find(
      (row) => row.id === project.id
    );
    const profitReady = contractReviewRow == null;
    const revenue = canonical?.revenue ?? 0;
    const actual = canonical?.actualCost ?? 0;
    const profit = profitReady ? (canonical?.profit ?? 0) : 0;
    const marginPct = profitReady ? (canonical?.margin ?? 0) * 100 : 0;
    const budget = project.budget ?? 0;
    return {
      id: project.id,
      name: project.name,
      revenue,
      budget,
      actual,
      profit,
      marginPct,
      profitReady,
      contractReviewLabel: contractReviewRow?.issues[0]?.label ?? null,
    };
  });
  const kpis = [
    {
      key: "total-projects",
      label: "Total Projects",
      value: String(stats.totalProjects),
      icon: FolderKanban,
    },
    {
      key: "active-projects",
      label: "Active Projects",
      value: String(stats.activeProjects),
      icon: Wallet,
    },
    {
      key: "total-budget",
      label: "Total Budget",
      value: formatCompactCurrency(stats.totalBudget),
      icon: DollarSign,
    },
    {
      key: "total-profit",
      label: "Total Profit",
      value: formatCompactCurrency(stats.totalProfit),
      icon: TrendingUp,
    },
  ];

  const highRiskProjects = riskOverview.projects.filter((p) => p.riskLevel === "HIGH").slice(0, 3);
  const upcomingTasks: Array<{ id: string; title: string; meta: string; due: string }> = [
    ...(riskOverview.summary.overBudgetCount > 0
      ? [
          {
            id: "task-over-budget",
            title: "Review projects over budget",
            meta: `${riskOverview.summary.overBudgetCount} flagged`,
            due: "Today",
          },
        ]
      : []),
    ...(riskOverview.summary.lowRunwayCount > 0
      ? [
          {
            id: "task-runway",
            title: "Follow up on low runway projects",
            meta: `${riskOverview.summary.lowRunwayCount} flagged`,
            due: "This week",
          },
        ]
      : []),
    ...(riskOverview.summary.laborOverCount > 0
      ? [
          {
            id: "task-labor",
            title: "Check labor overages",
            meta: `${riskOverview.summary.laborOverCount} flagged`,
            due: "This week",
          },
        ]
      : []),
    ...highRiskProjects.map((p) => ({
      id: `task-risk-${p.projectId}`,
      title: `Review risk: ${p.projectName}`,
      meta: p.triggers.length ? p.triggers.join(", ") : "High risk",
      due: p.runwayWeeks != null && p.runwayWeeks < 2 ? "Today" : "This week",
    })),
  ]
    .slice(0, 6)
    .map((t, i) => ({ ...t, id: `${t.id}-${i}` }));

  const recentActivity = transactions.slice(0, 8);

  const budgetUsagePct =
    stats.totalBudget > 0 ? Math.min(100, (stats.totalSpent / stats.totalBudget) * 100) : 0;
  const profitPositive = stats.totalProfit >= 0;
  const rscPreparedAt = performance.now();

  // Dashboard has no second page-level auth call. Middleware auth is exposed on
  // the RSC response; this event intentionally reports only the page data/render stages.
  emitRscTiming("dashboard", {
    serverDataMs: serverDataCompletedAt - serverDataStartedAt,
    rscPrepareMs: rscPreparedAt - serverDataCompletedAt,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return (
    <DashboardView
      stats={stats}
      transactions={transactions}
      riskOverview={riskOverview}
      projects={projects}
      subcontractsDetails={subcontractsDetails}
      billsSummary={billsSummary}
      paymentsSummary={paymentsSummary}
      apBillsSummary={apBillsSummary}
      laborCostThisWeek={laborCostThisWeek}
      expensesThisMonth={expensesThisMonth}
      overdueInvoices={overdueInvoices}
      riskByProjectId={riskByProjectId}
      outstandingSubcontracts={outstandingSubcontracts}
      projectHealthRows={projectHealthRows}
      kpis={kpis}
      upcomingTasks={upcomingTasks}
      recentActivity={recentActivity}
      budgetUsagePct={budgetUsagePct}
      profitPositive={profitPositive}
      dataLoadWarning={null}
      contractReview={contractReview}
    />
  );
}

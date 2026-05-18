import {
  getBillsSummaryAll,
  getPaymentsSummaryAll,
  getSubcontractsWithDetailsAll,
  type ProjectRiskOverview,
  type RecentTransaction,
} from "@/lib/data";
import { DollarSign, FolderKanban, TrendingUp, Wallet } from "lucide-react";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";
import { formatCompactCurrency } from "@/lib/formatters";
import {
  emptyDashboardContractReview,
  getApBillsSummaryCached,
  getExpensesThisMonthCached,
  getLaborCostThisWeekCached,
  getOverdueInvoicesCached,
  getProjectRiskOverviewCached,
  getRecentTransactionsCached,
  loadDashboardProjectsBundle,
} from "./dashboard-bundle";
import { DashboardView } from "./dashboard-view";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";

const EMPTY_RISK_OVERVIEW: ProjectRiskOverview = {
  summary: {
    highCount: 0,
    overBudgetCount: 0,
    laborOverCount: 0,
    lowRunwayCount: 0,
  },
  projects: [],
};

export async function DashboardMainSection({
  searchParamsPromise: _searchParamsPromise,
}: {
  searchParamsPromise?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  void _searchParamsPromise;
  let stats: Awaited<ReturnType<typeof loadDashboardProjectsBundle>>["stats"] = {
    totalProjects: 0,
    activeProjects: 0,
    totalBudget: 0,
    totalSpent: 0,
    totalProfit: 0,
  };
  let transactions: RecentTransaction[] = [];
  let riskOverview: ProjectRiskOverview = EMPTY_RISK_OVERVIEW;
  let projects: Awaited<ReturnType<typeof loadDashboardProjectsBundle>>["projects"] = [];
  let profitMap = new Map<string, CanonicalProjectProfit>();
  let contractReview: ProjectContractReviewSummary = emptyDashboardContractReview;
  let dataLoadWarning: string | null = null;

  try {
    const [tx, risk, bundle] = await Promise.all([
      getRecentTransactionsCached(20),
      getProjectRiskOverviewCached(),
      loadDashboardProjectsBundle(),
    ]);
    transactions = tx;
    riskOverview = risk;
    stats = bundle.stats;
    projects = bundle.projects;
    profitMap = bundle.profitMap;
    contractReview = bundle.contractReview;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[dashboard] primary data load failed", e);
    dataLoadWarning =
      msg.includes("Supabase is not configured") || msg.includes("not configured")
        ? "Database connection is not configured. Check NEXT_PUBLIC_SUPABASE_URL and keys in the deployment environment."
        : `Could not load dashboard data: ${msg}`;
  }

  let subcontractsDetails: Awaited<ReturnType<typeof getSubcontractsWithDetailsAll>> = [];
  let billsSummary: Awaited<ReturnType<typeof getBillsSummaryAll>> = [];
  let paymentsSummary: Awaited<ReturnType<typeof getPaymentsSummaryAll>> = [];
  try {
    [subcontractsDetails, billsSummary, paymentsSummary] = await Promise.all([
      getSubcontractsWithDetailsAll(),
      getBillsSummaryAll(),
      getPaymentsSummaryAll(),
    ]);
  } catch {
    // Subcontract/bills/payments tables may not exist yet; use empty data.
  }

  const [apBillsSummary, laborCostThisWeek, expensesThisMonth, overdueInvoices] = await Promise.all(
    [
      getApBillsSummaryCached(),
      getLaborCostThisWeekCached(),
      getExpensesThisMonthCached(),
      getOverdueInvoicesCached(),
    ]
  );

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
      dataLoadWarning={dataLoadWarning}
      contractReview={contractReview}
    />
  );
}

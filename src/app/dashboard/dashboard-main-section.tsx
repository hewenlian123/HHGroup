import {
  getBillsSummaryAll,
  getPaymentsSummaryAll,
  getProjectRiskOverview,
  getRecentTransactions,
  getSubcontractsWithDetailsAll,
  type ProjectRiskOverview,
  type RecentTransaction,
} from "@/lib/data";
import { DollarSign, FolderKanban, TrendingUp, Wallet } from "lucide-react";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";
import {
  getApBillsSummaryCached,
  getExpensesThisMonthCached,
  getLaborCostThisWeekCached,
  getOverdueInvoicesCached,
  loadDashboardProjectsBundle,
} from "./dashboard-bundle";
import { DashboardView } from "./dashboard-view";

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
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = (await searchParamsPromise) ?? {};
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
  let dataLoadWarning: string | null = null;

  try {
    const [tx, risk, bundle] = await Promise.all([
      getRecentTransactions(20),
      getProjectRiskOverview(),
      loadDashboardProjectsBundle(),
    ]);
    transactions = tx;
    riskOverview = risk;
    stats = bundle.stats;
    projects = bundle.projects;
    profitMap = bundle.profitMap;
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
    const revenue = canonical?.revenue ?? 0;
    const actual = canonical?.actualCost ?? 0;
    const profit = canonical?.profit ?? 0;
    const marginPct = (canonical?.margin ?? 0) * 100;
    const budget = project.budget ?? 0;
    return {
      id: project.id,
      name: project.name,
      revenue,
      budget,
      actual,
      profit,
      marginPct,
    };
  });
  const projectProfitSummary = projectHealthRows.reduce((s, p) => s + p.profit, 0);

  const debugFlag = searchParams?.debug;
  const debugEnabled = debugFlag === "1" || debugFlag === "true";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const maskTail = (value: string | undefined) =>
    value && value.length >= 6 ? `...${value.slice(-6)}` : value ? `...${value}` : "MISSING";

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
      value: `$${stats.totalBudget.toLocaleString()}`,
      icon: DollarSign,
    },
    {
      key: "total-profit",
      label: "Total Profit",
      value: `$${stats.totalProfit.toLocaleString()}`,
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
      variant="main"
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
      projectProfitSummary={projectProfitSummary}
      debugEnabled={debugEnabled}
      supabaseUrl={supabaseUrl}
      supabaseAnonKey={supabaseAnonKey}
      maskTail={maskTail}
      kpis={kpis}
      upcomingTasks={upcomingTasks}
      recentActivity={recentActivity}
      budgetUsagePct={budgetUsagePct}
      profitPositive={profitPositive}
      dataLoadWarning={dataLoadWarning}
    />
  );
}

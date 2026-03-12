import {
  getDashboardStats,
  getProjectsDashboard,
  getRecentTransactions,
  getProjectRiskOverview,
  getSubcontractsWithDetailsAll,
  getBillsSummaryAll,
  getPaymentsSummaryAll,
  getApBillsSummary,
  getLaborCostThisWeek,
  getExpensesThisMonth,
  getOverdueInvoices,
} from "@/lib/data";
import { getCanonicalProjectProfitBatch } from "@/lib/profit-engine";
import { DollarSign, FolderKanban, TrendingUp, Wallet } from "lucide-react";
import { DashboardView } from "./dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const [stats, transactions, riskOverview, projects] = await Promise.all([
    getDashboardStats(),
    getRecentTransactions(20),
    getProjectRiskOverview(),
    getProjectsDashboard(200),
  ]);
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
  let apBillsSummary: Awaited<ReturnType<typeof getApBillsSummary>> = {
    totalOutstanding: 0,
    overdueCount: 0,
    overdueAmount: 0,
    dueThisWeekCount: 0,
    dueThisWeekAmount: 0,
    paidThisMonthAmount: 0,
  };
  try {
    apBillsSummary = await getApBillsSummary();
  } catch {
    // ap_bills may not exist yet.
  }
  let laborCostThisWeek = 0;
  let expensesThisMonth = 0;
  let overdueInvoices: Awaited<ReturnType<typeof getOverdueInvoices>> = [];
  try {
    [laborCostThisWeek, expensesThisMonth, overdueInvoices] = await Promise.all([
      getLaborCostThisWeek(),
      getExpensesThisMonth(),
      getOverdueInvoices(),
    ]);
  } catch {
    // labor_entries, expenses, or invoices may not exist yet.
  }

  const riskByProjectId = new Map(riskOverview.projects.map((r) => [r.projectId, r.riskLevel] as const));

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

  const projectIds = projects.map((p) => p.id);
  const profitMap = await getCanonicalProjectProfitBatch(projectIds).catch(() => new Map());
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
    { key: "total-projects", label: "Total Projects", value: String(stats.totalProjects), icon: FolderKanban },
    { key: "active-projects", label: "Active Projects", value: String(stats.activeProjects), icon: Wallet },
    { key: "total-budget", label: "Total Budget", value: `$${stats.totalBudget.toLocaleString()}`, icon: DollarSign },
    { key: "total-profit", label: "Total Profit", value: `$${stats.totalProfit.toLocaleString()}`, icon: TrendingUp, emphasis: true },
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

  const budgetUsagePct = stats.totalBudget > 0 ? Math.min(100, (stats.totalSpent / stats.totalBudget) * 100) : 0;
  const profitPositive = stats.totalProfit >= 0;

  return DashboardView({
    stats,
    transactions,
    riskOverview,
    projects,
    subcontractsDetails,
    billsSummary,
    paymentsSummary,
    apBillsSummary,
    laborCostThisWeek,
    expensesThisMonth,
    overdueInvoices,
    riskByProjectId,
    outstandingSubcontracts,
    projectHealthRows,
    projectProfitSummary,
    debugEnabled,
    supabaseUrl,
    supabaseAnonKey,
    maskTail,
    kpis,
    upcomingTasks,
    recentActivity,
    budgetUsagePct,
    profitPositive,
  });
}

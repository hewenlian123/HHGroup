import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeDashboardStatsFromProjects,
  getApBillsSummary,
  getExpensesThisMonth,
  getLaborCostThisWeek,
  getOverdueInvoices,
  getProjectRiskOverview,
  getProjectsDashboard,
  getRecentTransactions,
  type ProjectRiskOverview,
} from "@/lib/data";
import { getCanonicalProjectProfitBatch } from "@/lib/profit-engine";
import { getProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";

const emptyRiskOverview: ProjectRiskOverview = {
  summary: { highCount: 0, overBudgetCount: 0, laborOverCount: 0, lowRunwayCount: 0 },
  projects: [],
};

export const getProjectRiskOverviewCached = cache(
  async (supabase: SupabaseClient): Promise<ProjectRiskOverview> => {
    try {
      return await getProjectRiskOverview(supabase);
    } catch {
      return emptyRiskOverview;
    }
  }
);

/**
 * Single-flight projects + canonical profit map + dashboard stats for one HTTP request.
 * Used by streaming dashboard sections so KPI / projects / financial summary share work.
 */
export const loadDashboardProjectsBundle = cache(async (supabase: SupabaseClient) => {
  const projects = await getProjectsDashboard(200, supabase);
  const profitMap = await getCanonicalProjectProfitBatch(
    projects.map((p) => p.id),
    supabase
  );
  const contractReview = getProjectContractReviewSummary(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      budget: project.budget,
    }))
  );
  const readyProjectIds = new Set(contractReview.readyProjectIds);
  const guardedProjects = projects.filter((project) => readyProjectIds.has(project.id));
  const guardedStats = computeDashboardStatsFromProjects(guardedProjects, profitMap);
  const stats = {
    ...guardedStats,
    totalBudget: guardedProjects.reduce(
      (sum, project) => sum + (profitMap.get(project.id)?.revenue ?? project.budget),
      0
    ),
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => p.status === "active").length,
  };
  return { projects, profitMap, stats, contractReview };
});

export const emptyDashboardContractReview: ProjectContractReviewSummary =
  getProjectContractReviewSummary([]);

export const getRecentTransactionsCached = cache(async (limit = 20) =>
  getRecentTransactions(limit)
);

const defaultAp = {
  totalOutstanding: 0,
  overdueCount: 0,
  overdueAmount: 0,
  dueThisWeekCount: 0,
  dueThisWeekAmount: 0,
  paidThisMonthAmount: 0,
};

/** Dedupes overlapping KPI + main dashboard fetches in the same request. */
export const getApBillsSummaryCached = cache(async (supabase: SupabaseClient | null) => {
  if (!supabase) return defaultAp;
  try {
    return await getApBillsSummary(supabase);
  } catch {
    return defaultAp;
  }
});

export const getOverdueInvoicesCached = cache(async () => {
  try {
    return await getOverdueInvoices();
  } catch {
    return [];
  }
});

export const getLaborCostThisWeekCached = cache(async () => {
  try {
    return await getLaborCostThisWeek();
  } catch {
    return 0;
  }
});

export const getExpensesThisMonthCached = cache(async () => {
  try {
    return await getExpensesThisMonth();
  } catch {
    return 0;
  }
});

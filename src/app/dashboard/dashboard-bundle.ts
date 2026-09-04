import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeDashboardStatsFromProjects,
  buildProjectRiskOverview,
  getApBillsSummary,
  getExpensesThisMonth,
  getLaborCostThisWeek,
  getOverdueInvoices,
  getProjectsDashboard,
  getRecentTransactions,
} from "@/lib/data";
import { getCanonicalProjectProfitBatch } from "@/lib/profit-engine";
import { getProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";

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
  const riskOverview = buildProjectRiskOverview(projects, profitMap);
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
  return { projects, profitMap, stats, contractReview, riskOverview };
});

export const emptyDashboardContractReview: ProjectContractReviewSummary =
  getProjectContractReviewSummary([]);

export const getRecentTransactionsCached = cache(async (limit: number, supabase: SupabaseClient) =>
  getRecentTransactions(limit, supabase)
);

/** Dedupes overlapping KPI + main dashboard fetches in the same request. */
export const getApBillsSummaryCached = cache(async (supabase: SupabaseClient) =>
  getApBillsSummary(supabase)
);

export const getOverdueInvoicesCached = cache(async (supabase: SupabaseClient) =>
  getOverdueInvoices(supabase)
);

export const getLaborCostThisWeekCached = cache(async (supabase: SupabaseClient) =>
  getLaborCostThisWeek(supabase)
);

export const getExpensesThisMonthCached = cache(async (supabase: SupabaseClient) =>
  getExpensesThisMonth(supabase)
);

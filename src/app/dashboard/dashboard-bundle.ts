import { cache } from "react";
import {
  computeDashboardStatsFromProjects,
  getApBillsSummary,
  getExpensesThisMonth,
  getLaborCostThisWeek,
  getOverdueInvoices,
  getProjectsDashboard,
  getRecentTransactions,
} from "@/lib/data";
import { getCanonicalProjectProfitBatch } from "@/lib/profit-engine";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";

/**
 * Single-flight projects + canonical profit map + dashboard stats for one HTTP request.
 * Used by streaming dashboard sections so KPI / projects / financial summary share work.
 */
export const loadDashboardProjectsBundle = cache(async () => {
  const projects = await getProjectsDashboard(200);
  const profitMap = await getCanonicalProjectProfitBatch(projects.map((p) => p.id)).catch(
    () => new Map<string, CanonicalProjectProfit>()
  );
  const stats = computeDashboardStatsFromProjects(projects, profitMap);
  return { projects, profitMap, stats };
});

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
export const getApBillsSummaryCached = cache(async () => {
  try {
    return await getApBillsSummary();
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

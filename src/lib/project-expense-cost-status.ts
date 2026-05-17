import { expenseStatusCountsTowardProjectCost } from "@/lib/financial/project-financial-snapshot";

/**
 * Single source of truth for which expense DB statuses count toward Project Cost / Spent.
 * Used by project cost bundle + dashboard (do not duplicate checks elsewhere).
 */
export function isConfirmedExpenseStatus(status: string | null | undefined): boolean {
  return expenseStatusCountsTowardProjectCost(status);
}

/**
 * Transaction Inbox workflow: UI maps DB statuses to Needs Review / Done only.
 * Saving derives `reviewed` vs `needs_review` from project + category (no manual status dropdown).
 */

import type { Expense } from "@/lib/data";

/** Radix Select sentinel: no project (overhead). */
export const EXPENSE_PROJECT_SELECT_NONE = "__hh_proj_none__";

/** Radix Select sentinel: no worker. */
export const EXPENSE_WORKER_SELECT_NONE = "__hh_worker_none__";

/** Filter bucket (not a DB status). */
export const EXPENSE_UI_STATUS_FILTER_NEEDS_REVIEW = "__hh_ui_needs_review__";

/** Filter bucket (not a DB status). */
export const EXPENSE_UI_STATUS_FILTER_DONE = "__hh_ui_done__";

/** Quick expense “common items” placeholder value for Radix Select. */
export const EXPENSE_COMMON_ITEM_NONE = "__hh_common_item_none__";

/** Radix Select sentinel: no GL / payment source account picked yet. */
export const EXPENSE_ACCOUNT_SELECT_NONE = "__hh_acct_none__";

/**
 * Needs Review: pending / null / empty / needs_review / draft.
 * Done: reviewed / approved / paid / reimbursed / done (+ reimbursable treated as done).
 */
export function expenseNeedsReviewFromDb(status: string | undefined | null): boolean {
  const raw = status ?? "";
  const s = String(raw).trim().toLowerCase();
  if (!s) return true;
  if (s === "pending" || s === "needs_review") return true;
  if (s === "draft") return true;
  if (
    s === "reviewed" ||
    s === "approved" ||
    s === "paid" ||
    s === "reimbursed" ||
    s === "done" ||
    s === "reimbursable"
  ) {
    return false;
  }
  return true;
}

export function expenseStatusUiLabel(status: string | undefined): "Needs Review" | "Done" {
  return expenseNeedsReviewFromDb(status) ? "Needs Review" : "Done";
}

export function deriveExpenseWorkflowStatus(
  projectId: string | null | undefined,
  category: string | null | undefined
): "reviewed" | "needs_review" {
  const hasProject = projectId != null && String(projectId).trim() !== "";
  const cat = (category ?? "").trim();
  const hasCategory = cat !== "" && cat !== "—";
  return hasProject && hasCategory ? "reviewed" : "needs_review";
}

/** Effective project id for inbox workflow (first line, else header). */
export function expenseEffectiveProjectId(expense: Expense): string | null {
  const lineId = expense.lines[0]?.projectId ?? null;
  if (lineId != null && String(lineId).trim() !== "") return String(lineId).trim();
  const headerRaw = expense.headerProjectId ?? null;
  if (headerRaw != null && String(headerRaw).trim() !== "") return String(headerRaw).trim();
  return null;
}

export function expenseHasProjectForWorkflow(expense: Expense): boolean {
  return expenseEffectiveProjectId(expense) != null;
}

export function expenseHasCategoryForWorkflow(expense: Expense): boolean {
  const cat = (expense.lines[0]?.category ?? "").trim();
  return cat !== "" && cat !== "—";
}

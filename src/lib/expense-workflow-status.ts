/**
 * Transaction Inbox workflow: UI maps DB statuses to Needs Review / Done only.
 * Saving derives `reviewed` vs `needs_review` from project + category (no manual status dropdown).
 */

import type { Expense } from "@/lib/data";
import { getExpenseReceiptItems } from "@/lib/expense-receipt-items";

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

/** Status written when user marks an expense done from Inbox (`reviewed`; legacy `done` if present). */
export function expenseIsArchivedDoneDbStatus(status: string | undefined | null): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return s === "reviewed" || s === "done";
}

/**
 * Mark Done / transition to archived: require project then category (order matches toast copy).
 * Returns which gate failed, or null if OK.
 */
export function validateMarkDoneRequiresProjectAndCategory(
  expense: Expense
): "project" | "category" | null {
  if (!expenseHasProjectForWorkflow(expense)) return "project";
  if (!expenseHasCategoryForWorkflow(expense)) return "category";
  return null;
}

/** True when there is no receipt/attachment signal for inbox UI (matches modal “Missing receipt”). */
export function expenseMissingReceiptForInbox(expense: Expense): boolean {
  return getExpenseReceiptItems(expense).length === 0;
}

/**
 * Inbox queue: needs workflow attention — pending DB review, missing classification,
 * missing receipt, or duplicate hint (hint computed separately).
 */
export function expenseMatchesInboxPool(expense: Expense, duplicateHint: boolean): boolean {
  if (duplicateHint) return true;
  if (expenseNeedsReviewFromDb(expense.status)) return true;
  if (!expenseHasProjectForWorkflow(expense)) return true;
  if (!expenseHasCategoryForWorkflow(expense)) return true;
  if (expenseMissingReceiptForInbox(expense)) return true;
  return false;
}

/**
 * Expenses archive list: only rows explicitly archived via Mark Done (`reviewed` / `done`),
 * with project + category (guaranteed bound to a project for display).
 */
export function expenseMatchesExpensesArchivePool(expense: Expense): boolean {
  if (!expenseIsArchivedDoneDbStatus(expense.status)) return false;
  if (!expenseHasProjectForWorkflow(expense)) return false;
  if (!expenseHasCategoryForWorkflow(expense)) return false;
  return true;
}

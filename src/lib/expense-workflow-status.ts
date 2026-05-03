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

export function expenseHasPaymentMethodForWorkflow(expense: Expense): boolean {
  const pm = (expense.paymentMethod ?? "").trim();
  return pm !== "" && pm !== "—";
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

/** DB statuses treated as Done / settled for Inbox pool (first gate: never Inbox). */
const INBOX_POOL_COMPLETED_STATUSES = new Set([
  "reviewed",
  "done",
  "completed",
  "approved",
  "paid",
  "reimbursed",
  "reimbursable",
]);

/** Incomplete statuses allowed in the Inbox pool (missing fields cannot override these rules). */
const INBOX_POOL_INCOMPLETE_STATUSES = new Set(["needs_review", "pending", "unreviewed", "draft"]);

/**
 * Inbox pool = incomplete workflow statuses only (`needs_review`, `pending`, `unreviewed`, `draft`, or empty).
 * Done-like rows (`reviewed`, `done`, `paid`, …) never appear in Inbox, even with missing receipt / project / category / payment.
 * `duplicateHint` is ignored for pool membership (duplicate UI may still flag rows that appear elsewhere).
 */
export function expenseMatchesInboxPool(expense: Expense, _duplicateHint?: boolean): boolean {
  void _duplicateHint;
  const s = String(expense.status ?? "")
    .trim()
    .toLowerCase();
  if (s && INBOX_POOL_COMPLETED_STATUSES.has(s)) return false;
  if (!s) return true;
  return INBOX_POOL_INCOMPLETE_STATUSES.has(s);
}

/** Sidebar “Inbox” badge and Inbox KPI “In queue” — same rule as `expenseMatchesInboxPool` per row. */
export function countExpensesMatchingInboxPool(expenses: readonly Expense[]): number {
  let n = 0;
  for (const e of expenses) {
    if (expenseMatchesInboxPool(e)) n++;
  }
  return n;
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

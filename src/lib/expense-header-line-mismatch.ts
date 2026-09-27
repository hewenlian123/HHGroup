import { getExpenseTotal } from "@/lib/expense-domain";
import type { Expense } from "@/lib/expenses-db";

export const EXPENSE_HEADER_LINE_TOTAL_MISMATCH_ISSUE =
  "expense_header_line_total_mismatch" as const;

export type ExpenseHeaderLineMismatchIssueCode = typeof EXPENSE_HEADER_LINE_TOTAL_MISMATCH_ISSUE;

export type ExpenseIssueFocus = {
  expenseId: string;
  issue: ExpenseHeaderLineMismatchIssueCode;
};

export type ExpenseHeaderLineMismatch = {
  issueCode: ExpenseHeaderLineMismatchIssueCode;
  headerTotal: number;
  linesTotal: number;
  difference: number;
  absDifference: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isExpenseHeaderLineMismatchIssue(
  issue: string | null | undefined
): issue is ExpenseHeaderLineMismatchIssueCode {
  return issue === EXPENSE_HEADER_LINE_TOTAL_MISMATCH_ISSUE;
}

export function getExpenseHeaderLineMismatch(
  expense: Expense | null | undefined,
  issue: string | null | undefined
): ExpenseHeaderLineMismatch | null {
  if (!expense || !isExpenseHeaderLineMismatchIssue(issue)) return null;

  const headerTotal = finiteNumber(expense.headerTotal);
  if (headerTotal == null) return null;

  const linesTotal = roundMoney(getExpenseTotal(expense));
  const difference = roundMoney(headerTotal - linesTotal);
  if (Math.abs(difference) < 0.005) return null;

  return {
    issueCode: EXPENSE_HEADER_LINE_TOTAL_MISMATCH_ISSUE,
    headerTotal: roundMoney(headerTotal),
    linesTotal,
    difference,
    absDifference: roundMoney(Math.abs(difference)),
  };
}

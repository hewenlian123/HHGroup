"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronRight, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseOperationsWorkspaceNav } from "@/components/financial/expense-operations-workspace-nav";
import type { Expense } from "@/lib/expenses-db";
import { getExpenseTotal } from "@/lib/expense-domain";
import { formatDate } from "@/lib/formatters";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { expenseInboxDuplicateIdSet } from "@/lib/expense-inbox-dup";
import {
  expenseHasCategoryForWorkflow,
  expenseMissingReceiptForInbox,
} from "@/lib/expense-workflow-status";

type Props = {
  expenses: Expense[];
  archivedExpenses: Expense[];
  summary: {
    monthTotal: number;
    allTotal: number;
    reimbursementTotal: number;
    archivedCount: number;
  };
  reviewStats: { pending: number; missingInfo: number; missingReceipt: number };
  projectNameById: Map<string, string>;
  onNew: () => void;
  onUpload: () => void;
};

export function ExpensesOverview({
  expenses,
  archivedExpenses,
  summary,
  reviewStats,
  projectNameById,
  onNew,
  onUpload,
}: Props) {
  const month = hawaiiTodayYmd().slice(0, 7);
  // Presentation groups the same completed ledger used by the existing Overview summary.
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 5 + i);
    const key = date.toISOString().slice(0, 7);
    return {
      key,
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      total: archivedExpenses
        .filter((e) => e.date.startsWith(key))
        .reduce((sum, e) => sum + getExpenseTotal(e), 0),
    };
  });
  const chartMax = Math.max(...months.map((m) => Math.abs(m.total)), 1);
  const zeroTrend = months.every((m) => m.total === 0);
  const categoryCounts = new Map<string, number>();
  archivedExpenses.forEach((expense) => {
    new Set(expense.lines.map((line) => (line.category ?? "").trim() || "Uncategorized")).forEach(
      (category) => categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
    );
  });
  const categories = [...categoryCounts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recent = [...archivedExpenses]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 6);
  const duplicates = expenseInboxDuplicateIdSet(expenses, getExpenseTotal).size;
  const uncategorized = expenses.filter((e) => !expenseHasCategoryForWorkflow(e)).length;
  const missing = expenses.filter(expenseMissingReceiptForInbox).length;
  const attention = [
    {
      title: "Receipts to review",
      detail: "Check receipt details, then approve",
      count: reviewStats.pending,
    },
    {
      title: "Incomplete details",
      detail: "Complete project or category information",
      count: reviewStats.missingInfo,
    },
    {
      title: "Missing receipts",
      detail: "Add supporting evidence",
      count: reviewStats.missingReceipt,
    },
  ];
  return (
    <div className="expenses-ui-content expenses-page-shell expense-overview">
      <ExpenseOperationsWorkspaceNav showHeader={false} />
      <header className="expense-overview-header expenses-page-header">
        <div>
          <h1>Expenses Overview</h1>
          <p>What needs your attention, and where spending stands.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onUpload}>
            <Upload className="h-4 w-4" aria-hidden />
            Upload Receipt
          </Button>
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" aria-hidden />
            New Expense
          </Button>
        </div>
      </header>
      <dl className="expense-overview-kpis" aria-label="Expense overview">
        {[
          { label: "This month · completed", value: formatOverviewMoney(summary.monthTotal) },
          { label: "Completed expenses", value: summary.archivedCount },
          { label: "Receipts to review", value: reviewStats.pending },
          { label: "Missing receipt", value: missing },
        ].map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <div className="expense-overview-columns">
        <div className="expense-overview-main">
          <section className="expense-overview-panel" aria-labelledby="expense-trend-title">
            <header>
              <div>
                <h2 id="expense-trend-title">Spending Trend</h2>
                <p>Completed expense totals · last 6 months</p>
              </div>
              <span className="expense-period">Through {months[5].label}</span>
            </header>
            <div
              className="expense-spending-chart"
              data-zero-trend={zeroTrend}
              role="img"
              aria-label={months
                .map((m) => `${m.label} ${m.key.slice(0, 4)}: ${formatOverviewMoney(m.total)}`)
                .join("; ")}
            >
              {months.map((m, i) => (
                <div
                  className="expense-chart-column"
                  key={m.key}
                  data-current={i === 5}
                  data-zero={m.total === 0}
                >
                  <span
                    className="expense-chart-value"
                    data-amount-direction={m.total < 0 ? "positive" : "neutral"}
                  >
                    {formatOverviewMoney(m.total)}
                  </span>
                  <div className="expense-chart-track">
                    <div
                      className="expense-chart-bar"
                      data-current={i === 5}
                      data-refund={m.total < 0}
                      style={{ height: `${(Math.abs(m.total) / chartMax) * 100}%` }}
                    />
                  </div>
                  <span>{m.label}</span>
                </div>
              ))}
            </div>
            {zeroTrend ? (
              <p className="expense-chart-zero-note">
                All six monthly totals are {formatOverviewMoney(0)}. Monthly activity appears here
                as totals change.
              </p>
            ) : null}
            <p className="expense-chart-note">
              Recorded expense totals; payment timing is not represented. Refund totals are shown
              with their original sign.
            </p>
          </section>
          <section className="expense-overview-panel" aria-labelledby="expense-attention-title">
            <header>
              <h2 id="expense-attention-title">Needs Attention</h2>
              <Link href="/financial/inbox" prefetch={false}>
                Open inbox <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </header>
            {attention.map((item) => (
              <Link
                className="expense-attention-row"
                href="/financial/inbox"
                prefetch={false}
                key={item.title}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className="expense-attention-count" data-active={item.count > 0}>
                  {item.count}
                </span>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            ))}
          </section>
          <section className="expense-overview-panel" aria-labelledby="expense-recent-title">
            <header>
              <div>
                <h2 id="expense-recent-title">Recent Expenses</h2>
                <p>Completed expenses · newest first</p>
              </div>
              <Link href="/financial/expenses" prefetch={false}>
                View all <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </header>
            {recent.length ? (
              recent.map((expense) => {
                const amount = getExpenseTotal(expense);
                const projects = [
                  ...new Set(
                    [
                      expense.headerProjectId,
                      ...expense.lines.map((line) => line.projectId),
                    ].filter(Boolean)
                  ),
                ]
                  .map((id) => projectNameById.get(id!) ?? "Project")
                  .join(", ");
                return (
                  <Link
                    className="expense-recent-row"
                    prefetch={false}
                    href={`/financial/expenses?dateRange=all&ops_record=${encodeURIComponent(expense.id)}`}
                    key={expense.id}
                  >
                    <time dateTime={expense.date}>{formatDate(expense.date)}</time>
                    <span>
                      <strong>{expense.vendorName || "Expense"}</strong>
                      <small>{projects || "Company overhead"}</small>
                    </span>
                    <span
                      className="expense-recent-amount"
                      data-amount-direction={
                        amount < 0 ? "positive" : amount > 0 ? "negative" : "neutral"
                      }
                    >
                      {formatOverviewMoney(amount)}
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="expense-panel-empty">
                <p>No completed expenses yet.</p>
                <Button variant="outline" onClick={onNew}>
                  New Expense
                </Button>
              </div>
            )}
          </section>
        </div>
        <div className="expense-overview-secondary">
          <section className="expense-overview-panel" aria-labelledby="expense-categories-title">
            <header>
              <div>
                <h2 id="expense-categories-title">Top Categories</h2>
                <p>By completed expense count · all time</p>
              </div>
            </header>
            {categories.length ? (
              categories.map(([category, count]) => (
                <Link
                  className="expense-category-row"
                  href={`/financial/expenses?dateRange=all&category=${encodeURIComponent(category === "Uncategorized" ? "" : category)}`}
                  prefetch={false}
                  key={category}
                >
                  <span>
                    <strong>{category}</strong>
                    <span className="expense-category-track">
                      <span style={{ width: `${(count / categories[0][1]) * 100}%` }} />
                    </span>
                  </span>
                  <span className="tabular-nums">{count}</span>
                </Link>
              ))
            ) : (
              <p className="expense-panel-empty">Categories appear as expenses are completed.</p>
            )}
            <p className="expense-chart-note">
              Expenses with multiple categories appear in each category.
            </p>
          </section>
          <section
            className="expense-overview-panel"
            aria-labelledby="expense-reimbursements-title"
          >
            <header>
              <h2 id="expense-reimbursements-title">Reimbursements</h2>
            </header>
            <div className="expense-reimbursement-summary">
              <span>Completed reimbursement expenses</span>
              <strong>{formatOverviewMoney(summary.reimbursementTotal)}</strong>
              <p>Recorded expense total, not an outstanding payment balance.</p>
              <Link href="/labor/reimbursements" prefetch={false}>
                Open reimbursements <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </section>
          <section className="expense-overview-panel" aria-labelledby="expense-issues-title">
            <header>
              <h2 id="expense-issues-title">Issues / Exceptions</h2>
            </header>
            {[
              ["Possible duplicates", duplicates],
              ["Uncategorized", uncategorized],
              ["Missing receipt", missing],
            ].map(([label, count]) => (
              <Link
                className="expense-exception-row"
                key={label}
                href="/financial/inbox"
                prefetch={false}
              >
                <span>{label}</span>
                <strong data-attention={Number(count) > 0}>{count}</strong>
              </Link>
            ))}
            <p className="expense-chart-note">
              Review flagged records before taking action. Duplicate matches are suggestions.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

import type { RecentTransaction, ProjectRiskOverview } from "@/lib/data";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/formatters";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

import { DashboardPageHeader } from "./dashboard-page-header";
import { DashboardQuickActions } from "./dashboard-quick-actions";

type DashboardStats = Awaited<ReturnType<typeof import("@/lib/data").getDashboardStats>>;
type AttentionTask = { id: string; title: string; meta: string; due: string };
type ProjectHealthRow = {
  id: string;
  name: string;
  revenue: number;
  budget: number;
  actual: number;
  profit: number;
  marginPct: number;
  profitReady: boolean;
  contractReviewLabel: string | null;
};

export function DashboardCommandHud({
  stats,
  transactions,
  riskOverview,
  projectHealthRows,
  overdueInvoices,
  apOutstanding,
  laborCostThisWeek,
  expensesThisMonth,
  upcomingTasks,
  recentActivity,
  contractReview,
  className,
}: {
  stats: DashboardStats;
  transactions: RecentTransaction[];
  riskOverview: ProjectRiskOverview;
  projectHealthRows: ProjectHealthRow[];
  overdueInvoices: OverdueInvoiceRow[];
  apOutstanding: number;
  laborCostThisWeek: number;
  expensesThisMonth: number;
  upcomingTasks: AttentionTask[];
  recentActivity: RecentTransaction[];
  contractReview: ProjectContractReviewSummary;
  className?: string;
}) {
  const recentRecords = transactions.slice(0, 24);
  const recentPositive = recentRecords.reduce(
    (sum, transaction) => sum + (transaction.amount > 0 ? transaction.amount : 0),
    0
  );
  const recentOutgoing = recentRecords.reduce(
    (sum, transaction) => sum + (transaction.amount < 0 ? Math.abs(transaction.amount) : 0),
    0
  );
  const overdueReceivables = overdueInvoices.reduce(
    (sum, invoice) => sum + (invoice.balanceDue ?? 0),
    0
  );
  const riskSignalCount =
    riskOverview.summary.highCount +
    riskOverview.summary.overBudgetCount +
    riskOverview.summary.laborOverCount +
    riskOverview.summary.lowRunwayCount;
  const contractReviewCount = contractReview.needsReviewProjects.length;
  const actionCount = riskSignalCount + contractReviewCount;
  const readyProjectCount = projectHealthRows.filter((project) => project.profitReady).length;
  const projectRows = projectHealthRows.slice(0, 4);
  const activityRows = recentActivity.slice(0, 4);

  const financeFacts = [
    { label: "Recent positive activity", value: formatCompactCurrency(recentPositive) },
    { label: "Recent outgoing activity", value: formatCompactCurrency(recentOutgoing) },
    { label: "Overdue receivables", value: formatCompactCurrency(overdueReceivables) },
    { label: "AP outstanding", value: formatCompactCurrency(apOutstanding) },
  ];

  return (
    <section
      className={cn("min-w-0 text-[var(--hh-text-primary)]", className)}
      aria-label="Operations home"
    >
      <DashboardPageHeader actions={<DashboardQuickActions />} />

      <div className="mt-6 grid min-w-0 border-y border-[var(--hh-border)] lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <section className="min-w-0 py-6 lg:border-r lg:border-[var(--hh-border)] lg:pr-8">
          <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>
            Guarded project profit
          </p>
          <p className="mt-3 truncate text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-none tracking-normal tabular-nums text-[var(--hh-text-primary)]">
            {formatCurrency(stats.totalProfit)}
          </p>
          <p className={cn(TYPO.metadata, "mt-3 text-[var(--hh-text-secondary)]")}>
            {readyProjectCount} of {stats.totalProjects} projects included in the current profit
            basis.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>Active</p>
              <p className="mt-1 text-hh-financial font-semibold tabular-nums">
                {stats.activeProjects}
              </p>
            </div>
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>
                Total projects
              </p>
              <p className="mt-1 text-hh-financial font-semibold tabular-nums">
                {stats.totalProjects}
              </p>
            </div>
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>
                Labor this week
              </p>
              <p className="mt-1 truncate text-hh-financial font-semibold tabular-nums">
                {formatCompactCurrency(laborCostThisWeek)}
              </p>
            </div>
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>
                Expenses this month
              </p>
              <p className="mt-1 truncate text-hh-financial font-semibold tabular-nums">
                {formatCompactCurrency(expensesThisMonth)}
              </p>
            </div>
          </div>
        </section>

        <aside className="min-w-0 py-6 lg:pl-8" aria-labelledby="dashboard-attention-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>
                Priority queue
              </p>
              <h2 id="dashboard-attention-title" className={cn(TYPO.sectionTitle, "mt-1")}>
                {actionCount > 0 ? `${actionCount} items need review` : "No urgent items"}
              </h2>
            </div>
            {contractReviewCount > 0 ? (
              <Link
                href="/settings/project-financial-review"
                className={cn(
                  TYPO.button,
                  "shrink-0 text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
                )}
              >
                Review basis
              </Link>
            ) : null}
          </div>
          {upcomingTasks.length > 0 ? (
            <ol className="mt-4 divide-y divide-[var(--hh-border)] border-t border-[var(--hh-border)]">
              {upcomingTasks.slice(0, 3).map((task) => (
                <li key={task.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3">
                  <div className="min-w-0">
                    <p className={cn(TYPO.bodyStrong, "truncate")}>{task.title}</p>
                    <p className={cn(TYPO.metadata, "mt-0.5 truncate")}>{task.meta}</p>
                  </div>
                  <span className={cn(TYPO.metadata, "whitespace-nowrap text-right")}>
                    {task.due}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={cn(TYPO.body, "mt-4 text-[var(--hh-text-secondary)]")}>
              No risk-driven action is queued in the current feed.
            </p>
          )}
        </aside>
      </div>

      <section className="mt-7 min-w-0" aria-labelledby="dashboard-finance-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>
              Financial facts
            </p>
            <h2 id="dashboard-finance-title" className={cn(TYPO.sectionTitle, "mt-1")}>
              Recent finance activity
            </h2>
          </div>
          <p
            className={cn(
              TYPO.metadata,
              "w-full text-left text-[var(--hh-text-tertiary)] sm:w-auto sm:text-right"
            )}
          >
            Latest {recentRecords.length} created records
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-2 border-y border-[var(--hh-border)] sm:grid-cols-4">
          {financeFacts.map((fact, index) => (
            <div
              key={fact.label}
              className={cn(
                "min-w-0 py-4",
                index % 2 === 0 ? "pr-4" : "border-l border-[var(--hh-border)] pl-4",
                index >= 2 && "border-t border-[var(--hh-border)] sm:border-t-0",
                index > 0 && "sm:border-l sm:border-[var(--hh-border)] sm:px-5",
                index === 0 && "sm:pr-5"
              )}
            >
              <dt className={cn(TYPO.metadata, "truncate text-[var(--hh-text-secondary)]")}>
                {fact.label}
              </dt>
              <dd className="mt-1 truncate text-hh-financial font-semibold tabular-nums">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-7 grid min-w-0 gap-8 xl:grid-cols-2">
        <section className="min-w-0" aria-labelledby="dashboard-projects-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>Delivery</p>
              <h2 id="dashboard-projects-title" className={cn(TYPO.sectionTitle, "mt-1")}>
                Project posture
              </h2>
            </div>
            <Link
              href="/projects"
              className={cn(
                TYPO.button,
                "text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
              )}
            >
              View projects
            </Link>
          </div>
          {projectRows.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--hh-border)] border-y border-[var(--hh-border)]">
              {projectRows.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 outline-none hover:text-[var(--hh-action-primary)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] focus-visible:ring-inset"
                  >
                    <div className="min-w-0">
                      <p className={cn(TYPO.bodyStrong, "truncate")}>{project.name}</p>
                      <p className={cn(TYPO.metadata, "mt-0.5 truncate")}>
                        {project.profitReady
                          ? `${project.marginPct.toFixed(1)}% margin`
                          : (project.contractReviewLabel ?? "Contract value review required")}
                      </p>
                    </div>
                    <span className="max-w-32 truncate text-right text-hh-financial font-semibold tabular-nums">
                      {project.profitReady ? formatCurrency(project.profit) : "Review"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn(TYPO.body, "mt-4 text-[var(--hh-text-secondary)]")}>
              No projects returned from the current dashboard feed.
            </p>
          )}
        </section>

        <section className="min-w-0" aria-labelledby="dashboard-activity-title">
          <div>
            <p className={cn(TYPO.sectionLabel, "text-[var(--hh-text-tertiary)]")}>Ledger</p>
            <h2 id="dashboard-activity-title" className={cn(TYPO.sectionTitle, "mt-1")}>
              Latest movement
            </h2>
          </div>
          {activityRows.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--hh-border)] border-y border-[var(--hh-border)]">
              {activityRows.map((activity) => (
                <li
                  key={activity.id}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className={cn(TYPO.bodyStrong, "truncate")}>{activity.description}</p>
                    <p className={cn(TYPO.metadata, "mt-0.5 tabular-nums")}>
                      {formatDate(activity.date, "compact")}
                    </p>
                  </div>
                  <span className="max-w-32 truncate text-right text-hh-financial font-semibold tabular-nums">
                    {formatCurrency(activity.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn(TYPO.body, "mt-4 text-[var(--hh-text-secondary)]")}>
              No recent finance activity returned from the current feed.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

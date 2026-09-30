import Link from "next/link";

import { sectionCardClass } from "@/components/ui/section-card";
import type { RecentTransaction, ProjectRiskOverview } from "@/lib/data";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { formatDate } from "@/lib/formatters";
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
    { label: "Recent positive activity", value: formatOverviewMoney(recentPositive) },
    { label: "Recent outgoing activity", value: formatOverviewMoney(recentOutgoing) },
    { label: "Overdue receivables", value: formatOverviewMoney(overdueReceivables) },
    { label: "AP outstanding", value: formatOverviewMoney(apOutstanding) },
  ];

  return (
    <section
      className={cn("flex min-w-0 flex-col gap-4 text-[var(--hh-ink)]", className)}
      aria-label="Operations home"
    >
      <DashboardPageHeader actions={<DashboardQuickActions />} />

      <div
        className={cn(
          sectionCardClass,
          "grid min-w-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"
        )}
      >
        <section className="min-w-0 p-4 md:p-5 lg:border-r lg:border-[var(--hh-line)]">
          <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Guarded project profit</p>
          <p className={cn(TYPO.kpiTotal, "mt-3 truncate")}>
            {formatOverviewMoney(stats.totalProfit)}
          </p>
          <p className={cn(TYPO.metadata, "mt-3 text-[var(--hh-muted)]")}>
            {readyProjectCount} of {stats.totalProjects} projects included in the current profit
            basis.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Active</p>
              <p className={cn(TYPO.kpiValue, "mt-1")}>{stats.activeProjects}</p>
            </div>
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Total projects</p>
              <p className={cn(TYPO.kpiValue, "mt-1")}>{stats.totalProjects}</p>
            </div>
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Labor this week</p>
              <p className={cn(TYPO.kpiValue, "mt-1 truncate")}>
                {formatOverviewMoney(laborCostThisWeek)}
              </p>
            </div>
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Expenses this month</p>
              <p className={cn(TYPO.kpiValue, "mt-1 truncate")}>
                {formatOverviewMoney(expensesThisMonth)}
              </p>
            </div>
          </div>
        </section>

        <aside
          className="min-w-0 border-t border-[var(--hh-line)] p-4 md:p-5 lg:border-t-0"
          aria-labelledby="dashboard-attention-title"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Priority queue</p>
              <h2 id="dashboard-attention-title" className={cn(TYPO.sectionTitle, "mt-1")}>
                {actionCount > 0 ? `${actionCount} items need review` : "No urgent items"}
              </h2>
            </div>
            {contractReviewCount > 0 ? (
              <Link
                href="/settings/project-financial-review"
                className={cn(
                  TYPO.button,
                  "shrink-0 text-[var(--hh-link)] underline-offset-4 hover:text-[var(--hh-navy)] hover:underline"
                )}
              >
                Review basis
              </Link>
            ) : null}
          </div>
          {upcomingTasks.length > 0 ? (
            <ol className="mt-4 divide-y divide-[var(--hh-line)] border-t border-[var(--hh-line)]">
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
            <p className={cn(TYPO.body, "mt-4 text-[var(--hh-muted)]")}>
              No risk-driven action is queued in the current feed.
            </p>
          )}
        </aside>
      </div>

      <section
        className={cn(sectionCardClass, "min-w-0 p-4 md:p-5")}
        aria-labelledby="dashboard-finance-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Financial facts</p>
            <h2 id="dashboard-finance-title" className={cn(TYPO.sectionTitle, "mt-1")}>
              Recent finance activity
            </h2>
          </div>
          <p
            className={cn(
              TYPO.metadata,
              "w-full text-left text-[var(--hh-muted)] sm:w-auto sm:text-right"
            )}
          >
            Latest {recentRecords.length} created records
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-2 border-t border-[var(--hh-line)] sm:grid-cols-4">
          {financeFacts.map((fact, index) => (
            <div
              key={fact.label}
              className={cn(
                "min-w-0 py-4",
                index % 2 === 0 ? "pr-4" : "border-l border-[var(--hh-line)] pl-4",
                index >= 2 && "border-t border-[var(--hh-line)] sm:border-t-0",
                index > 0 && "sm:border-l sm:border-[var(--hh-line)] sm:px-5",
                index === 0 && "sm:pr-5"
              )}
            >
              <dt className={cn(TYPO.metadata, "truncate text-[var(--hh-muted)]")}>{fact.label}</dt>
              <dd className={cn(TYPO.kpiValue, "mt-1 truncate")}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <section
          className={cn(sectionCardClass, "min-w-0 p-4 md:p-5")}
          aria-labelledby="dashboard-projects-title"
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Delivery</p>
              <h2 id="dashboard-projects-title" className={cn(TYPO.sectionTitle, "mt-1")}>
                Project posture
              </h2>
            </div>
            <Link
              href="/projects"
              className={cn(
                TYPO.button,
                "text-[var(--hh-link)] underline-offset-4 hover:text-[var(--hh-navy)] hover:underline"
              )}
            >
              View projects
            </Link>
          </div>
          {projectRows.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--hh-line)] border-t border-[var(--hh-line)]">
              {projectRows.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 text-[var(--hh-ink)] outline-none hover:text-[var(--hh-navy)] focus-visible:ring-2 focus-visible:ring-[var(--hh-link)] focus-visible:ring-inset"
                  >
                    <div className="min-w-0">
                      <p className={cn(TYPO.bodyStrong, "truncate")}>{project.name}</p>
                      <p className={cn(TYPO.metadata, "mt-0.5 truncate")}>
                        {project.profitReady
                          ? `${project.marginPct.toFixed(1)}% margin`
                          : (project.contractReviewLabel ?? "Contract value review required")}
                      </p>
                    </div>
                    <span className={cn(TYPO.kpiValue, "max-w-32 truncate text-right")}>
                      {project.profitReady ? formatOverviewMoney(project.profit) : "Review"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn(TYPO.body, "mt-4 text-[var(--hh-muted)]")}>
              No projects returned from the current dashboard feed.
            </p>
          )}
        </section>

        <section
          className={cn(sectionCardClass, "min-w-0 p-4 md:p-5")}
          aria-labelledby="dashboard-activity-title"
        >
          <div>
            <p className={cn(TYPO.sectionLabel, "text-[var(--hh-muted)]")}>Ledger</p>
            <h2 id="dashboard-activity-title" className={cn(TYPO.sectionTitle, "mt-1")}>
              Latest movement
            </h2>
          </div>
          {activityRows.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--hh-line)] border-t border-[var(--hh-line)]">
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
                  <span className={cn(TYPO.kpiValue, "max-w-32 truncate text-right")}>
                    {formatOverviewMoney(activity.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn(TYPO.body, "mt-4 text-[var(--hh-muted)]")}>
              No recent finance activity returned from the current feed.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

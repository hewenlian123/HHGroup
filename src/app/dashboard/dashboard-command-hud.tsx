import type { RecentTransaction, ProjectRiskOverview } from "@/lib/data";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatCompactCurrency, formatCurrency } from "@/lib/formatters";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { DashboardAttentionFeed } from "./dashboard-attention-feed";
import { DashboardCoreRing } from "./dashboard-core-ring";
import { DashboardHudCard } from "./dashboard-hud-card";
import { DashboardQuickActions } from "./dashboard-quick-actions";
import { DashboardTelemetryRail } from "./dashboard-telemetry-rail";

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

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function profitCoreStatus({
  totalProfit,
  actionPressure,
  negativeMarginCount,
}: {
  totalProfit: number;
  actionPressure: number;
  negativeMarginCount: number;
}): { label: string; tone: "positive" | "pressure" | "review" } {
  if (totalProfit < 0) return { label: "Pressure", tone: "pressure" };
  if (actionPressure > 0 || negativeMarginCount > 0) {
    return { label: "Needs review", tone: "review" };
  }
  return { label: "Healthy", tone: "positive" };
}

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
  const cashSlice = transactions.slice(0, 24);
  const cashIn = cashSlice.reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0);
  const cashOut = cashSlice.reduce((sum, t) => sum + (t.amount < 0 ? Math.abs(t.amount) : 0), 0);
  const cashNet = cashIn - cashOut;
  const overdueTotal = overdueInvoices.reduce((sum, row) => sum + (row.balanceDue ?? 0), 0);
  const reviewPressure =
    riskOverview.summary.highCount +
    riskOverview.summary.overBudgetCount +
    riskOverview.summary.laborOverCount +
    riskOverview.summary.lowRunwayCount;
  const negativeMarginCount = projectHealthRows.filter(
    (row) => row.profitReady && row.marginPct < 0
  ).length;
  const contractReviewCount = contractReview.needsReviewProjects.length;
  const actionPressure = reviewPressure + contractReviewCount;
  const activeProjectPct =
    stats.totalProjects > 0 ? clampPct((stats.activeProjects / stats.totalProjects) * 100) : 0;
  const collectionPct = cashIn + cashOut > 0 ? clampPct((cashIn / (cashIn + cashOut)) * 100) : 0;
  const reviewPct = clampPct(actionPressure * 18);
  const coreStatus = profitCoreStatus({
    totalProfit: stats.totalProfit,
    actionPressure,
    negativeMarginCount,
  });

  const nodes = [
    { label: "Inbox", value: String(actionPressure), tone: "copper" as const },
    { label: "Projects", value: String(stats.activeProjects), tone: "emerald" as const },
    { label: "Labor", value: formatCompactCurrency(laborCostThisWeek), tone: "steel" as const },
    { label: "Expenses", value: formatCompactCurrency(expensesThisMonth), tone: "alert" as const },
    { label: "Invoices", value: String(overdueInvoices.length), tone: "copper" as const },
  ];

  return (
    <section
      className={cn(
        "dashboard-command-hud relative isolate min-w-0 overflow-hidden rounded-hh-standard px-3 py-3 text-[var(--hh-text-primary)] sm:px-4 sm:py-4 md:px-5 md:py-5",
        className
      )}
      aria-label="HH Command Center"
    >
      <div className="dashboard-command-hud__grid" aria-hidden />

      <div className="relative z-10 flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0">
          <p className={cn(TYPO.tableHeader, "uppercase text-[var(--hh-text-secondary)]")}>
            HH Operations
          </p>
          <h2 className={cn(TYPO.sectionTitle, "mt-2 max-w-[34rem]")}>HH Command Center</h2>
          <p className={cn(TYPO.body, "mt-2 max-w-[42rem]")}>
            Cash, project health, labor, AP, and owner action signals from the current dashboard
            feed.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 2xl:items-end">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="emerald">Live data</StatusPill>
            <StatusPill tone={actionPressure > 0 ? "alert" : "copper"}>
              {actionPressure} signals
            </StatusPill>
            <StatusPill tone="copper">Owner ready</StatusPill>
            {contractReviewCount > 0 ? (
              <>
                <Link
                  href="/settings/project-financial-review"
                  className={cn(
                    TYPO.chip,
                    "inline-flex min-h-hh-control-compact items-center rounded-full border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 uppercase text-[var(--hh-danger)] transition-colors hover:border-[var(--hh-border-strong)]"
                  )}
                >
                  Contract value review
                </Link>
                <span
                  className={cn(
                    TYPO.chip,
                    "inline-flex min-h-hh-control-compact items-center uppercase text-[var(--hh-danger)]"
                  )}
                >
                  {contractReviewCount} contract checks · Projects need contract value review
                </span>
              </>
            ) : null}
          </div>
          <DashboardQuickActions />
        </div>
      </div>

      <div className="relative z-10 mt-5 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(13rem,18rem)_minmax(24rem,1fr)_minmax(13rem,18rem)] xl:items-center">
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <DashboardHudCard
            label="Cash velocity"
            value={formatCompactCurrency(cashIn)}
            meta={`${cashSlice.length} recent tx · ${formatCurrency(cashNet)} net`}
            tone="copper"
            delay={80}
            hasSignal={cashSlice.length > 0}
          />
          <DashboardHudCard
            label="Open balance"
            value={formatCompactCurrency(overdueTotal)}
            meta={`${overdueInvoices.length} overdue invoices · ${formatCompactCurrency(
              apOutstanding
            )} AP`}
            tone={overdueTotal > 0 ? "alert" : "emerald"}
            delay={160}
            hasSignal={overdueTotal > 0}
          />
          <DashboardHudCard
            label="Expense burn"
            value={formatCompactCurrency(expensesThisMonth)}
            meta="Month-to-date expense pressure from the current feed"
            tone="alert"
            delay={240}
            hasSignal={expensesThisMonth > 0}
          />
        </div>

        <div className="min-w-0">
          <DashboardCoreRing
            label="NET OPERATING PROFIT"
            value={formatCurrency(stats.totalProfit)}
            status={coreStatus.label}
            helper="Current operating posture"
            tone={coreStatus.tone}
            nodes={nodes}
          />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <DashboardHudCard
            label="Active projects"
            value={stats.activeProjects}
            meta={`${stats.totalProjects} total · ${negativeMarginCount} margin reviews`}
            tone="emerald"
            delay={320}
            hasSignal={stats.totalProjects > 0}
          />
          <DashboardHudCard
            label="Labor payable"
            value={formatCompactCurrency(laborCostThisWeek)}
            meta="Current labor cost context from the dashboard feed"
            tone="steel"
            delay={400}
            hasSignal={laborCostThisWeek > 0}
          />
          <DashboardHudCard
            label="Review inbox"
            value={actionPressure}
            meta={`${reviewPressure} risk signals · ${contractReviewCount} contract checks`}
            tone={actionPressure > 0 ? "copper" : "emerald"}
            delay={480}
            hasSignal={actionPressure > 0}
          />
        </div>
      </div>

      <div className="relative z-10 mt-3 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <DashboardTelemetryRail
          items={[
            {
              label: "Collection flow",
              value: formatCompactCurrency(cashIn),
              progress: collectionPct,
              tone: "copper",
            },
            {
              label: "Project health",
              value: `${Math.round(activeProjectPct)}%`,
              progress: activeProjectPct,
              tone: "emerald",
            },
            {
              label: "Review pressure",
              value: actionPressure > 0 ? `${actionPressure} hot` : "Clear",
              progress: actionPressure > 0 ? reviewPct : 100,
              tone: actionPressure > 0 ? "alert" : "emerald",
            },
          ]}
        />
        <DashboardAttentionFeed tasks={upcomingTasks} recentActivity={recentActivity} />
      </div>
    </section>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "copper" | "emerald" | "alert";
}) {
  return (
    <span
      className={cn(
        TYPO.chip,
        "inline-flex min-h-hh-control-compact items-center rounded-full border px-3 uppercase",
        tone === "emerald" &&
          "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]",
        tone === "alert" &&
          "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]",
        tone === "copper" &&
          "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]"
      )}
    >
      {children}
    </span>
  );
}

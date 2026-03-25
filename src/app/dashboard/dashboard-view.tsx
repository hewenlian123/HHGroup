import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/base";
import type { RecentTransaction, ProjectRiskOverview } from "@/lib/data";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";

type ApBillsSummary = {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  dueThisWeekCount: number;
  dueThisWeekAmount: number;
  paidThisMonthAmount: number;
};

type SubcontractDetail = {
  id: string;
  subcontractor_id: string;
  project_id: string;
  subcontractor_name: string;
  project_name: string;
};

type OutstandingSubcontract = SubcontractDetail & { balance: number };

type ProjectHealthRow = {
  id: string;
  name: string;
  revenue: number;
  budget: number;
  actual: number;
  profit: number;
  marginPct: number;
};

type KpiItem = {
  key: string;
  label: string;
  value: string;
  icon?: LucideIcon;
  emphasis?: boolean;
};

type UpcomingTask = { id: string; title: string; meta: string; due: string };

export interface DashboardViewProps {
  stats: Awaited<ReturnType<typeof import("@/lib/data").getDashboardStats>>;
  transactions: RecentTransaction[];
  riskOverview: ProjectRiskOverview;
  projects: Awaited<ReturnType<typeof import("@/lib/data").getProjectsDashboard>>;
  subcontractsDetails: SubcontractDetail[];
  billsSummary: { subcontract_id: string; amount: number; status: string }[];
  paymentsSummary: { subcontract_id: string; amount: number }[];
  apBillsSummary: ApBillsSummary;
  laborCostThisWeek: number;
  expensesThisMonth: number;
  overdueInvoices: OverdueInvoiceRow[];
  riskByProjectId: Map<string, "HIGH" | "MEDIUM" | "LOW">;
  outstandingSubcontracts: OutstandingSubcontract[];
  projectHealthRows: ProjectHealthRow[];
  projectProfitSummary: number;
  debugEnabled: boolean;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  maskTail: (value: string | undefined) => string;
  kpis: KpiItem[];
  upcomingTasks: UpcomingTask[];
  recentActivity: RecentTransaction[];
  budgetUsagePct: number;
  profitPositive: boolean;
  /** Set when primary dashboard queries failed (e.g. Supabase misconfiguration). */
  dataLoadWarning?: string | null;
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function getHealthStatus(marginPct: number): {
  label: string;
  variant: "success" | "warning" | "muted";
  className?: string;
} {
  if (marginPct > 25) return { label: "Excellent", variant: "success" };
  if (marginPct >= 15) return { label: "Good", variant: "success" };
  if (marginPct >= 5) return { label: "Warning", variant: "warning" };
  return {
    label: "Risk",
    variant: "muted",
    className: "text-red-600 dark:text-red-400 [&>span:first-child]:!bg-red-500",
  };
}

export function DashboardView(props: DashboardViewProps): React.ReactNode {
  const {
    stats,
    apBillsSummary,
    laborCostThisWeek,
    overdueInvoices,
    riskByProjectId,
    outstandingSubcontracts,
    projectHealthRows,
    projectProfitSummary,
    debugEnabled,
    supabaseUrl,
    supabaseAnonKey,
    maskTail,
    kpis,
    upcomingTasks,
    recentActivity,
    budgetUsagePct,
    profitPositive,
    dataLoadWarning,
  } = props;

  return (
    <div className="min-h-full bg-warm-grey dark:bg-background">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {dataLoadWarning ? (
          <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
            {dataLoadWarning}
          </p>
        ) : null}
        {/* Section 1 — Page header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#2D2D2D] dark:text-foreground">
              Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-muted-foreground mt-0.5">
              Company overview
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground border border-[#EBEBE9] dark:border-border rounded-lg bg-white px-2.5 py-1 shadow-sm shrink-0">
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </header>

        {/* Section 2 — KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="relative bg-white dark:bg-card rounded-lg shadow-sm px-4 py-3 transition-shadow hover:shadow-md overflow-hidden">
            <div
              className="absolute top-0 left-0 right-0 h-[2px] rounded-b bg-gray-200 dark:bg-gray-600"
              aria-hidden
            />
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
              Active Projects
            </p>
            <p className="text-base font-medium mt-0.5 tabular-nums text-[#2D2D2D] dark:text-foreground">
              {stats.activeProjects}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-muted-foreground mt-0.5">
              in portfolio
            </p>
            <svg
              viewBox="0 0 80 20"
              className="mt-2 w-full h-5 text-gray-400 dark:text-gray-500"
              aria-hidden
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,14 20,10 40,12 60,6 80,10"
              />
            </svg>
          </div>
          <div className="relative bg-white dark:bg-card rounded-lg shadow-sm px-4 py-3 transition-shadow hover:shadow-md overflow-hidden">
            <div
              className="absolute top-0 left-0 right-0 h-[2px] rounded-b bg-amber-500 dark:bg-amber-500"
              aria-hidden
            />
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
              Outstanding Invoices
            </p>
            <p className="text-base font-medium mt-0.5 tabular-nums text-[#2D2D2D] dark:text-foreground">
              ${fmtUsd(overdueInvoices.reduce((sum, i) => sum + (i.balanceDue ?? 0), 0))}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-muted-foreground mt-0.5">
              {overdueInvoices.length} pending
            </p>
            <svg
              viewBox="0 0 80 20"
              className="mt-2 w-full h-5 text-gray-400 dark:text-gray-500"
              aria-hidden
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,10 20,14 40,8 60,12 80,6"
              />
            </svg>
          </div>
          <div className="relative bg-white dark:bg-card rounded-lg shadow-sm px-4 py-3 transition-shadow hover:shadow-md overflow-hidden">
            <div
              className="absolute top-0 left-0 right-0 h-[2px] rounded-b bg-amber-500 dark:bg-amber-500"
              aria-hidden
            />
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
              Bills Due
            </p>
            <p className="text-base font-medium mt-0.5 tabular-nums text-[#2D2D2D] dark:text-foreground">
              {apBillsSummary.dueThisWeekCount} · ${fmtUsd(apBillsSummary.dueThisWeekAmount)}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-muted-foreground mt-0.5">
              Due this week
            </p>
            <svg
              viewBox="0 0 80 20"
              className="mt-2 w-full h-5 text-gray-400 dark:text-gray-500"
              aria-hidden
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,12 20,8 40,14 60,10 80,12"
              />
            </svg>
          </div>
          <div className="relative bg-white dark:bg-card rounded-lg shadow-sm px-4 py-3 transition-shadow hover:shadow-md overflow-hidden">
            <div
              className="absolute top-0 left-0 right-0 h-[2px] rounded-b bg-gray-200 dark:bg-gray-600"
              aria-hidden
            />
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
              Labor Cost (This Month)
            </p>
            <p className="text-base font-medium mt-0.5 tabular-nums text-[#2D2D2D] dark:text-foreground">
              ${fmtUsd(laborCostThisWeek)}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-muted-foreground mt-0.5">
              This month
            </p>
            <svg
              viewBox="0 0 80 20"
              className="mt-2 w-full h-5 text-gray-400 dark:text-gray-500"
              aria-hidden
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,8 20,12 40,10 60,14 80,8"
              />
            </svg>
          </div>
          <div className="relative bg-white dark:bg-card rounded-lg shadow-sm px-4 py-3 transition-shadow hover:shadow-md overflow-hidden">
            <div
              className={cn(
                "absolute top-0 left-0 right-0 h-[2px] rounded-b",
                projectProfitSummary >= 0
                  ? "bg-green-600 dark:bg-green-600"
                  : "bg-gray-200 dark:bg-gray-600"
              )}
              aria-hidden
            />
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
              Profit
            </p>
            <p
              className={cn(
                "text-base font-medium mt-0.5 tabular-nums",
                projectProfitSummary >= 0
                  ? "text-green-600 dark:text-green-500"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {projectProfitSummary >= 0 ? "$" : "−$"}
              {fmtUsd(Math.abs(projectProfitSummary))}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-muted-foreground mt-0.5">
              This month
            </p>
            <svg
              viewBox="0 0 80 20"
              className={cn(
                "mt-2 w-full h-5",
                projectProfitSummary >= 0
                  ? "text-green-600 dark:text-green-500"
                  : "text-gray-400 dark:text-gray-500"
              )}
              aria-hidden
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,14 20,12 40,8 60,10 80,6"
              />
            </svg>
          </div>
        </div>

        {debugEnabled ? (
          <div className="rounded-xl bg-white shadow-sm px-4 py-3 text-xs text-gray-500">
            Supabase URL configured: {supabaseUrl ? "YES" : "NO"} ({maskTail(supabaseUrl)}) | Anon
            key configured: {supabaseAnonKey ? "YES" : "NO"} ({maskTail(supabaseAnonKey)})
          </div>
        ) : null}

        {/* Section 3 — Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column (span 2): Recent Projects, Recent Activity */}
          <div className="space-y-6 lg:col-span-2">
            <section className="bg-white dark:bg-card rounded-lg shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-[#EBEBE9] dark:border-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight text-[#2D2D2D] dark:text-foreground">
                    Recent Projects
                  </h2>
                  <Link
                    href="/projects"
                    className="text-sm text-gray-500 dark:text-muted-foreground hover:text-[#2D2D2D] dark:hover:text-foreground transition"
                  >
                    View all
                  </Link>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                  Revenue, cost, profit, and margin by project.
                </p>
              </div>
              <div className="table-responsive">
                <table className="w-full min-w-[520px] text-sm md:min-w-0">
                  <thead>
                    <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border dark:bg-muted/50">
                      <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
                        Project
                      </th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground tabular-nums">
                        Revenue
                      </th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground tabular-nums">
                        Cost
                      </th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground tabular-nums">
                        Profit
                      </th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground tabular-nums">
                        Margin
                      </th>
                      <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
                        Risk
                      </th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground tabular-nums">
                        Progress
                      </th>
                      <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectHealthRows.length === 0 ? (
                      <tr className="border-b">
                        <td colSpan={8} className="py-8 px-4 text-center text-sm text-gray-500">
                          No projects yet.
                        </td>
                      </tr>
                    ) : (
                      projectHealthRows.map((p) => {
                        const status = getHealthStatus(p.marginPct);
                        const risk = riskByProjectId.get(p.id) ?? "LOW";
                        const riskBadge =
                          risk === "HIGH"
                            ? {
                                label: "HIGH",
                                variant: "muted" as const,
                                className: "text-red-600 [&>span:first-child]:!bg-red-500",
                              }
                            : risk === "MEDIUM"
                              ? { label: "MEDIUM", variant: "warning" as const }
                              : { label: "LOW", variant: "success" as const };
                        const progressPct = p.budget > 0 ? (p.actual / p.budget) * 100 : 0;
                        const over = progressPct > 100;
                        return (
                          <tr
                            key={p.id}
                            className="h-10 border-b border-[#EBEBE9] dark:border-border/60 transition-colors hover:bg-[#F7F7F5] dark:hover:bg-muted/20"
                          >
                            <td className="py-2 px-4">
                              <div>
                                <Link
                                  href={`/projects/${p.id}`}
                                  className="font-medium text-[#2D2D2D] dark:text-foreground hover:underline"
                                >
                                  {p.name}
                                </Link>
                                <p className="text-[10px] text-gray-400 dark:text-muted-foreground mt-0.5">
                                  {risk === "HIGH" ? "At risk" : "Active"}
                                </p>
                              </div>
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">
                              ${fmtUsd(p.revenue)}
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">
                              ${fmtUsd(p.actual)}
                            </td>
                            <td
                              className={cn(
                                "py-2 px-4 text-right tabular-nums font-medium",
                                p.profit >= 0 ? "text-green-600" : "text-red-600"
                              )}
                            >
                              {p.profit >= 0 ? "" : "−"}${fmtUsd(Math.abs(p.profit))}
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">
                              {fmtPct(p.marginPct)}
                            </td>
                            <td className="py-2 px-4">
                              {risk === "HIGH" ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-xs px-2 py-0.5">
                                  <span
                                    className="h-1 w-1 rounded-full bg-red-500 dark:bg-red-400"
                                    aria-hidden
                                  />
                                  {riskBadge.label}
                                </span>
                              ) : risk === "MEDIUM" ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs px-2 py-0.5">
                                  <span
                                    className="h-1 w-1 rounded-full bg-amber-500 dark:bg-amber-400"
                                    aria-hidden
                                  />
                                  {riskBadge.label}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 text-xs px-2 py-0.5">
                                  <span
                                    className="h-1 w-1 rounded-full bg-green-500 dark:bg-green-400"
                                    aria-hidden
                                  />
                                  {riskBadge.label}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">
                              <div className="flex flex-col items-end gap-1">
                                <span
                                  className={cn(
                                    "text-xs tabular-nums",
                                    over
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-gray-500 dark:text-muted-foreground"
                                  )}
                                >
                                  {Number.isFinite(progressPct) ? fmtPct(progressPct) : "—"}
                                </span>
                                <div className="h-0.5 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
                                  <div
                                    className={cn(
                                      "h-0.5 rounded-full",
                                      over
                                        ? "bg-red-500 dark:bg-red-400"
                                        : "bg-gray-900 dark:bg-gray-100"
                                    )}
                                    style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-4">
                              <StatusBadge
                                label={status.label}
                                variant={status.variant}
                                className={status.className}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white dark:bg-card rounded-lg shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-[#EBEBE9] dark:border-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight text-[#2D2D2D] dark:text-foreground">
                    Recent Activity
                  </h2>
                  <Link
                    href="/financial/invoices"
                    className="text-sm text-gray-500 dark:text-muted-foreground hover:text-[#2D2D2D] dark:hover:text-foreground transition"
                  >
                    View all
                  </Link>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                  Latest transactions.
                </p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-border/60">
                {recentActivity.length === 0 ? (
                  <div className="py-8 px-4 text-center text-sm text-gray-500 dark:text-muted-foreground">
                    No activity.
                  </div>
                ) : (
                  recentActivity.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#F7F7F5] dark:hover:bg-muted/20"
                    >
                      <div
                        className="h-[30px] w-[30px] shrink-0 rounded-lg bg-gray-50 dark:bg-muted border border-[#EBEBE9] dark:border-border flex items-center justify-center"
                        aria-hidden
                      >
                        <svg
                          width={12}
                          height={12}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-gray-400 dark:text-muted-foreground"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="truncate text-sm font-medium text-[#2D2D2D] dark:text-foreground">
                            {tx.projectName}
                          </span>
                          <span className="bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground text-[9px] px-1.5 py-0.5 rounded-full capitalize shrink-0">
                            {tx.type === "invoice"
                              ? "Invoice"
                              : tx.type === "bill"
                                ? "Bill"
                                : tx.type === "expense"
                                  ? "Expense"
                                  : "Labor"}
                          </span>
                        </div>
                        <div className="truncate text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                          {tx.description}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs tabular-nums text-gray-500 dark:text-muted-foreground">
                          {tx.date}
                        </div>
                        <div
                          className={cn(
                            "text-sm tabular-nums font-medium",
                            tx.amount < 0 && "text-red-600 dark:text-red-400",
                            tx.amount >= 0 && "text-green-700 dark:text-green-400"
                          )}
                        >
                          {tx.amount >= 0 ? "" : "−"}${Math.abs(tx.amount).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Right column: Financial Summary, Bills Due */}
          <div className="space-y-6">
            <section className="bg-white dark:bg-card rounded-lg shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-[#EBEBE9] dark:border-border">
                <h2 className="text-xl font-medium tracking-tight text-[#2D2D2D] dark:text-foreground">
                  Financial Summary
                </h2>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                  Portfolio snapshot.
                </p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1">
                  {kpis.map((k, i) => (
                    <div
                      key={k.key}
                      className={cn(
                        "flex items-center justify-between py-2.5",
                        i < kpis.length - 1 && "border-b border-[#EBEBE9] dark:border-border/60"
                      )}
                    >
                      <span className="text-xs text-gray-500 dark:text-muted-foreground flex items-center gap-1.5">
                        {k.icon ? <k.icon className="h-3.5 w-3.5 opacity-60" /> : null}
                        {k.label}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          k.emphasis && "text-[#2D2D2D] dark:text-foreground"
                        )}
                      >
                        {k.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-muted/50 px-3 py-3 mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-muted-foreground">
                    <span>Budget usage</span>
                    <span className="tabular-nums">{budgetUsagePct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-1.5 rounded-full bg-gray-900 dark:bg-gray-100"
                      style={{ width: `${Math.min(100, budgetUsagePct)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 dark:text-muted-foreground">
                    <span>$0</span>
                    <span className="tabular-nums">
                      {budgetUsagePct > 0
                        ? `$${Math.round(stats.totalSpent / (budgetUsagePct / 100) / 1000)}K`
                        : "—"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-muted-foreground">
                    <span>Total spent</span>
                    <span className="tabular-nums font-medium text-[#2D2D2D] dark:text-foreground">
                      ${stats.totalSpent.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500 dark:text-muted-foreground">
                    <span>Total profit</span>
                    <span
                      className={cn(
                        "tabular-nums font-medium",
                        profitPositive
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {profitPositive ? "" : "−"}${stats.totalProfit.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white dark:bg-card rounded-lg shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-[#EBEBE9] dark:border-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight text-[#2D2D2D] dark:text-foreground">
                    Bills Due
                  </h2>
                  <Link
                    href="/bills"
                    className="text-sm text-gray-500 dark:text-muted-foreground hover:text-[#2D2D2D] dark:hover:text-foreground transition"
                  >
                    View all
                  </Link>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                  Outstanding, overdue, and due this week.
                </p>
              </div>
              <div className="p-4">
                <div className="flex justify-between text-sm py-2.5 border-b border-[#EBEBE9] dark:border-border/60">
                  <span className="text-gray-500 dark:text-muted-foreground">Outstanding</span>
                  <span className="tabular-nums font-medium text-amber-600 dark:text-amber-400">
                    ${fmtUsd(apBillsSummary.totalOutstanding)}
                  </span>
                </div>
                <div className="flex justify-between text-sm py-2.5 border-b border-[#EBEBE9] dark:border-border/60">
                  <span className="text-gray-500 dark:text-muted-foreground">Overdue</span>
                  <span className="tabular-nums text-[#2D2D2D] dark:text-foreground">
                    {apBillsSummary.overdueCount} bills · ${fmtUsd(apBillsSummary.overdueAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm py-2.5">
                  <span className="text-gray-500 dark:text-muted-foreground">Due this week</span>
                  <span className="tabular-nums text-[#2D2D2D] dark:text-foreground">
                    {apBillsSummary.dueThisWeekCount} bills · $
                    {fmtUsd(apBillsSummary.dueThisWeekAmount)}
                  </span>
                </div>
                <div className="pt-3 border-t border-[#EBEBE9] dark:border-border">
                  <Link
                    href="/bills/new"
                    className="inline-flex items-center justify-center rounded-full h-9 px-4 bg-black text-white text-sm font-medium transition hover:scale-[1.02]"
                  >
                    New bill
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Additional sections: Outstanding Subcontracts, Upcoming Tasks, Overdue Invoices */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="bg-white dark:bg-card rounded-lg shadow-sm overflow-hidden transition-shadow hover:shadow-md lg:col-span-2">
            <div className="px-4 py-3 border-b border-[#EBEBE9] dark:border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium tracking-tight text-[#2D2D2D] dark:text-foreground">
                  Outstanding Subcontracts
                </h2>
                <Link
                  href="/subcontractors"
                  className="text-sm text-gray-500 hover:text-[#2D2D2D] transition"
                >
                  View all
                </Link>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Subcontracts with balance due.</p>
            </div>
            <div className="table-responsive">
              <table className="w-full min-w-[400px] text-sm md:min-w-0">
                <thead>
                  <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5]">
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">
                      Subcontractor
                    </th>
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">
                      Project
                    </th>
                    <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingSubcontracts.length === 0 ? (
                    <tr className="border-b">
                      <td colSpan={3} className="py-6 px-4 text-center text-xs text-gray-500">
                        No outstanding balances.
                      </td>
                    </tr>
                  ) : (
                    outstandingSubcontracts.map((r) => (
                      <tr key={r.id} className="h-10 border-b transition-colors hover:bg-[#F7F7F5]">
                        <td className="py-2 px-4 font-medium text-[#2D2D2D]">
                          {r.subcontractor_name}
                        </td>
                        <td className="py-2 px-4 text-gray-500">
                          <Link
                            href={`/projects/${r.project_id}/subcontracts`}
                            className="hover:text-[#2D2D2D]"
                          >
                            {r.project_name}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium text-red-600">
                          ${fmtUsd(r.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white dark:bg-card rounded-lg shadow-sm overflow-hidden transition-shadow hover:shadow-md">
            <div className="px-4 py-3 border-b border-[#EBEBE9] dark:border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium tracking-tight text-[#2D2D2D] dark:text-foreground">
                  Overdue Invoices
                </h2>
                <Link
                  href="/financial/invoices"
                  className="text-sm text-gray-500 hover:text-[#2D2D2D] transition"
                >
                  View all
                </Link>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Invoices past due with balance outstanding.
              </p>
            </div>
            <div className="table-responsive">
              <table className="w-full min-w-[400px] text-sm md:min-w-0">
                <thead>
                  <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5]">
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">
                      Project
                    </th>
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">
                      Customer
                    </th>
                    <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">
                      Amount Due
                    </th>
                    <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">
                      Days Overdue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.length === 0 ? (
                    <tr className="border-b">
                      <td colSpan={4} className="py-6 px-4 text-center text-sm text-gray-500">
                        No overdue invoices.
                      </td>
                    </tr>
                  ) : (
                    overdueInvoices.map((row) => (
                      <tr
                        key={row.id}
                        className="h-10 border-b transition-colors hover:bg-[#F7F7F5]"
                      >
                        <td className="py-2 px-4">
                          <Link
                            href={`/financial/invoices/${row.id}`}
                            className="font-medium text-[#2D2D2D] hover:underline"
                          >
                            {row.projectName || row.projectId || "—"}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-gray-500">{row.clientName}</td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium text-red-600">
                          ${fmtUsd(row.balanceDue)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-red-600">
                          {row.daysOverdue}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {upcomingTasks.length > 0 ? (
          <section className="bg-white dark:bg-card rounded-lg shadow-sm overflow-hidden transition-shadow hover:shadow-md">
            <div className="px-4 py-3 border-b border-[#EBEBE9] dark:border-border">
              <h2 className="text-xl font-medium tracking-tight text-[#2D2D2D] dark:text-foreground">
                Upcoming Tasks
              </h2>
              <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                Auto-generated operational follow-ups.
              </p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-border/60">
              {upcomingTasks.map((t) => {
                const isToday = /today/i.test(t.due);
                const isThisWeek = /this week|week/i.test(t.due) && !isToday;
                const dotClass = isToday
                  ? "bg-red-400 dark:bg-red-400"
                  : isThisWeek
                    ? "bg-amber-400 dark:bg-amber-400"
                    : "bg-gray-300 dark:bg-gray-500";
                const badgeClass = isToday
                  ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-[9.5px] px-1.5 py-0.5 rounded-full"
                  : isThisWeek
                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[9.5px] px-1.5 py-0.5 rounded-full"
                    : "bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground text-[9.5px] px-1.5 py-0.5 rounded-full";
                return (
                  <div
                    key={t.id}
                    className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-[#F7F7F5] dark:hover:bg-muted/20"
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span
                        className={cn(
                          "inline-block h-[5px] w-[5px] rounded-full mt-1.5 shrink-0",
                          dotClass
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[#2D2D2D] dark:text-foreground">
                          {t.title}
                        </div>
                        <div className="truncate text-xs text-gray-500 dark:text-muted-foreground">
                          {t.meta}
                        </div>
                      </div>
                    </div>
                    <span className={cn("shrink-0 tabular-nums", badgeClass)}>{t.due}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

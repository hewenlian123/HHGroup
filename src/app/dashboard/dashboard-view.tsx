import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActionBar } from "@/components/action-bar";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge, Divider } from "@/components/base";
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
  projects: Awaited<ReturnType<typeof import("@/lib/data").getProjects>>;
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
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function getHealthStatus(marginPct: number): { label: string; variant: "success" | "warning" | "muted"; className?: string } {
  if (marginPct > 25) return { label: "Excellent", variant: "success" };
  if (marginPct >= 15) return { label: "Good", variant: "success" };
  if (marginPct >= 5) return { label: "Warning", variant: "warning" };
  return { label: "Risk", variant: "muted", className: "text-red-600 dark:text-red-400 [&>span:first-child]:!bg-red-500" };
}

export function DashboardView(props: DashboardViewProps): React.ReactNode {
  const {
    stats,
    riskOverview,
    apBillsSummary,
    laborCostThisWeek,
    expensesThisMonth,
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
  } = props;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Dashboard" subtitle="Construction operations overview." />

      <ActionBar
        left={
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-md border border-zinc-200/70 bg-background px-2.5 py-1.5 dark:border-border">
              <span className="text-foreground font-medium tabular-nums">{stats.activeProjects}</span>
              Active projects
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-zinc-200/70 bg-background px-2.5 py-1.5 dark:border-border">
              <span className="text-foreground font-medium tabular-nums">{riskOverview.summary.highCount}</span>
              High risk
            </span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
              View projects
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link href="/estimates" className="text-sm text-muted-foreground hover:text-foreground">
              View estimates
            </Link>
          </div>
        }
      />
      {debugEnabled ? (
        <div className="rounded-lg border border-zinc-200/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Supabase URL configured: {supabaseUrl ? "YES" : "NO"} ({maskTail(supabaseUrl)}) | Anon key configured:{" "}
          {supabaseAnonKey ? "YES" : "NO"} ({maskTail(supabaseAnonKey)})
        </div>
      ) : null}

      <div className="flex flex-wrap items-stretch gap-0 border-b border-zinc-200/70 dark:border-border">
        <div className="flex min-w-0 flex-1 basis-32 flex-col border-r border-zinc-200/70 py-3 pr-4 dark:border-border">
          <span className="text-xs text-muted-foreground">Outstanding Bills</span>
          <span className="mt-0.5 text-sm font-medium tabular-nums">${fmtUsd(apBillsSummary.totalOutstanding)}</span>
        </div>
        <div className="flex min-w-0 flex-1 basis-32 flex-col border-r border-zinc-200/70 py-3 pr-4 dark:border-border">
          <span className="text-xs text-muted-foreground">Overdue Bills</span>
          <span className="mt-0.5 text-sm font-medium tabular-nums">{apBillsSummary.overdueCount} · ${fmtUsd(apBillsSummary.overdueAmount)}</span>
        </div>
        <div className="flex min-w-0 flex-1 basis-32 flex-col border-r border-zinc-200/70 py-3 pr-4 dark:border-border">
          <span className="text-xs text-muted-foreground">Bills Due This Week</span>
          <span className="mt-0.5 text-sm font-medium tabular-nums">{apBillsSummary.dueThisWeekCount} · ${fmtUsd(apBillsSummary.dueThisWeekAmount)}</span>
        </div>
        <div className="flex min-w-0 flex-1 basis-32 flex-col border-r border-zinc-200/70 py-3 pr-4 dark:border-border">
          <span className="text-xs text-muted-foreground">Labor Cost This Week</span>
          <span className="mt-0.5 text-sm font-medium tabular-nums">${fmtUsd(laborCostThisWeek)}</span>
        </div>
        <div className="flex min-w-0 flex-1 basis-32 flex-col border-r border-zinc-200/70 py-3 pr-4 dark:border-border">
          <span className="text-xs text-muted-foreground">Expenses This Month</span>
          <span className="mt-0.5 text-sm font-medium tabular-nums">${fmtUsd(expensesThisMonth)}</span>
        </div>
        <div className="flex min-w-0 flex-1 basis-32 flex-col py-3 pr-4">
          <span className="text-xs text-muted-foreground">Project Profit Summary</span>
          <span className={cn("mt-0.5 text-sm font-medium tabular-nums", projectProfitSummary >= 0 ? "text-emerald-700/90 dark:text-emerald-300" : "text-red-600/90 dark:text-red-400")}>
            ${projectProfitSummary >= 0 ? "" : "−"}${fmtUsd(Math.abs(projectProfitSummary))}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader
                title="Project Health"
                subtitle="Revenue, cost, profit, and margin by project."
                actions={
                  <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
                    View all
                  </Link>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/10">
                    <th className="py-2 px-4 text-left table-head-label">Project</th>
                    <th className="py-2 px-4 text-right table-head-label tabular-nums">Revenue</th>
                    <th className="py-2 px-4 text-right table-head-label tabular-nums">Cost</th>
                    <th className="py-2 px-4 text-right table-head-label tabular-nums">Profit</th>
                    <th className="py-2 px-4 text-right table-head-label tabular-nums">Margin</th>
                    <th className="py-2 px-4 text-left table-head-label">Risk</th>
                    <th className="py-2 px-4 text-right table-head-label tabular-nums">Progress</th>
                    <th className="py-2 px-4 text-left table-head-label">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projectHealthRows.length === 0 ? (
                    <tr className="border-b border-zinc-100/50 dark:border-border/30">
                      <td colSpan={8} className="py-8 px-4 text-center text-muted-foreground">
                        No projects yet.
                      </td>
                    </tr>
                  ) : (
                    projectHealthRows.map((p) => {
                      const status = getHealthStatus(p.marginPct);
                      const risk = riskByProjectId.get(p.id) ?? "LOW";
                      const riskBadge =
                        risk === "HIGH"
                          ? { label: "HIGH", variant: "muted" as const, className: "text-red-600 dark:text-red-400 [&>span:first-child]:!bg-red-500" }
                          : risk === "MEDIUM"
                            ? { label: "MEDIUM", variant: "warning" as const }
                            : { label: "LOW", variant: "success" as const };
                      const progressPct = p.budget > 0 ? (p.actual / p.budget) * 100 : 0;
                      const over = progressPct > 100;
                      return (
                        <tr key={p.id} className="table-row-compact border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-4">
                            <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:underline">
                              {p.name}
                            </Link>
                          </td>
                          <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(p.revenue)}</td>
                          <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(p.actual)}</td>
                          <td
                            className={cn(
                              "py-2 px-4 text-right tabular-nums font-medium",
                              p.profit >= 0 ? "text-emerald-700/90 dark:text-emerald-300" : "text-red-600/90 dark:text-red-400"
                            )}
                          >
                            {p.profit >= 0 ? "" : "−"}${fmtUsd(Math.abs(p.profit))}
                          </td>
                          <td className="py-2 px-4 text-right tabular-nums">{fmtPct(p.marginPct)}</td>
                          <td className="py-2 px-4">
                            <StatusBadge label={riskBadge.label} variant={riskBadge.variant} className={riskBadge.className} />
                          </td>
                          <td className="py-2 px-4 text-right tabular-nums">
                            <div className="flex flex-col items-end gap-1">
                              <span className={cn("text-xs tabular-nums", over ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                                {Number.isFinite(progressPct) ? fmtPct(progressPct) : "—"}
                              </span>
                              <div className="h-1.5 w-24 rounded-full bg-muted">
                                <div
                                  className={cn("h-1.5 rounded-full", over ? "bg-red-500" : "bg-zinc-800 dark:bg-zinc-200")}
                                  style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <StatusBadge label={status.label} variant={status.variant} className={status.className} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <Divider />
          <section>
            <div className="py-3">
              <SectionHeader
                title="Outstanding Subcontracts"
                subtitle="Subcontracts with balance due."
                actions={
                  <Link href="/subcontractors" className="text-sm text-muted-foreground hover:text-foreground">
                    View all
                  </Link>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subcontractor</th>
                    <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                    <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingSubcontracts.length === 0 ? (
                    <tr className="border-b border-border/40">
                      <td colSpan={3} className="py-6 px-4 text-center text-muted-foreground text-xs">
                        No outstanding balances.
                      </td>
                    </tr>
                  ) : (
                    outstandingSubcontracts.map((r) => (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="py-2 px-4 font-medium">{r.subcontractor_name}</td>
                        <td className="py-2 px-4 text-muted-foreground">
                          <Link href={`/projects/${r.project_id}/subcontracts`} className="hover:text-foreground">
                            {r.project_name}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium text-red-600 dark:text-red-400">
                          ${fmtUsd(r.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader title="Upcoming Tasks" subtitle="Auto-generated operational follow-ups." />
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-border">
              {upcomingTasks.length === 0 ? (
                <div className="py-8 px-4 text-center text-sm text-muted-foreground">No upcoming tasks.</div>
              ) : (
                upcomingTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{t.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.meta}</div>
                    </div>
                    <div className="shrink-0 rounded-md border border-zinc-200/70 bg-background px-2 py-1 text-xs tabular-nums text-muted-foreground dark:border-border">
                      {t.due}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader
                title="Bills (AP)"
                subtitle="Outstanding, overdue, and due this week."
                actions={
                  <Link href="/bills" className="text-sm text-muted-foreground hover:text-foreground">
                    View all
                  </Link>
                }
              />
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="tabular-nums font-medium">${fmtUsd(apBillsSummary.totalOutstanding)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Overdue</span>
                <span className="tabular-nums">{apBillsSummary.overdueCount} bills · ${fmtUsd(apBillsSummary.overdueAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Due this week</span>
                <span className="tabular-nums">{apBillsSummary.dueThisWeekCount} bills · ${fmtUsd(apBillsSummary.dueThisWeekAmount)}</span>
              </div>
              <div className="pt-2 border-t border-zinc-200/60 dark:border-border">
                <Link href="/bills/new" className="text-sm text-muted-foreground hover:text-foreground">
                  + New bill
                </Link>
              </div>
            </div>
          </section>

          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader
                title="Overdue Invoices"
                subtitle="Invoices past due with balance outstanding."
                actions={
                  <Link href="/financial/invoices" className="text-sm text-muted-foreground hover:text-foreground">
                    View all
                  </Link>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/10">
                    <th className="py-2 px-4 text-left table-head-label">Project</th>
                    <th className="py-2 px-4 text-left table-head-label">Customer</th>
                    <th className="py-2 px-4 text-right table-head-label tabular-nums">Amount Due</th>
                    <th className="py-2 px-4 text-right table-head-label tabular-nums">Days Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.length === 0 ? (
                    <tr className="border-b border-zinc-100/50 dark:border-border/30">
                      <td colSpan={4} className="py-6 px-4 text-center text-muted-foreground">
                        No overdue invoices.
                      </td>
                    </tr>
                  ) : (
                    overdueInvoices.map((row) => (
                      <tr key={row.id} className="table-row-compact border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-2 px-4">
                          <Link href={`/financial/invoices/${row.id}`} className="font-medium text-foreground hover:underline">
                            {row.projectName || row.projectId || "—"}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-muted-foreground">{row.clientName}</td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium text-red-600 dark:text-red-400">
                          ${fmtUsd(row.balanceDue)}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-red-600 dark:text-red-400">
                          {row.daysOverdue}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader title="Financial Overview" subtitle="Portfolio snapshot." />
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {kpis.map((k) => (
                  <div key={k.key} className="rounded-md border border-zinc-200/70 bg-background px-3 py-2 dark:border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {k.icon ? <k.icon className="h-3.5 w-3.5" /> : null}
                      <span className="truncate">{k.label}</span>
                    </div>
                    <div className={cn("mt-1 text-sm font-semibold tabular-nums text-foreground", k.emphasis && "text-foreground")}>
                      {k.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-zinc-200/70 bg-muted/10 px-3 py-3 dark:border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Budget usage</span>
                  <span className="tabular-nums">{budgetUsagePct.toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-zinc-800 dark:bg-zinc-200" style={{ width: `${Math.min(100, budgetUsagePct)}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Total spent</span>
                  <span className="tabular-nums">${stats.totalSpent.toLocaleString()}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Total profit</span>
                  <span className={cn("tabular-nums", profitPositive ? "text-emerald-700/90 dark:text-emerald-300" : "text-red-700/90 dark:text-red-300")}>
                    ${stats.totalProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader title="Recent Activity" subtitle="Latest transactions." />
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-border">
              {recentActivity.length === 0 ? (
                <div className="py-8 px-4 text-center text-sm text-muted-foreground">No activity.</div>
              ) : (
                recentActivity.map((tx) => (
                  <div key={tx.id} className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{tx.projectName}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="truncate text-xs text-muted-foreground capitalize">{tx.type}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{tx.description}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs tabular-nums text-muted-foreground">{tx.date}</div>
                      <div className={cn("text-sm tabular-nums font-medium", tx.amount < 0 && "text-red-600/80", tx.amount > 0 && "text-emerald-700/80")}>
                        {tx.amount >= 0 ? "" : "−"}${Math.abs(tx.amount).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

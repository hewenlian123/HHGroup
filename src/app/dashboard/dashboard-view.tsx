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
  } = props;

  return (
    <div className="min-h-full bg-[#F5F5F7]">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Section 1 — Page header */}
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111111]">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Company overview</p>
        </header>

        {/* Section 2 — KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow-sm px-4 py-3 transition-shadow hover:shadow-md">
            <p className="text-xs uppercase tracking-wide text-gray-500">Active Projects</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">{stats.activeProjects}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-4 py-3 transition-shadow hover:shadow-md">
            <p className="text-xs uppercase tracking-wide text-gray-500">Outstanding Invoices</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">
              ${fmtUsd(overdueInvoices.reduce((sum, i) => sum + (i.balanceDue ?? 0), 0))}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-4 py-3 transition-shadow hover:shadow-md">
            <p className="text-xs uppercase tracking-wide text-gray-500">Bills Due</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">
              {apBillsSummary.dueThisWeekCount} · ${fmtUsd(apBillsSummary.dueThisWeekAmount)}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-4 py-3 transition-shadow hover:shadow-md">
            <p className="text-xs uppercase tracking-wide text-gray-500">Labor Cost (This Month)</p>
            <p className="text-base font-semibold mt-0.5 tabular-nums">${fmtUsd(laborCostThisWeek)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-4 py-3 transition-shadow hover:shadow-md">
            <p className="text-xs uppercase tracking-wide text-gray-500">Profit</p>
            <p className={cn("text-base font-semibold mt-0.5 tabular-nums", projectProfitSummary >= 0 ? "text-green-600" : "text-red-600")}>
              ${projectProfitSummary >= 0 ? "" : "−"}${fmtUsd(Math.abs(projectProfitSummary))}
            </p>
          </div>
        </div>

        {debugEnabled ? (
          <div className="rounded-xl bg-white shadow-sm px-4 py-3 text-xs text-gray-500">
            Supabase URL configured: {supabaseUrl ? "YES" : "NO"} ({maskTail(supabaseUrl)}) | Anon key configured:{" "}
            {supabaseAnonKey ? "YES" : "NO"} ({maskTail(supabaseAnonKey)})
          </div>
        ) : null}

        {/* Section 3 — Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column (span 2): Recent Projects, Recent Activity */}
          <div className="space-y-6 lg:col-span-2">
            <section className="bg-white rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight text-[#111111]">Recent Projects</h2>
                  <Link href="/projects" className="text-sm text-gray-500 hover:text-[#111111] transition">View all</Link>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Revenue, cost, profit, and margin by project.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">Project</th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Revenue</th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Cost</th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Profit</th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Margin</th>
                      <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">Risk</th>
                      <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Progress</th>
                      <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">Status</th>
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
                            ? { label: "HIGH", variant: "muted" as const, className: "text-red-600 [&>span:first-child]:!bg-red-500" }
                            : risk === "MEDIUM"
                              ? { label: "MEDIUM", variant: "warning" as const }
                              : { label: "LOW", variant: "success" as const };
                        const progressPct = p.budget > 0 ? (p.actual / p.budget) * 100 : 0;
                        const over = progressPct > 100;
                        return (
                          <tr key={p.id} className="h-10 border-b transition-colors hover:bg-gray-50">
                            <td className="py-2 px-4">
                              <Link href={`/projects/${p.id}`} className="font-medium text-[#111111] hover:underline">
                                {p.name}
                              </Link>
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(p.revenue)}</td>
                            <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(p.actual)}</td>
                            <td
                              className={cn(
                                "py-2 px-4 text-right tabular-nums font-medium",
                                p.profit >= 0 ? "text-green-600" : "text-red-600"
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
                                <span className={cn("text-xs tabular-nums", over ? "text-red-600" : "text-gray-500")}>
                                  {Number.isFinite(progressPct) ? fmtPct(progressPct) : "—"}
                                </span>
                                <div className="h-1.5 w-24 rounded-full bg-gray-200">
                                  <div
                                    className={cn("h-1.5 rounded-full", over ? "bg-red-500" : "bg-[#111111]")}
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

            <section className="bg-white rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight text-[#111111]">Recent Activity</h2>
                  <Link href="/financial/invoices" className="text-sm text-gray-500 hover:text-[#111111] transition">View all</Link>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Latest transactions.</p>
              </div>
              <div className="divide-y divide-gray-100">
                {recentActivity.length === 0 ? (
                  <div className="py-8 px-4 text-center text-sm text-gray-500">No activity.</div>
                ) : (
                  recentActivity.map((tx) => (
                    <div key={tx.id} className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-gray-50">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[#111111]">{tx.projectName}</span>
                          <span className="text-xs text-gray-500">·</span>
                          <span className="truncate text-xs text-gray-500 capitalize">{tx.type}</span>
                        </div>
                        <div className="truncate text-xs text-gray-500 mt-0.5">{tx.description}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs tabular-nums text-gray-500">{tx.date}</div>
                        <div className={cn("text-sm tabular-nums font-medium", tx.amount < 0 && "text-red-600", tx.amount > 0 && "text-green-600")}>
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
            <section className="bg-white rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-xl font-semibold tracking-tight text-[#111111]">Financial Summary</h2>
                <p className="text-xs text-gray-500 mt-0.5">Portfolio snapshot.</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  {kpis.map((k) => (
                    <div key={k.key} className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 flex items-center gap-1.5">
                        {k.icon ? <k.icon className="h-3.5 w-3.5" /> : null}
                        {k.label}
                      </span>
                      <span className={cn("text-sm font-semibold tabular-nums", k.emphasis && "text-[#111111]")}>{k.value}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-3 mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Budget usage</span>
                    <span className="tabular-nums">{budgetUsagePct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-200">
                    <div className="h-1.5 rounded-full bg-[#111111]" style={{ width: `${Math.min(100, budgetUsagePct)}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>Total spent</span>
                    <span className="tabular-nums text-[#111111]">${stats.totalSpent.toLocaleString()}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
                    <span>Total profit</span>
                    <span className={cn("tabular-nums font-medium", profitPositive ? "text-green-600" : "text-red-600")}>
                      ${stats.totalProfit.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight text-[#111111]">Bills Due</h2>
                  <Link href="/bills" className="text-sm text-gray-500 hover:text-[#111111] transition">View all</Link>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Outstanding, overdue, and due this week.</p>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Outstanding</span>
                  <span className="tabular-nums font-medium text-[#111111]">${fmtUsd(apBillsSummary.totalOutstanding)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Overdue</span>
                  <span className="tabular-nums text-[#111111]">{apBillsSummary.overdueCount} bills · ${fmtUsd(apBillsSummary.overdueAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Due this week</span>
                  <span className="tabular-nums text-[#111111]">{apBillsSummary.dueThisWeekCount} bills · ${fmtUsd(apBillsSummary.dueThisWeekAmount)}</span>
                </div>
                <div className="pt-3 border-t border-gray-100">
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
          <section className="bg-white rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md lg:col-span-2">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-[#111111]">Outstanding Subcontracts</h2>
                <Link href="/subcontractors" className="text-sm text-gray-500 hover:text-[#111111] transition">View all</Link>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Subcontracts with balance due.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">Subcontractor</th>
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">Project</th>
                    <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingSubcontracts.length === 0 ? (
                    <tr className="border-b">
                      <td colSpan={3} className="py-6 px-4 text-center text-xs text-gray-500">No outstanding balances.</td>
                    </tr>
                  ) : (
                    outstandingSubcontracts.map((r) => (
                      <tr key={r.id} className="h-10 border-b transition-colors hover:bg-gray-50">
                        <td className="py-2 px-4 font-medium text-[#111111]">{r.subcontractor_name}</td>
                        <td className="py-2 px-4 text-gray-500">
                          <Link href={`/projects/${r.project_id}/subcontracts`} className="hover:text-[#111111]">
                            {r.project_name}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium text-red-600">${fmtUsd(r.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-[#111111]">Overdue Invoices</h2>
                <Link href="/financial/invoices" className="text-sm text-gray-500 hover:text-[#111111] transition">View all</Link>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Invoices past due with balance outstanding.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">Project</th>
                    <th className="py-2.5 px-4 text-left text-xs uppercase tracking-wide text-gray-500">Customer</th>
                    <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Amount Due</th>
                    <th className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-500 tabular-nums">Days Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.length === 0 ? (
                    <tr className="border-b">
                      <td colSpan={4} className="py-6 px-4 text-center text-sm text-gray-500">No overdue invoices.</td>
                    </tr>
                  ) : (
                    overdueInvoices.map((row) => (
                      <tr key={row.id} className="h-10 border-b transition-colors hover:bg-gray-50">
                        <td className="py-2 px-4">
                          <Link href={`/financial/invoices/${row.id}`} className="font-medium text-[#111111] hover:underline">
                            {row.projectName || row.projectId || "—"}
                          </Link>
                        </td>
                        <td className="py-2 px-4 text-gray-500">{row.clientName}</td>
                        <td className="py-2 px-4 text-right tabular-nums font-medium text-red-600">${fmtUsd(row.balanceDue)}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-red-600">{row.daysOverdue}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {upcomingTasks.length > 0 ? (
          <section className="bg-white rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-xl font-semibold tracking-tight text-[#111111]">Upcoming Tasks</h2>
              <p className="text-xs text-gray-500 mt-0.5">Auto-generated operational follow-ups.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {upcomingTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#111111]">{t.title}</div>
                    <div className="truncate text-xs text-gray-500">{t.meta}</div>
                  </div>
                  <div className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs tabular-nums text-gray-500">{t.due}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

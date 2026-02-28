import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDashboardStats, getRecentTransactions, getProjectRiskOverview } from "@/lib/data";
import { DollarSign, FolderKanban, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { KpiRow } from "@/components/kpi-row";
import { SectionHeader } from "@/components/section-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const stats = getDashboardStats();
  const transactions = getRecentTransactions();
  const riskOverview = getProjectRiskOverview();
  const debugFlag = searchParams?.debug;
  const debugEnabled = debugFlag === "1" || debugFlag === "true";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const maskTail = (value: string | undefined) =>
    value && value.length >= 6 ? `...${value.slice(-6)}` : value ? `...${value}` : "MISSING";

  const kpis = [
    { key: "total-projects", label: "Total Projects", value: String(stats.totalProjects), icon: FolderKanban },
    { key: "active-projects", label: "Active Projects", value: String(stats.activeProjects), icon: Wallet },
    { key: "total-budget", label: "Total Budget", value: `$${stats.totalBudget.toLocaleString()}`, icon: DollarSign },
    { key: "total-profit", label: "Total Profit", value: `$${stats.totalProfit.toLocaleString()}`, icon: TrendingUp, emphasis: true },
  ];

  type RiskRow = (typeof riskOverview.projects)[number];
  const riskColumns: Column<RiskRow>[] = [
    {
      key: "projectName",
      header: "Project",
      render: (row) => (
        <Link href={`/projects/${row.projectId}`} className="font-medium text-foreground hover:underline">
          {row.projectName}
        </Link>
      ),
    },
    { key: "status", header: "Status", render: (row) => <span className="capitalize text-zinc-500 dark:text-zinc-400">{row.status}</span> },
    { key: "riskLevel", header: "Risk", render: (row) => <StatusBadge status={row.riskLevel === "HIGH" ? "Over budget" : row.riskLevel === "MEDIUM" ? "At risk" : "On track"} /> },
    { key: "triggers", header: "Triggers", render: (row) => <span className="text-muted-foreground">{row.triggers.length ? row.triggers.join(", ") : "—"}</span> },
    {
      key: "budgetVar",
      header: "Budget Var",
      align: "right",
      className: "tabular-nums",
      render: (row) => (row.budgetVar == null ? "—" : `${row.budgetVar >= 0 ? "+" : "−"}$${Math.abs(row.budgetVar).toLocaleString()}`),
    },
    {
      key: "laborVar",
      header: "Labor Var",
      align: "right",
      className: "tabular-nums",
      render: (row) => (row.laborVar == null ? "—" : `${row.laborVar >= 0 ? "+" : "−"}$${Math.abs(row.laborVar).toLocaleString()}`),
    },
    {
      key: "runwayWeeks",
      header: "Runway",
      align: "right",
      className: "tabular-nums",
      render: (row) => (row.runwayWeeks == null ? "—" : `${row.runwayWeeks.toFixed(1)}w`),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Link href={`/projects/${row.projectId}`} className="text-xs text-muted-foreground hover:text-foreground">
            View Project
          </Link>
          {row.sourceEstimateId ? (
            <Link href={`/estimates/${row.sourceEstimateId}`} className="text-xs text-muted-foreground hover:text-foreground">
              View Estimate
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  type TxRow = (typeof transactions)[number];
  const txColumns: Column<TxRow>[] = [
    { key: "date", header: "Date", className: "tabular-nums text-muted-foreground" },
    { key: "project", header: "Project" },
    { key: "type", header: "Type", render: (row) => <span className="capitalize text-muted-foreground">{row.type}</span> },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span className={cn(row.amount < 0 && "text-red-600/80", row.amount > 0 && "text-emerald-700/80")}>
          {row.amount >= 0 ? "" : "−"}${Math.abs(row.amount).toLocaleString()}
        </span>
      ),
    },
    { key: "note", header: "Note", className: "text-muted-foreground" },
  ];

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Dashboard" subtitle="Overview of projects and finances." />
      {debugEnabled ? (
        <div className="rounded-lg border border-zinc-200/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Supabase URL configured: {supabaseUrl ? "YES" : "NO"} ({maskTail(supabaseUrl)}) | Anon key configured:{" "}
          {supabaseAnonKey ? "YES" : "NO"} ({maskTail(supabaseAnonKey)})
        </div>
      ) : null}
      <KpiRow items={kpis} />
      <section className="section-stack">
        <Card className="rounded-2xl border border-zinc-200/40 dark:border-border overflow-hidden">
          <CardHeader>
            <SectionHeader title="Project Risk Overview" subtitle="Owner-only. Auto flags over-budget, labor risk, and low runway." />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">High Risk</p>
                <p className="text-xl font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{riskOverview.summary.highCount}</p>
              </div>
              <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Over Budget</p>
                <p className="text-xl font-bold tabular-nums text-foreground">{riskOverview.summary.overBudgetCount}</p>
              </div>
              <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Labor Over</p>
                <p className="text-xl font-bold tabular-nums text-foreground">{riskOverview.summary.laborOverCount}</p>
              </div>
              <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Low Runway</p>
                <p className="text-xl font-bold tabular-nums text-foreground">{riskOverview.summary.lowRunwayCount}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
              <DataTable
                columns={riskColumns}
                data={riskOverview.projects}
                keyExtractor={(row) => row.projectId}
                emptyText="No data yet."
                rowClassName="group"
                zebra
              />
            </div>
          </CardContent>
        </Card>
      </section>
      <section className="section-stack">
        <Card className="rounded-2xl border border-zinc-200/40 dark:border-border overflow-hidden shadow-sm">
          <CardHeader>
            <SectionHeader title="Recent Transactions" subtitle="Latest financial activities across projects." />
          </CardHeader>
          <CardContent>
            <DataTable columns={txColumns} data={transactions} keyExtractor={(row) => row.id} emptyText="No data yet." zebra />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

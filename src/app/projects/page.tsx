import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { getProjects, getSourceForProject, getEstimateById, getProjectDetailFinancial, type Project } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Safe wrapper so page doesn't crash if getSourceForProject is undefined (e.g. import/bundle issue). */
const getSource = (projectId: string) => getSourceForProject?.(projectId) ?? null;

function getRevenueForProject(project: Project): number {
  const source = getSource(project.id);
  if (source?.snapshotRevenue != null) return source.snapshotRevenue;
  return project.budget;
}

function getActualCostForProject(project: Project): number {
  return getProjectDetailFinancial(project.id)?.totalSpent ?? project.spent;
}

function projectSummary(projects: Project[]) {
  const active = projects.filter((p) => p.status === "active").length;
  const completed = projects.filter((p) => p.status === "completed").length;
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalProfit = projects.reduce((s, p) => {
    const revenue = getRevenueForProject(p);
    const profit = revenue - getActualCostForProject(p);
    return s + profit;
  }, 0);
  return { total: projects.length, active, completed, totalBudget, totalProfit };
}

const columns: Column<Project>[] = [
  {
    key: "name",
    header: "Project Name",
    className: "font-medium",
    render: (row) => (
      <div className="flex flex-col gap-0.5">
        <Link href={`/projects/${row.id}`} className="font-medium text-foreground hover:underline">
          {row.name}
        </Link>
        {(() => {
          const source = getSource(row.id);
          if (!source) return null;
          const est = getEstimateById(source.sourceEstimateId);
          return (
            <span className="text-xs text-muted-foreground">
              From {est?.number ?? source.sourceEstimateId} v{source.sourceVersion}
            </span>
          );
        })()}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge status={row.status} className="text-[10px] font-medium" />,
  },
  {
    key: "budget",
    header: "Budget",
    className: "text-right tabular-nums",
    render: (row) => (
      <span className="tabular-nums text-right text-zinc-500 dark:text-zinc-400">
        ${row.budget.toLocaleString()}
      </span>
    ),
  },
  {
    key: "spent",
    header: "Spent",
    className: "text-right tabular-nums",
    render: (row) => (
      <span className="tabular-nums text-right text-zinc-500 dark:text-zinc-400">
        ${getActualCostForProject(row).toLocaleString()}
      </span>
    ),
  },
  {
    key: "profit",
    header: "Profit",
    className: "text-right tabular-nums",
    render: (row) => {
      const revenue = getRevenueForProject(row);
      const profit = revenue - getActualCostForProject(row);
      const profitClass =
        profit >= 0
          ? "text-emerald-700/80 dark:text-emerald-400/80"
          : "text-red-600/80 dark:text-red-400/80";
      return (
        <span className={cn("tabular-nums text-right font-semibold", profitClass)}>
          {profit < 0 ? "−" : ""}${Math.abs(profit).toLocaleString()}
        </span>
      );
    },
  },
  {
    key: "margin",
    header: "Margin %",
    className: "text-right tabular-nums",
    render: (row) => {
      const revenue = getRevenueForProject(row);
      const profit = revenue - getActualCostForProject(row);
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const marginClass =
        margin > 50
          ? "text-foreground"
          : margin >= 20
            ? "text-zinc-600 dark:text-zinc-400"
            : "text-amber-600 dark:text-amber-500";
      return (
        <span className={cn("tabular-nums text-right", marginClass)}>
          {margin.toFixed(0)}%
        </span>
      );
    },
  },
  {
    key: "updated",
    header: "Updated",
    className: "text-zinc-400 dark:text-zinc-500",
    render: (row) => row.updated,
  },
];

export default function ProjectsPage() {
  const projects = getProjects();
  const summary = projectSummary(projects);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Projects"
        description="Manage all construction projects."
        actions={
          <Button asChild variant="ghost" className="rounded-lg text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800" size="default">
            <Link href="/projects/new">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center divide-x divide-zinc-200/40 dark:divide-border/40 border-t border-zinc-200/40 dark:border-border/40 border-b border-zinc-200/50 dark:border-border/50 py-4">
        <div className="flex items-center gap-6 pr-6 first:pl-0">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Projects</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">{summary.total}</span>
        </div>
        <div className="flex items-center gap-6 px-6">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Active</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">{summary.active}</span>
        </div>
        <div className="flex items-center gap-6 px-6">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Completed</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">{summary.completed}</span>
        </div>
        <div className="flex items-center gap-6 px-6">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Budget</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            ${summary.totalBudget.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-6 pl-6">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Profit</span>
          <span className="text-sm font-semibold tabular-nums text-foreground inline-flex items-center gap-1">
            {summary.totalProfit >= 0 ? "" : "−"}${Math.abs(summary.totalProfit).toLocaleString()}
            {summary.totalProfit > 0 && (
              <ChevronUp className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
            )}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search projects..."
            className="pl-9 rounded-lg border-zinc-200/40 dark:border-border/60 h-9"
          />
        </div>
        <select
          className="h-9 rounded-lg border border-zinc-200/40 dark:border-border/60 bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <Card className="rounded-2xl border border-zinc-200/40 dark:border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden p-0">
        <DataTable<Project>
          columns={columns}
          data={projects}
          keyExtractor={(row) => row.id}
          className="border-0 rounded-none shadow-none"
          headerClassName="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-muted-foreground"
          rowClassName="hover:bg-zinc-50/30 dark:hover:bg-muted/5"
          cellClassName="py-6"
        />
      </Card>
    </div>
  );
}

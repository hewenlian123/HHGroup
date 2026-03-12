"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";

type ProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  budget: number | null;
  spent: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type BillMiniRow = {
  project_id: string | null;
  status: string | null;
  total: number | null;
};

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function safeNumber(n: number | null | undefined): number {
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function asStatus(value: string | null | undefined): string {
  const v = (value ?? "").toString().trim().toLowerCase();
  if (v === "active") return "active";
  if (v === "pending") return "pending";
  if (v === "completed") return "completed";
  return value ? value.toString() : "—";
}

export function ProjectsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ProjectRow[]>([]);
  const [billsByProject, setBillsByProject] = React.useState<Map<string, number>>(new Map());
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | "active" | "pending" | "completed">("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const [total, setTotal] = React.useState(0);

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setRows([]);
      setBillsByProject(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const projectsRes = await supabase
      .from("projects")
      .select("id,name,status,budget,spent,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (projectsRes.error) {
      setError(projectsRes.error.message || "Failed to load projects.");
      setRows([]);
      setBillsByProject(new Map());
      setLoading(false);
      return;
    }

    const nextRows = (projectsRes.data ?? []) as ProjectRow[];
    setTotal(projectsRes.count ?? nextRows.length);

    const projectIds = nextRows.map((p) => p.id).filter(Boolean);
    const billsRes = projectIds.length
      ? await supabase.from("bills").select("project_id,status,total").in("project_id", projectIds)
      : { data: [] as unknown[], error: null as unknown };
    const billRows = (billsRes as { error?: unknown; data?: unknown[] }).error ? ([] as BillMiniRow[]) : (((billsRes as { data?: unknown[] }).data ?? []) as BillMiniRow[]);
    const totals = new Map<string, number>();
    for (const b of billRows) {
      const pid = b.project_id;
      if (!pid) continue;
      const status = (b.status ?? "").toString().toLowerCase();
      if (status === "void") continue;
      totals.set(pid, (totals.get(pid) ?? 0) + safeNumber(b.total));
    }

    setRows(nextRows);
    setBillsByProject(totals);
    setLoading(false);
  }, [supabase, page, pageSize]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      const status = asStatus(p.status);
      if (statusFilter && status !== statusFilter) return false;
      if (!q) return true;
      const name = (p.name ?? "").toLowerCase();
      return name.includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [query, rows, statusFilter]);

  const summary = React.useMemo(() => {
    const total = rows.length;
    const active = rows.filter((p) => asStatus(p.status) === "active").length;
    const completed = rows.filter((p) => asStatus(p.status) === "completed").length;
    const totalBudget = rows.reduce((s, p) => s + safeNumber(p.budget), 0);
    const totalCost = rows.reduce((s, p) => s + safeNumber(p.spent) + (billsByProject.get(p.id) ?? 0), 0);
    const totalProfit = totalBudget - totalCost;
    return { total, active, completed, totalBudget, totalProfit };
  }, [billsByProject, rows]);

  type RowWithDerived = ProjectRow & { actualCost: number; profit: number; marginPct: number };

  const dataWithDerived: RowWithDerived[] = React.useMemo(() => {
    return filtered.map((p) => {
      const budget = safeNumber(p.budget);
      const actualCost = safeNumber(p.spent) + (billsByProject.get(p.id) ?? 0);
      const profit = budget - actualCost;
      const marginPct = budget > 0 ? (profit / budget) * 100 : 0;
      return { ...p, actualCost, profit, marginPct };
    });
  }, [billsByProject, filtered]);

  const columns: Column<RowWithDerived>[] = [
    {
      key: "name",
      header: "Project",
      className: "min-w-[220px]",
      render: (row) => (
        <div className="flex flex-col">
          <Link href={`/projects/${row.id}`} className="font-medium text-foreground hover:underline">
            {row.name?.trim() || "Untitled Project"}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">{row.id}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={asStatus(row.status)} />,
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      className: "tabular-nums",
      render: (row) => <span className="tabular-nums text-muted-foreground">{money(safeNumber(row.budget))}</span>,
    },
    {
      key: "actualCost",
      header: "Actual Cost",
      align: "right",
      className: "tabular-nums",
      render: (row) => <span className="tabular-nums text-muted-foreground">{money(row.actualCost)}</span>,
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span className={cn("tabular-nums font-semibold", row.profit < 0 ? "text-red-600" : "text-emerald-600")}>
          {row.profit < 0 ? "−" : ""}{money(Math.abs(row.profit))}
        </span>
      ),
    },
    {
      key: "marginPct",
      header: "Margin",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span className={cn("tabular-nums", row.marginPct < 0 ? "text-red-600" : row.marginPct < 20 ? "text-amber-600" : "text-muted-foreground")}>
          {row.marginPct.toFixed(0)}%
        </span>
      ),
    },
    {
      key: "updated_at",
      header: "Updated",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {(row.updated_at ?? row.created_at ?? "").slice(0, 10) || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="page-container page-stack">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            Projects
          </h1>
          <p className="mt-1.5 text-xs font-normal text-muted-foreground/80">
            Manage all construction projects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:flex-shrink-0">
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-sm text-muted-foreground/90">
          {error}
        </div>
      ) : null}

      <Card className="rounded-xl border border-gray-200/80 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Total Projects</p>
            {loading ? <Skeleton className="h-7 w-16" /> : <p className="text-xl font-semibold tabular-nums">{summary.total}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Active</p>
            {loading ? <Skeleton className="h-7 w-16" /> : <p className="text-xl font-semibold tabular-nums">{summary.active}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Completed</p>
            {loading ? <Skeleton className="h-7 w-16" /> : <p className="text-xl font-semibold tabular-nums">{summary.completed}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Total Budget</p>
            {loading ? <Skeleton className="h-7 w-28" /> : <p className="text-xl font-semibold tabular-nums">{money(summary.totalBudget)}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Total Profit</p>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className={cn("text-xl font-semibold tabular-nums", summary.totalProfit < 0 ? "text-red-600" : "text-emerald-600")}>
                {summary.totalProfit < 0 ? "−" : ""}{money(Math.abs(summary.totalProfit))}
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="h-10 border-gray-200/80 pl-10 pr-3 focus-visible:ring-2 focus-visible:ring-[#6366F1]/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value as "" | "active" | "pending" | "completed") ?? "")}
            className="h-10 rounded-lg border border-gray-200/80 bg-white px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className="[&_thead_th]:text-muted-foreground/80 [&_thead_th]:font-medium">
        <Card className="overflow-hidden rounded-xl border border-gray-200/80 p-0 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 8 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          ) : dataWithDerived.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-14 text-center">
              <p className="text-sm font-medium text-foreground">No projects yet</p>
              <p className="text-xs text-muted-foreground/80">Create a project to get started.</p>
            </div>
          ) : (
            <DataTable<RowWithDerived>
              columns={columns}
              data={dataWithDerived}
              keyExtractor={(r) => r.id}
              emptyText="No projects yet"
              rowClassName="h-11 border-b border-gray-200/80 transition-colors hover:bg-gray-50/70"
            />
          )}
        </Card>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}


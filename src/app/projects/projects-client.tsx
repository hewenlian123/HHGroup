"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/filter-bar";
import { Select } from "@/components/ui/select";
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
  amount: number | null;
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
  const router = useRouter();
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
  const [statusFilter, setStatusFilter] = React.useState<"" | "active" | "pending" | "completed">(
    ""
  );
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
      ? await supabase
          .from("ap_bills")
          .select("project_id,status,amount")
          .in("project_id", projectIds)
      : { data: [] as unknown[], error: null as unknown };
    const billRows = (billsRes as { error?: unknown; data?: unknown[] }).error
      ? ([] as BillMiniRow[])
      : (((billsRes as { data?: unknown[] }).data ?? []) as BillMiniRow[]);
    const totals = new Map<string, number>();
    for (const b of billRows) {
      const pid = b.project_id;
      if (!pid) continue;
      const status = (b.status ?? "").toString().toLowerCase();
      if (status === "void") continue;
      totals.set(pid, (totals.get(pid) ?? 0) + safeNumber(b.amount));
    }

    setRows(nextRows);
    setBillsByProject(totals);
    setLoading(false);
  }, [supabase, page, pageSize]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

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
    const totalCost = rows.reduce(
      (s, p) => s + safeNumber(p.spent) + (billsByProject.get(p.id) ?? 0),
      0
    );
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
          <span className="font-medium text-foreground hover:underline">
            {row.name?.trim() || "Untitled Project"}
          </span>
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
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">{money(safeNumber(row.budget))}</span>
      ),
    },
    {
      key: "actualCost",
      header: "Actual Cost",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">{money(row.actualCost)}</span>
      ),
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span
          className={cn(
            "tabular-nums font-semibold",
            row.profit < 0 ? "text-red-600" : "text-emerald-600"
          )}
        >
          {row.profit < 0 ? "−" : ""}
          {money(Math.abs(row.profit))}
        </span>
      ),
    },
    {
      key: "marginPct",
      header: "Margin",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span
          className={cn(
            "tabular-nums",
            row.marginPct < 0
              ? "text-red-600"
              : row.marginPct < 20
                ? "text-amber-600"
                : "text-muted-foreground"
          )}
        >
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
          <h1 className="text-2xl font-semibold tracking-tight text-[#2D2D2D] dark:text-foreground sm:text-3xl">
            Projects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage all construction projects.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          <Button asChild size="sm">
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-[#EBEBE9] bg-background px-4 py-3 text-sm text-muted-foreground dark:border-border">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden border-[#EBEBE9] p-0 dark:border-border">
        <div className="grid divide-y divide-[#EBEBE9] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x dark:divide-border/60">
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Total Projects
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#2D2D2D] dark:text-foreground">
                {summary.total}
              </p>
            )}
          </div>
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Active
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#2D2D2D] dark:text-foreground">
                {summary.active}
              </p>
            )}
          </div>
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Completed
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#2D2D2D] dark:text-foreground">
                {summary.completed}
              </p>
            )}
          </div>
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Total Budget
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <p className="mt-1 text-xl font-semibold tabular-nums text-[#2D2D2D] dark:text-foreground">
                {money(summary.totalBudget)}
              </p>
            )}
          </div>
          <div className="p-4 sm:col-span-2 lg:col-span-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Total Profit
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <p
                className={cn(
                  "mt-1 text-xl font-semibold tabular-nums",
                  summary.totalProfit < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {summary.totalProfit < 0 ? "−" : ""}
                {money(Math.abs(summary.totalProfit))}
              </p>
            )}
          </div>
        </div>
      </Card>

      <FilterBar className="flex-col items-stretch sm:items-stretch">
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Search
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Project name or ID…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Status
            </p>
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter((e.target.value as "" | "active" | "pending" | "completed") ?? "")
              }
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </Select>
          </div>
        </div>
      </FilterBar>

      <div>
        <Card className="overflow-hidden border-[#EBEBE9] p-0 dark:border-border">
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 8 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          ) : dataWithDerived.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-14 text-center">
              <p className="text-sm font-medium text-foreground">No projects yet</p>
              <p className="text-xs text-muted-foreground">Create a project to get started.</p>
            </div>
          ) : (
            <DataTable<RowWithDerived>
              columns={columns}
              data={dataWithDerived}
              keyExtractor={(r) => r.id}
              emptyText="No projects yet"
              headerClassName="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30"
              onRowClick={(r) => router.push(`/projects/${r.id}`)}
              primaryColumnKey="name"
              amountColumnKeys={["budget", "actualCost", "profit", "marginPct"]}
            />
          )}
        </Card>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}

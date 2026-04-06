"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { FilterBar } from "@/components/filter-bar";
import { Select } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { DataTable, type Column } from "@/components/data-table";

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  vendor_name: string | null;
  payment_method: string | null;
  reference_no: string | null;
  total: number | null;
  line_count: number | null;
  created_at: string | null;
  worker_id?: string | null;
  project_id?: string | null;
  workers?: { id: string; name: string | null } | null;
  projects?: { id: string; name: string | null } | null;
};

type LineMiniRow = {
  expense_id: string;
  project_id: string | null;
  category: string | null;
  amount: number | null;
  projects?: { id: string; name: string | null } | null;
};

type LineMiniRowRaw = Omit<LineMiniRow, "projects"> & {
  projects?:
    | Array<{ id: string; name: string | null }>
    | { id: string; name: string | null }
    | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function safeNumber(n: number | null | undefined): number {
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function projectSummaryLabel(
  e: ExpenseRow,
  linesForExpense: LineMiniRow[],
  projectNameById: Map<string, string>
): string {
  const distinct = new Set<string>();
  for (const l of linesForExpense) {
    const pid = l.project_id;
    if (pid != null && String(pid).trim() !== "") distinct.add(String(pid).trim());
  }
  const hid = e.project_id;
  if (hid != null && String(hid).trim() !== "") distinct.add(String(hid).trim());

  if (distinct.size === 0) {
    const lineCount = linesForExpense.length;
    const reported = e.line_count ?? 0;
    if (lineCount === 0 && reported === 0) return "—";
    return "Overhead";
  }
  if (distinct.size === 1) {
    const id = [...distinct][0]!;
    const fromLine = linesForExpense.find((l) => l.project_id === id);
    return projectNameById.get(id) ?? fromLine?.projects?.name ?? e.projects?.name ?? id;
  }
  return `${distinct.size} projects`;
}

export function ExpensesClient() {
  const router = useRouter();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const PAGE_SIZE = 80;
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ExpenseRow[]>([]);
  const [lines, setLines] = React.useState<LineMiniRow[]>([]);
  const [hasMore, setHasMore] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");

  const fetchPage = React.useCallback(
    async (offset: number, append: boolean) => {
      if (!supabase) return;
      const setBusy = append ? setLoadingMore : setLoading;
      setBusy(true);
      if (!append) setError(null);
      type ExpRaw = { data: Record<string, unknown>[] | null; error: { message: string } | null };
      let expRes: ExpRaw = (await supabase
        .from("expenses")
        .select(
          "id,expense_date,vendor_name,payment_method,reference_no,total,line_count,created_at,worker_id,project_id,workers(id,name),projects(id,name)"
        )
        .order("expense_date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)) as ExpRaw;
      if (expRes.error) {
        expRes = (await supabase
          .from("expenses")
          .select(
            "id,expense_date,vendor_name,payment_method,reference_no,total,line_count,created_at"
          )
          .order("expense_date", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)) as ExpRaw;
      }
      if (expRes.error) {
        setError(expRes.error.message || "Failed to load expenses.");
        if (!append) {
          setRows([]);
          setLines([]);
        }
        setBusy(false);
        return;
      }
      const rawExpenses = (expRes.data ?? []) as (ExpenseRow & {
        workers?: unknown;
        projects?: unknown;
      })[];
      const expenses: ExpenseRow[] = rawExpenses.map((r) => ({
        ...r,
        workers:
          one(
            r.workers as
              | { id: string; name: string | null }
              | { id: string; name: string | null }[]
              | null
          ) ?? undefined,
        projects:
          one(
            r.projects as
              | { id: string; name: string | null }
              | { id: string; name: string | null }[]
              | null
          ) ?? undefined,
      }));
      setHasMore(expenses.length === PAGE_SIZE);
      const ids = expenses.map((e) => e.id);
      let lineRows: LineMiniRow[] = [];
      if (ids.length > 0) {
        const lineRes = await supabase
          .from("expense_lines")
          .select("expense_id,project_id,category,amount,projects(id,name)")
          .in("expense_id", ids);
        lineRows = lineRes.error
          ? []
          : ((lineRes.data ?? []) as unknown as LineMiniRowRaw[]).map((r) => ({
              ...r,
              projects: one(r.projects),
            }));
      }
      if (append) {
        setRows((prev) => [...prev, ...expenses]);
        setLines((prev) => [...prev, ...lineRows]);
      } else {
        setRows(expenses);
        setLines(lineRows);
      }
      setBusy(false);
    },
    [supabase]
  );

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setRows([]);
      setLines([]);
      setLoading(false);
      setHasMore(false);
      return;
    }
    setHasMore(true);
    await fetchPage(0, false);
  }, [supabase, fetchPage]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const projectsForFilter = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lines) {
      const pid = l.project_id;
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, l.projects?.name || pid);
    }
    for (const e of rows) {
      const pid = e.project_id;
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, e.projects?.name || pid);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lines, rows]);

  const projectNameById = React.useMemo(
    () => new Map(projectsForFilter.map((p) => [p.id, p.name])),
    [projectsForFilter]
  );

  const linesByExpense = React.useMemo(() => {
    const m = new Map<string, LineMiniRow[]>();
    for (const l of lines) {
      const arr = m.get(l.expense_id) ?? [];
      arr.push(l);
      m.set(l.expense_id, arr);
    }
    return m;
  }, [lines]);

  const categoriesForFilter = React.useMemo(() => {
    const set = new Set<string>();
    for (const l of lines) {
      if (l.category) set.add(l.category);
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [lines]);

  const expenseMeta = React.useMemo(() => {
    const byExpense = new Map<string, { projects: Set<string>; categories: Set<string> }>();
    for (const l of lines) {
      const eid = l.expense_id;
      if (!byExpense.has(eid)) byExpense.set(eid, { projects: new Set(), categories: new Set() });
      const meta = byExpense.get(eid)!;
      if (l.project_id) meta.projects.add(l.projects?.name || l.project_id);
      if (l.category) meta.categories.add(l.category);
    }
    return byExpense;
  }, [lines]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((e) => {
      if (q) {
        const vendor = (e.vendor_name ?? "").toLowerCase();
        const ref = (e.reference_no ?? "").toLowerCase();
        if (!vendor.includes(q) && !ref.includes(q)) return false;
      }
      if (projectFilter) {
        const meta = expenseMeta.get(e.id);
        const has = meta
          ? Array.from(meta.projects).some((nameOrId) => nameOrId === projectFilter)
          : false;
        const hasLineProject = lines.some(
          (l) => l.expense_id === e.id && l.project_id === projectFilter
        );
        const hasExpenseProject = e.project_id === projectFilter;
        if (!has && !hasLineProject && !hasExpenseProject) return false;
      }
      if (categoryFilter) {
        const hasCat = lines.some(
          (l) => l.expense_id === e.id && (l.category ?? "") === categoryFilter
        );
        if (!hasCat) return false;
      }
      return true;
    });
  }, [categoryFilter, expenseMeta, lines, projectFilter, query, rows]);

  const handleNew = async () => {
    router.push("/financial/expenses/new");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Delete this expense?")) return;
    const prevRows = rows;
    const prevLines = lines;
    setRows((r) => r.filter((e) => e.id !== id));
    setLines((l) => l.filter((line) => line.expense_id !== id));
    setError(null);
    const { error: delError } = await supabase.from("expenses").delete().eq("id", id);
    if (delError) {
      setError(delError.message || "Failed to delete expense.");
      setRows(prevRows);
      setLines(prevLines);
      return;
    }
  };

  type Row = ExpenseRow & { summary: string };
  const data: Row[] = React.useMemo(() => {
    return filtered.map((e) => {
      const meta = expenseMeta.get(e.id);
      const categoryCount = meta?.categories.size ?? 0;
      const linesForE = linesByExpense.get(e.id) ?? [];
      const projectLabel = projectSummaryLabel(e, linesForE, projectNameById);
      const catSuffix =
        categoryCount === 0
          ? ""
          : categoryCount === 1
            ? ` • ${Array.from(meta!.categories.values())[0]}`
            : ` • ${categoryCount} categories`;
      return { ...e, summary: `${projectLabel}${catSuffix}` };
    });
  }, [expenseMeta, filtered, linesByExpense, projectNameById]);

  const columns: Column<Row>[] = [
    {
      key: "expense_date",
      header: "Date",
      render: (row) => (
        <span className="font-mono tabular-nums text-foreground">
          {(row.expense_date ?? row.created_at ?? "").slice(0, 10) || "—"}
        </span>
      ),
    },
    {
      key: "vendor_name",
      header: "Vendor",
      render: (row) => (
        <span className="font-medium text-foreground">
          {row.vendor_name?.trim() || "Untitled Expense"}
        </span>
      ),
    },
    {
      key: "worker",
      header: "Worker",
      render: (row) => (
        <span className="text-muted-foreground">{row.workers?.name?.trim() ?? "—"}</span>
      ),
    },
    {
      key: "payment_method",
      header: "Payment",
      render: (row) => <span className="text-muted-foreground">{row.payment_method || "—"}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span className="font-mono tabular-nums font-medium text-red-600">
          −{money(safeNumber(row.total))}
        </span>
      ),
    },
    {
      key: "line_count",
      header: "#Lines",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {safeNumber(row.line_count)}
        </span>
      ),
    },
    {
      key: "summary",
      header: "Project / Category",
      render: (row) => <span className="text-muted-foreground">{row.summary}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <RowActionsMenu
          appearance="list"
          ariaLabel={`Actions for ${row.vendor_name?.trim() || "expense"}`}
          actions={[
            { label: "View", onClick: () => router.push(`/financial/expenses/${row.id}`) },
            { label: "Edit", onClick: () => router.push(`/financial/expenses/${row.id}`) },
            { label: "Delete", onClick: () => void handleDelete(row.id), destructive: true },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="page-container page-stack">
      <PageHeader
        title="Expenses"
        subtitle="Track vendor receipts and split costs across projects."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              onClick={() => void handleNew()}
              className="min-h-[44px] sm:min-h-0 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              New Expense
            </Button>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
              className="min-h-[44px] sm:min-h-0 w-full sm:w-auto"
            >
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-text-secondary shadow-sm dark:border-border dark:bg-card dark:text-muted-foreground">
          {error}
        </div>
      ) : null}

      <FilterBar>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Search
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary/75 dark:text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Vendor or reference..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Project
            </p>
            <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">All projects</option>
              {projectsForFilter.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Category
            </p>
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {categoriesForFilter.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FilterBar>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 10 }).map((_, idx) => (
              <Skeleton key={idx} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            <DataTable<Row>
              columns={columns}
              data={data}
              keyExtractor={(r) => r.id}
              emptyText="No data yet."
              onRowClick={(r) => router.push(`/financial/expenses/${r.id}`)}
              primaryColumnKey="vendor_name"
              amountColumnKeys={["total", "line_count"]}
            />
            {hasMore && data.length > 0 && (
              <div className="border-t border-border/60 p-3 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => fetchPage(rows.length, true)}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

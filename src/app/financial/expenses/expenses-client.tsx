"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
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
};

type LineMiniRow = {
  expense_id: string;
  project_id: string | null;
  category: string | null;
  amount: number | null;
  projects?: { id: string; name: string | null } | null;
};

type LineMiniRowRaw = Omit<LineMiniRow, "projects"> & {
  projects?: Array<{ id: string; name: string | null }> | { id: string; name: string | null } | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function safeNumber(n: number | null | undefined): number {
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
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

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ExpenseRow[]>([]);
  const [lines, setLines] = React.useState<LineMiniRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setRows([]);
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [expRes, lineRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("id,expense_date,vendor_name,payment_method,reference_no,total,line_count,created_at")
        .order("expense_date", { ascending: false })
        .limit(300),
      supabase
        .from("expense_lines")
        .select("expense_id,project_id,category,amount,projects(id,name)")
        .order("created_at", { ascending: false })
        .limit(4000),
    ]);

    if (expRes.error) {
      setError(expRes.error.message || "Failed to load expenses.");
      setRows([]);
      setLines([]);
      setLoading(false);
      return;
    }
    const expenses = (expRes.data ?? []) as ExpenseRow[];
    const lineRows = lineRes.error
      ? ([] as LineMiniRow[])
      : ((lineRes.data ?? []) as unknown as LineMiniRowRaw[]).map((r) => ({ ...r, projects: one(r.projects) }));
    setRows(expenses);
    setLines(lineRows);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectsForFilter = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lines) {
      const pid = l.project_id;
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, l.projects?.name || pid);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
        const has = meta ? Array.from(meta.projects).some((nameOrId) => nameOrId === projectFilter) : false;
        if (!has) {
          // also allow filtering by raw project id
          const hasId = lines.some((l) => l.expense_id === e.id && l.project_id === projectFilter);
          if (!hasId) return false;
        }
      }
      if (categoryFilter) {
        const hasCat = lines.some((l) => l.expense_id === e.id && (l.category ?? "") === categoryFilter);
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
    const { error: delError } = await supabase.from("expenses").delete().eq("id", id);
    if (delError) {
      setError(delError.message || "Failed to delete expense.");
      return;
    }
    await refresh();
  };

  type Row = ExpenseRow & { summary: string };
  const data: Row[] = React.useMemo(() => {
    return filtered.map((e) => {
      const meta = expenseMeta.get(e.id);
      const projectCount = meta?.projects.size ?? 0;
      const categoryCount = meta?.categories.size ?? 0;
      const summary =
        projectCount === 0
          ? "Overhead"
          : projectCount === 1
            ? Array.from(meta!.projects.values())[0]!
            : `${projectCount} projects`;
      const catSuffix = categoryCount === 0 ? "" : categoryCount === 1 ? ` • ${Array.from(meta!.categories.values())[0]}` : ` • ${categoryCount} categories`;
      return { ...e, summary: `${summary}${catSuffix}` };
    });
  }, [expenseMeta, filtered]);

  const columns: Column<Row>[] = [
    {
      key: "expense_date",
      header: "Date",
      render: (row) => <span className="tabular-nums text-foreground">{(row.expense_date ?? row.created_at ?? "").slice(0, 10) || "—"}</span>,
    },
    {
      key: "vendor_name",
      header: "Vendor",
      render: (row) => (
        <Link href={`/financial/expenses/${row.id}`} className="font-medium text-foreground hover:underline">
          {row.vendor_name?.trim() || "Untitled Expense"}
        </Link>
      ),
    },
    { key: "payment_method", header: "Payment", render: (row) => <span className="text-muted-foreground">{row.payment_method || "—"}</span> },
    {
      key: "total",
      header: "Total",
      align: "right",
      className: "tabular-nums",
      render: (row) => <span className="tabular-nums font-medium text-red-600">−{money(safeNumber(row.total))}</span>,
    },
    {
      key: "line_count",
      header: "#Lines",
      align: "right",
      className: "tabular-nums",
      render: (row) => <span className="tabular-nums text-muted-foreground">{safeNumber(row.line_count)}</span>,
    },
    { key: "summary", header: "Project / Category", render: (row) => <span className="text-muted-foreground">{row.summary}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => void handleDelete(row.id)} aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="page-container page-stack">
      <PageHeader
        title="Expenses"
        subtitle="Track vendor receipts and split costs across projects."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => void handleNew()}>
              <Plus className="h-4 w-4" />
              New Expense
            </Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-[12px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-muted-foreground">{error}</div>
      ) : null}

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Search</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Vendor or reference..." className="pl-9" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Project</p>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-10 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-sm"
            >
              <option value="">All projects</option>
              {projectsForFilter.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Category</p>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-sm"
            >
              <option value="">All categories</option>
              {categoriesForFilter.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 10 }).map((_, idx) => (
              <Skeleton key={idx} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <DataTable<Row> columns={columns} data={data} keyExtractor={(r) => r.id} emptyText="No data yet." />
        )}
      </Card>
    </div>
  );
}


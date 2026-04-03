"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getExpenses,
  getExpenseCategories,
  getExpenseTotal,
  getWorkers,
  deleteExpense,
  updateExpenseReceiptUrl,
  updateExpenseForReview,
  type Expense,
} from "@/lib/data";
import { createBrowserClient } from "@/lib/supabase";
import { Check, Eye, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuickExpenseModal } from "./quick-expense-modal";
import { EditExpenseModal, type ExpenseReviewSavePatch } from "./edit-expense-modal";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useToast } from "@/components/toast/toast-provider";

type ProjectRow = { id: string; name: string | null; status?: string | null };
type WorkerRow = { id: string; name: string };
type ReceiptItem = { url: string; fileName: string };

function statusLabel(s: string): string {
  if (s === "needs_review") return "Needs Review";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mergeExpenseReviewPatch(e: Expense, p: ExpenseReviewSavePatch): Expense {
  const nextLines =
    e.lines.length > 0
      ? e.lines.map((line, idx) =>
          idx === 0
            ? { ...line, projectId: p.projectId, category: p.category, amount: p.amount }
            : line
        )
      : [
          {
            id: `optimistic-line-${p.expenseId}`,
            projectId: p.projectId,
            category: p.category,
            amount: p.amount,
          },
        ];
  return {
    ...e,
    vendorName: p.vendorName,
    notes: p.notes ?? e.notes,
    status: p.status,
    workerId: p.workerId,
    lines: nextLines,
  };
}

function projectLabel(expense: Expense, projectNameById: Map<string, string>): string {
  const ids = Array.from(new Set(expense.lines.map((l) => l.projectId)));
  if (ids.length === 0) return "—";
  if (ids.length === 1) {
    const id = ids[0];
    return id == null ? "Overhead" : (projectNameById.get(id) ?? id);
  }
  return "Multiple";
}

function getReceiptItems(expense: Expense): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  if (expense.receiptUrl) {
    items.push({ url: expense.receiptUrl, fileName: "Receipt" });
  }
  for (const a of expense.attachments ?? []) {
    if (!a?.url) continue;
    items.push({ url: a.url, fileName: a.fileName || "Attachment" });
  }
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
}

async function resolveReceiptPreviewUrls(
  items: ReceiptItem[],
  supabase: ReturnType<typeof createBrowserClient> | null
): Promise<ReceiptItem[]> {
  if (!supabase) return items;
  const next: ReceiptItem[] = [];
  for (const item of items) {
    const u = item.url;
    if (!u || /^https?:\/\//i.test(u) || u.startsWith("blob:")) {
      next.push(item);
      continue;
    }
    const { data, error } = await supabase.storage
      .from("expense-attachments")
      .createSignedUrl(u, 3600);
    if (!error && data?.signedUrl) next.push({ ...item, url: data.signedUrl });
    else next.push(item);
  }
  return next;
}

function normalizedVendorLabel(vendor: string): string {
  const v = (vendor ?? "").trim();
  if (!v || /^unknown$/i.test(v) || /^smokevendor[-_]/i.test(v)) return "Needs Review";
  return v;
}

function extractExpenseTags(expense: Expense): string[] {
  const notes = expense.notes ?? "";
  const m = notes.match(/items:\s*(.+)$/im);
  if (m?.[1]) {
    return m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  return Array.from(new Set(expense.lines.map((l) => l.category).filter(Boolean))).slice(0, 3);
}

export default function ExpensesPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <ExpensesPageInner />
    </React.Suspense>
  );
}

function ExpensesPageInner() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [workers, setWorkers] = React.useState<WorkerRow[]>([]);
  const [projectsError, setProjectsError] = React.useState<string | null>(null);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [categoriesList, setCategoriesList] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [dateRangeFilter, setDateRangeFilter] = React.useState<"all" | "week" | "month">("all");
  const [editingVendorId, setEditingVendorId] = React.useState<string | null>(null);
  const [vendorDraft, setVendorDraft] = React.useState("");
  const appliedProjectIdFromUrl = React.useRef(false);
  React.useEffect(() => {
    if (appliedProjectIdFromUrl.current) return;
    const pid = searchParams.get("project_id");
    if (pid) {
      setProjectFilter(pid);
      appliedProjectIdFromUrl.current = true;
    }
  }, [searchParams]);
  const [receiptPreview, setReceiptPreview] = React.useState<{
    items: ReceiptItem[];
    index: number;
    expenseId?: string;
  } | null>(null);
  const [receiptZoom, setReceiptZoom] = React.useState(1);
  const [quickExpenseOpen, setQuickExpenseOpen] = React.useState(false);
  const receiptReplaceRef = React.useRef<HTMLInputElement>(null);
  const [receiptReplacing, setReceiptReplacing] = React.useState(false);
  const [editExpense, setEditExpense] = React.useState<Expense | null>(null);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = React.useState<string | null>(null);
  const expensesRef = React.useRef<Expense[]>([]);
  expensesRef.current = expenses;

  React.useEffect(() => {
    if (!supabase) {
      setProjectsError("Supabase is not configured.");
      setProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: projectsData, error } = await supabase.from("projects").select("*");
      if (cancelled) return;
      if (error) {
        setProjectsError(error.message ?? "Failed to load projects.");
        setProjects([]);
        return;
      }
      setProjectsError(null);
      const safe = projectsData ?? [];
      setProjects(Array.isArray(safe) ? safe : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [expList, cats, workerList] = await Promise.all([
        getExpenses(),
        getExpenseCategories(),
        getWorkers(),
      ]);
      if (cancelled) return;
      setExpenses(expList);
      setCategoriesList(cats);
      setWorkers(workerList as WorkerRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const safeProjects = React.useMemo(() => projects ?? [], [projects]);
  const projectNameById = React.useMemo(
    () => new Map(safeProjects.map((p) => [p.id, p.name ?? p.id])),
    [safeProjects]
  );
  const workerNameById = React.useMemo(
    () => new Map(workers.map((w) => [w.id, w.name])),
    [workers]
  );

  const summary = React.useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
    const monthTotal = expenses
      .filter((e) => (e.date ?? "").startsWith(ym))
      .reduce((s, e) => s + getExpenseTotal(e), 0);
    const allTotal = expenses.reduce((s, e) => s + getExpenseTotal(e), 0);
    const needsReview = expenses.filter((e) => (e.status ?? "pending") === "needs_review").length;
    return { monthTotal, allTotal, needsReview };
  }, [expenses, safeProjects]);

  const filtered = React.useMemo(() => {
    let list = expenses;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          normalizedVendorLabel(e.vendorName).toLowerCase().includes(q) ||
          e.referenceNo?.toLowerCase().includes(q) ||
          e.lines.some((l) => (l.memo ?? "").toLowerCase().includes(q)) ||
          extractExpenseTags(e).some((t) => t.toLowerCase().includes(q)) ||
          getExpenseTotal(e).toFixed(2).includes(q.replace(/[$,]/g, ""))
      );
    }
    if (projectFilter)
      list = list.filter((e) => e.lines.some((l) => l.projectId === projectFilter));
    if (categoryFilter)
      list = list.filter((e) => e.lines.some((l) => l.category === categoryFilter));
    if (statusFilter) list = list.filter((e) => (e.status ?? "pending") === statusFilter);
    if (dateRangeFilter !== "all") {
      const now = new Date();
      const start = new Date(now);
      if (dateRangeFilter === "week") start.setDate(now.getDate() - 7);
      if (dateRangeFilter === "month") start.setDate(1);
      list = list.filter((e) => {
        const d = new Date(e.date);
        return Number.isFinite(d.getTime()) && d >= start && d <= now;
      });
    }
    return list;
  }, [expenses, search, projectFilter, categoryFilter, statusFilter, dateRangeFilter]);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = React.useMemo(() => {
    const start = (curPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [curPage, filtered]);

  const setPage = (nextPage: number) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("page", String(nextPage));
    router.push(`/financial/expenses?${sp.toString()}`, { scroll: false });
  };

  const refresh = React.useCallback(async () => {
    const list = await getExpenses();
    setExpenses(list);
  }, []);

  const openReceiptPreview = React.useCallback(
    async (row: Expense) => {
      const raw = getReceiptItems(row);
      const items = await resolveReceiptPreviewUrls(raw, supabase);
      setReceiptZoom(1);
      setReceiptPreview({ items, index: 0, expenseId: row.id });
    },
    [supabase]
  );

  const handleExpenseSave = React.useCallback(
    (patch: ExpenseReviewSavePatch) => {
      const prevList = expensesRef.current;
      const target = prevList.find((e) => e.id === patch.expenseId);
      if (!target) return;
      const merged = mergeExpenseReviewPatch(target, patch);
      flushSync(() => {
        setExpenses((prev) => prev.map((e) => (e.id === patch.expenseId ? merged : e)));
        setEditModalOpen(false);
        setEditExpense(null);
      });
      void (async () => {
        try {
          const next = await updateExpenseForReview(patch.expenseId, {
            vendorName: patch.vendorName,
            amount: patch.amount,
            projectId: patch.projectId,
            workerId: patch.workerId,
            category: patch.category,
            notes: patch.notes,
            status: patch.status,
          });
          if (!next) {
            flushSync(() => setExpenses(prevList));
            toast({
              title: "Update failed",
              description: "Expense could not be saved.",
              variant: "error",
            });
            return;
          }
          flushSync(() =>
            setExpenses((prev) => prev.map((e) => (e.id === patch.expenseId ? next : e)))
          );
          toast({ title: "Expense updated", variant: "success" });
        } catch (e) {
          flushSync(() => setExpenses(prevList));
          toast({
            title: "Update failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "error",
          });
        }
      })();
    },
    [toast]
  );

  useOnAppSync(
    React.useCallback(() => {
      void (async () => {
        const [expList, cats, workerList] = await Promise.all([
          getExpenses(),
          getExpenseCategories(),
          getWorkers(),
        ]);
        setExpenses(expList);
        setCategoriesList(cats);
        setWorkers(workerList as WorkerRow[]);
      })();
    }, []),
    []
  );

  const handleNew = async () => {
    router.push("/financial/expenses/new");
  };

  const handleDelete = async (expense: Expense) => {
    if (typeof window === "undefined" || !window.confirm("Delete this expense?")) return;
    const prev = expensesRef.current;
    setDeletingExpenseId(expense.id);
    setExpenses((list) => list.filter((e) => e.id !== expense.id));
    try {
      expense.attachments?.forEach((a) => {
        if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
      await deleteExpense(expense.id);
    } catch {
      setExpenses(prev);
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const handleVendorInlineSave = async (expenseId: string) => {
    const nextVendor = vendorDraft.trim();
    if (!nextVendor) return;
    const prev = expensesRef.current;
    setExpenses((list) =>
      list.map((e) => (e.id === expenseId ? { ...e, vendorName: nextVendor } : e))
    );
    setEditingVendorId(null);
    try {
      const next = await updateExpenseForReview(expenseId, { vendorName: nextVendor });
      if (!next) throw new Error("Failed");
      setExpenses((list) => list.map((e) => (e.id === expenseId ? next : e)));
    } catch {
      setExpenses(prev);
      toast({ title: "Vendor update failed", variant: "error" });
    }
  };

  const toggleStatus = async (expense: Expense) => {
    const current = expense.status ?? "pending";
    const next = current === "needs_review" ? "approved" : "needs_review";
    const prev = expensesRef.current;
    setExpenses((list) => list.map((e) => (e.id === expense.id ? { ...e, status: next } : e)));
    try {
      const saved = await updateExpenseForReview(expense.id, { status: next });
      if (!saved) throw new Error("Failed");
      const persisted = (saved.status ?? "pending") === next;
      if (persisted) {
        setExpenses((list) => list.map((e) => (e.id === expense.id ? saved : e)));
      } else {
        // Some schemas may not support status persistence; keep optimistic UI state.
        toast({
          title: "Status changed locally",
          description: "This environment does not persist status updates yet.",
          variant: "default",
        });
      }
    } catch {
      setExpenses(prev);
      toast({ title: "Status update failed", variant: "error" });
    }
  };

  return (
    <div className="page-container page-stack px-8 py-8">
      <PageHeader
        title="Expenses"
        description="Track and manage company expenses"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="touch"
              className="min-h-[44px]"
              onClick={() => setQuickExpenseOpen(true)}
            >
              Quick Expense
            </Button>
            <Button onClick={handleNew} size="touch" className="min-h-[44px]">
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </div>
        }
      />

      <section className="border border-border/60">
        <div className="grid sm:grid-cols-3">
          <div className="px-5 py-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">This Month</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              ${summary.monthTotal.toLocaleString()}
            </div>
          </div>
          <div className="px-5 py-5 sm:border-l sm:border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Total Expenses
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              ${summary.allTotal.toLocaleString()}
            </div>
          </div>
          <div className="px-5 py-5 sm:border-l sm:border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Needs Review
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {summary.needsReview.toLocaleString()}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <Input
          placeholder="Search expenses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <select
              className="flex min-h-[44px] h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm md:min-h-0"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="">All projects</option>
              {safeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
            {projectsError ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">{projectsError}</p>
            ) : null}
          </div>
          <select
            className="flex min-h-[44px] h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm md:min-h-0"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categoriesList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="flex min-h-[44px] h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm md:min-h-0"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All status</option>
            <option value="needs_review">Needs Review</option>
            <option value="approved">Completed / Verified</option>
            <option value="reimbursed">Completed / Verified</option>
            <option value="paid">Completed / Verified</option>
          </select>
          <select
            className="flex min-h-[44px] h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm md:min-h-0"
            value={dateRangeFilter}
            onChange={(e) =>
              setDateRangeFilter((e.target.value as "all" | "week" | "month") ?? "all")
            }
          >
            <option value="all">All dates</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>
      </section>

      <section>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center text-muted-foreground">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {search.trim() ||
              projectFilter ||
              categoryFilter ||
              statusFilter ||
              dateRangeFilter !== "all"
                ? "No expenses match filters"
                : "No expenses yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search.trim() ||
              projectFilter ||
              categoryFilter ||
              statusFilter ||
              dateRangeFilter !== "all"
                ? "Try adjusting the filters."
                : "Create your first expense to start tracking project costs."}
            </p>
            {search.trim() ||
            projectFilter ||
            categoryFilter ||
            statusFilter ||
            dateRangeFilter !== "all" ? null : (
              <div className="mt-5 flex items-center gap-2">
                <Button size="sm" className="h-8" onClick={handleNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Expense
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setQuickExpenseOpen(true)}
                >
                  Quick Upload
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: card layout */}
            <div className="flex flex-col gap-3 md:hidden">
              {pageRows.map((row) => {
                const rowTotal = getExpenseTotal(row);
                const workerName = row.workerId ? (workerNameById.get(row.workerId) ?? "—") : "—";
                const projLabel = projectLabel(row, projectNameById);
                const status = row.status ?? "pending";
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setEditExpense(row);
                      setEditModalOpen(true);
                    }}
                    className="flex min-h-[44px] w-full touch-manipulation flex-col items-stretch gap-1 rounded-sm border border-border/60 bg-background p-4 text-left transition-colors active:bg-muted/30"
                  >
                    <span className="font-medium text-foreground truncate">
                      {normalizedVendorLabel(row.vendorName)}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">
                      {row.date} · {workerName}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {extractExpenseTags(row).join(" · ") || (row.notes ?? "—")}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">{projLabel}</span>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-red-600 font-medium tabular-nums dark:text-red-400">
                        −$
                        {rowTotal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        className={`text-[11px] rounded-sm border px-1.5 py-0.5 ${
                          status === "needs_review"
                            ? "border-red-500/40 text-red-600 dark:text-red-400"
                            : "border-[#166534]/40 text-hh-profit-positive dark:text-hh-profit-positive"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleStatus(row);
                        }}
                      >
                        {status === "needs_review" ? "Needs Review" : "Completed"}
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto border-b border-border/60 md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/60 hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Date
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Worker
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Vendor
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Items / Description
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Project
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Receipt
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => {
                    const rowTotal = getExpenseTotal(row);
                    const workerName = row.workerId
                      ? (workerNameById.get(row.workerId) ?? "—")
                      : "—";
                    const projLabel = projectLabel(row, projectNameById);
                    const status = row.status ?? "pending";
                    return (
                      <TableRow
                        key={row.id}
                        className="border-b border-border/30 cursor-pointer hover:bg-muted/30"
                        onClick={() => {
                          setEditExpense(row);
                          setEditModalOpen(true);
                        }}
                      >
                        <TableCell className="tabular-nums text-foreground">{row.date}</TableCell>
                        <TableCell className="text-muted-foreground">{workerName}</TableCell>
                        <TableCell className="text-foreground">
                          {editingVendorId === row.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-8"
                                value={vendorDraft}
                                autoFocus
                                onChange={(e) => setVendorDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void handleVendorInlineSave(row.id);
                                  if (e.key === "Escape") setEditingVendorId(null);
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Confirm vendor"
                                title="Confirm vendor"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleVendorInlineSave(row.id)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Cancel vendor edit"
                                title="Cancel vendor edit"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setEditingVendorId(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              className="hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingVendorId(row.id);
                                setVendorDraft(normalizedVendorLabel(row.vendorName));
                              }}
                            >
                              {normalizedVendorLabel(row.vendorName)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          <div className="flex flex-wrap gap-1">
                            {extractExpenseTags(row).length > 0 ? (
                              extractExpenseTags(row).map((t) => (
                                <span
                                  key={`${row.id}-${t}`}
                                  className="rounded-sm border border-border/60 px-1.5 py-0.5 text-xs"
                                >
                                  {t}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{projLabel}</TableCell>
                        <TableCell
                          className="text-right tabular-nums font-medium text-red-600/90 dark:text-red-400/90"
                          title={`Total: $${rowTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`}
                        >
                          −$
                          {rowTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className={`rounded-sm border px-2 py-0.5 text-xs ${
                              status === "needs_review"
                                ? "border-red-500/40 text-red-600 dark:text-red-400"
                                : "border-[#166534]/40 text-hh-profit-positive dark:text-hh-profit-positive"
                            }`}
                            onClick={() => void toggleStatus(row)}
                          >
                            {status === "needs_review" ? "Needs Review" : "Completed"}
                          </button>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {getReceiptItems(row).length > 0 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => void openReceiptPreview(row)}
                              aria-label="View receipt"
                              title="View receipt"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit"
                              aria-label="Edit"
                              onClick={() => {
                                setEditExpense(row);
                                setEditModalOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {getReceiptItems(row).length > 0 ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="View receipt"
                                aria-label="View receipt"
                                onClick={() => void openReceiptPreview(row)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(row)}
                              disabled={deletingExpenseId === row.id}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {total > 0 ? (
        <Pagination page={curPage} pageSize={pageSize} total={total} onPageChange={setPage} />
      ) : null}

      <Dialog
        open={!!receiptPreview}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptPreview(null);
            setReceiptZoom(1);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl border-border/60 p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-2">
            <DialogTitle className="text-sm font-medium truncate">
              {receiptPreview
                ? `${receiptPreview.items[receiptPreview.index]?.fileName ?? "Receipt"} (${receiptPreview.index + 1}/${receiptPreview.items.length})`
                : "Receipt"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {receiptPreview
              ? (() => {
                  const u = receiptPreview.items[receiptPreview.index]?.url ?? "";
                  if (u.toLowerCase().endsWith(".pdf")) {
                    return (
                      <iframe
                        src={u}
                        title="Receipt"
                        className="w-full h-[70vh] min-h-[400px] rounded border border-border/60"
                      />
                    );
                  }
                  if (/\.(jpe?g|png|gif|webp)$/i.test(u)) {
                    /* eslint-disable-next-line @next/next/no-img-element -- receipt URL is dynamic (storage/external) */
                    return (
                      <img
                        src={u}
                        alt="Receipt"
                        loading="lazy"
                        className="max-w-full max-h-[70vh] object-contain rounded border border-border/60"
                        style={{
                          transform: `scale(${receiptZoom})`,
                          transformOrigin: "top center",
                        }}
                      />
                    );
                  }
                  return (
                    <p className="text-sm text-muted-foreground">
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Open receipt
                      </a>
                    </p>
                  );
                })()
              : null}
          </div>
          {receiptPreview ? (
            <div className="shrink-0 border-t border-border/60 px-4 py-2 flex items-center justify-end gap-2">
              {receiptPreview.items.length > 1 ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() =>
                      setReceiptPreview((p) =>
                        p
                          ? {
                              ...p,
                              index: (p.index - 1 + p.items.length) % p.items.length,
                            }
                          : p
                      )
                    }
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() =>
                      setReceiptPreview((p) =>
                        p
                          ? {
                              ...p,
                              index: (p.index + 1) % p.items.length,
                            }
                          : p
                      )
                    }
                  >
                    Next
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setReceiptZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setReceiptZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" asChild>
                <a
                  href={receiptPreview.items[receiptPreview.index]?.url ?? "#"}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              </Button>
              {receiptPreview.expenseId && supabase ? (
                <>
                  <input
                    type="file"
                    ref={receiptReplaceRef}
                    accept="image/*,.pdf"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !receiptPreview.expenseId) return;
                      setReceiptReplacing(true);
                      try {
                        const path = `receipts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                        const { error } = await supabase.storage
                          .from("receipts")
                          .upload(path, file, {
                            contentType: file.type || "application/octet-stream",
                            upsert: true,
                          });
                        if (error) throw error;
                        const { data } = supabase.storage.from("receipts").getPublicUrl(path);
                        await updateExpenseReceiptUrl(receiptPreview.expenseId, data.publicUrl);
                        setReceiptPreview((p) =>
                          p
                            ? {
                                ...p,
                                items: p.items.map((it, idx) =>
                                  idx === p.index ? { ...it, url: data.publicUrl } : it
                                ),
                              }
                            : null
                        );
                        refresh();
                      } finally {
                        setReceiptReplacing(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={receiptReplacing}
                    onClick={() => receiptReplaceRef.current?.click()}
                  >
                    {receiptReplacing ? "Replacing…" : "Replace Receipt"}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <QuickExpenseModal
        open={quickExpenseOpen}
        onOpenChange={setQuickExpenseOpen}
        onSuccess={refresh}
        projects={safeProjects}
        expenses={expenses}
      />
      <EditExpenseModal
        expense={editExpense}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        projects={safeProjects}
        workers={workers}
        categories={categoriesList}
        onSave={handleExpenseSave}
      />
    </div>
  );
}

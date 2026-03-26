"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
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
import { Plus, Trash2 } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuickExpenseModal } from "./quick-expense-modal";
import { EditExpenseModal, type ExpenseReviewSavePatch } from "./edit-expense-modal";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useToast } from "@/components/toast/toast-provider";

type ProjectRow = { id: string; name: string | null };
type WorkerRow = { id: string; name: string };

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
    url: string;
    fileName: string;
    expenseId?: string;
  } | null>(null);
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
    const projectsCount = safeProjects.length;
    return { monthTotal, allTotal, projectsCount };
  }, [expenses, safeProjects]);

  const filtered = React.useMemo(() => {
    let list = expenses;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.vendorName.toLowerCase().includes(q) ||
          e.referenceNo?.toLowerCase().includes(q) ||
          e.lines.some((l) => (l.memo ?? "").toLowerCase().includes(q))
      );
    }
    if (projectFilter)
      list = list.filter((e) => e.lines.some((l) => l.projectId === projectFilter));
    if (categoryFilter)
      list = list.filter((e) => e.lines.some((l) => l.category === categoryFilter));
    return list;
  }, [expenses, search, projectFilter, categoryFilter]);

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
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Projects</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {summary.projectsCount.toLocaleString()}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
      </section>

      <section>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center text-muted-foreground">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {search.trim() || projectFilter || categoryFilter
                ? "No expenses match filters"
                : "No expenses yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search.trim() || projectFilter || categoryFilter
                ? "Try adjusting the filters."
                : "Create your first expense to start tracking project costs."}
            </p>
            {search.trim() || projectFilter || categoryFilter ? null : (
              <div className="mt-5">
                <Button size="sm" className="h-8" onClick={handleNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Expense
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
                    <span className="font-medium text-foreground truncate">{row.vendorName}</span>
                    <span className="text-sm text-muted-foreground truncate">
                      {row.date} · {workerName}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">{projLabel}</span>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-red-600 font-medium tabular-nums dark:text-red-400">
                        −${rowTotal.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">{statusLabel(status)}</span>
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
                        <TableCell className="text-foreground">{row.vendorName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{projLabel}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-red-600/90 dark:text-red-400/90">
                          −${rowTotal.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {statusLabel(status)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {row.receiptUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() =>
                                setReceiptPreview({
                                  url: row.receiptUrl!,
                                  fileName: "Receipt",
                                  expenseId: row.id,
                                })
                              }
                            >
                              View
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
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/financial/expenses/${row.id}`}>View</Link>
                            </Button>
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

      <Dialog open={!!receiptPreview} onOpenChange={(open) => !open && setReceiptPreview(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl border-border/60 p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-2">
            <DialogTitle className="text-sm font-medium truncate">
              {receiptPreview?.fileName ?? "Receipt"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {receiptPreview
              ? (() => {
                  const u = receiptPreview.url;
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
                        className="max-w-full max-h-[70vh] object-contain rounded border border-border/60"
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
              <Button variant="outline" size="sm" className="h-8" asChild>
                <a href={receiptPreview.url} download target="_blank" rel="noopener noreferrer">
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
                        setReceiptPreview((p) => (p ? { ...p, url: data.publicUrl } : null));
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

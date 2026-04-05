"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Check, Loader2, Paperclip, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { uiActionLog, uiActionMark, uiNavLog, uiNavMark } from "@/lib/ui-action-perf";
import { Pagination } from "@/components/ui/pagination";
import { useSearchParams } from "next/navigation";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { QuickExpenseModal } from "./quick-expense-modal";
import { UploadReceiptsQueueModal } from "./upload-receipts-queue-modal";
import { EditExpenseModal, type ExpenseReviewSavePatch } from "./edit-expense-modal";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useToast } from "@/components/toast/toast-provider";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import {
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";

type ProjectRow = { id: string; name: string | null; status?: string | null };
type WorkerRow = { id: string; name: string };
type ReceiptItem = { url: string; fileName: string };

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
    date: p.date !== undefined ? p.date : e.date,
    vendorName: p.vendorName,
    notes: p.notes ?? e.notes,
    status: p.status,
    workerId: p.workerId,
    sourceType: p.sourceType !== undefined ? p.sourceType : e.sourceType,
    paymentAccountId: p.paymentAccountId,
    paymentAccountName: p.paymentAccountName,
    lines: nextLines,
    headerProjectId: p.projectId,
  };
}

function projectLabel(expense: Expense, projectNameById: Map<string, string>): string {
  const lineIds = expense.lines.map((l) => l.projectId ?? null);
  const headerRaw = expense.headerProjectId ?? null;
  const headerId =
    headerRaw != null && String(headerRaw).trim() !== "" ? String(headerRaw).trim() : null;

  const distinct = new Set<string>();
  for (const id of lineIds) {
    if (id != null && String(id).trim() !== "") distinct.add(String(id));
  }
  if (headerId) distinct.add(headerId);

  if (distinct.size === 0) {
    if (expense.lines.length === 0) return "—";
    return "Overhead";
  }
  if (distinct.size === 1) {
    const id = [...distinct][0]!;
    return projectNameById.get(id) ?? id;
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

function receiptItemLooksPdf(item: ReceiptItem | undefined): boolean {
  if (!item?.url && !item?.fileName) return false;
  const name = (item.fileName ?? "").toLowerCase();
  const u = (item.url ?? "").toLowerCase();
  return name.endsWith(".pdf") || u.endsWith(".pdf") || u.includes("application/pdf");
}

async function resolveReceiptPreviewUrls(
  items: ReceiptItem[],
  supabase: ReturnType<typeof createBrowserClient> | null
): Promise<ReceiptItem[]> {
  if (!supabase) return items;
  const next: ReceiptItem[] = [];
  for (const item of items) {
    const raw = (item.url ?? "").trim();
    if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("blob:")) {
      next.push(item);
      continue;
    }
    const path = raw.replace(/^\/+/, "");
    let urlOut: string | null = null;
    const tryBucket = async (bucket: string) => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
      return null;
    };
    urlOut = await tryBucket("expense-attachments");
    if (!urlOut) urlOut = await tryBucket("receipts");
    if (!urlOut && path) {
      const { data: pub } = supabase.storage.from("receipts").getPublicUrl(path);
      if (pub?.publicUrl) urlOut = pub.publicUrl;
    }
    next.push(urlOut ? { ...item, url: urlOut } : item);
  }
  return next;
}

function ExpenseAttachmentTrigger({ row, onPreview }: { row: Expense; onPreview: () => void }) {
  const items = React.useMemo(() => getReceiptItems(row), [row]);

  if (items.length === 0) {
    return <span className="text-text-secondary/50">—</span>;
  }

  const label = items.length > 1 ? `${items.length} files` : "Attachment";

  return (
    <button
      type="button"
      className="inline-flex max-w-full cursor-pointer items-center gap-1.5 text-[11px] text-text-secondary hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        onPreview();
      }}
      aria-label={`View ${items.length > 1 ? `${items.length} attachments` : "attachment"}`}
      title="Preview attachment"
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-text-secondary/75" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

/** Dot + label colors for minimal status row (no pill background). */
function expenseStatusDotTextClass(status: string | undefined): { dot: string; text: string } {
  const v = (status ?? "pending").toLowerCase();
  if (v === "needs_review") {
    return { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-500/90" };
  }
  if (v === "pending") {
    return { dot: "bg-status-pending", text: "text-text-secondary dark:text-text-secondary" };
  }
  if (
    v === "reviewed" ||
    v === "approved" ||
    v === "paid" ||
    v === "reimbursed" ||
    v === "reimbursable"
  ) {
    return { dot: "bg-green-500", text: "text-green-600 dark:text-green-500" };
  }
  return { dot: "bg-status-pending", text: "text-text-secondary dark:text-text-secondary" };
}

function normalizedVendorLabel(vendor: string): string {
  const v = (vendor ?? "").trim();
  if (!v || /^unknown$/i.test(v) || /^smokevendor[-_]/i.test(v)) return "Needs Review";
  return v;
}

function sourceTypeLabel(t: Expense["sourceType"]): string {
  if (t === "reimbursement") return "Reimbursement";
  if (t === "receipt_upload") return "Receipt";
  return "Company";
}

function primaryCategory(e: Expense): string {
  const c = e.lines[0]?.category;
  return c && c.trim() !== "" ? c : "—";
}

function primaryProjectId(e: Expense): string {
  const fromLine = e.lines[0]?.projectId;
  const h = e.headerProjectId;
  const id = (fromLine != null && String(fromLine).trim() !== "" ? fromLine : h) ?? "";
  return id ? String(id) : "";
}

function expenseHasReceipt(e: Expense): boolean {
  return getReceiptItems(e).length > 0;
}

const INLINE_EDIT_FIELDS = ["vendor", "amount", "date", "project", "category", "source"] as const;
type InlineEditField = (typeof INLINE_EDIT_FIELDS)[number];

function isUnreviewedStatus(s: string | undefined): boolean {
  const v = (s ?? "pending").toLowerCase();
  return v === "pending" || v === "needs_review";
}

function statusDisplayLabel(s: string | undefined): string {
  const v = (s ?? "pending").toLowerCase();
  if (v === "needs_review") return "Needs review";
  if (v === "pending") return "Pending";
  if (v === "reviewed") return "Reviewed";
  if (v === "reimbursable") return "Reimbursable";
  if (v === "paid") return "Paid";
  if (v === "approved" || v === "reimbursed") return "Closed";
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
    <React.Suspense fallback={<div className="expenses-ui min-h-[50vh] w-full bg-[#f5f5f7]" />}>
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
  const [sourceTypeFilter, setSourceTypeFilter] = React.useState("");
  const [editingVendorId, setEditingVendorId] = React.useState<string | null>(null);
  const [vendorDraft, setVendorDraft] = React.useState("");
  const [editingAmountId, setEditingAmountId] = React.useState<string | null>(null);
  const [amountDraft, setAmountDraft] = React.useState("");
  const [editingDateId, setEditingDateId] = React.useState<string | null>(null);
  const [dateDraft, setDateDraft] = React.useState("");
  const [activeExpenseId, setActiveExpenseId] = React.useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = React.useState<string | null>(null);
  const [projectDraft, setProjectDraft] = React.useState("");
  const [editingCategoryId, setEditingCategoryId] = React.useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = React.useState("");
  const [editingSourceId, setEditingSourceId] = React.useState<string | null>(null);
  const [sourceTypeDraft, setSourceTypeDraft] =
    React.useState<NonNullable<Expense["sourceType"]>>("company");
  const rowElsRef = React.useRef<Record<string, HTMLLIElement | null>>({});
  const listView: "all" | "unreviewed" =
    searchParams.get("view") === "unreviewed" ? "unreviewed" : "all";
  const setListView = React.useCallback(
    (next: "all" | "unreviewed") => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === "unreviewed") sp.set("view", "unreviewed");
      else sp.delete("view");
      sp.set("page", "1");
      router.push(`/financial/expenses?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );
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
  const [quickExpenseOpen, setQuickExpenseOpen] = React.useState(false);
  const [uploadReceiptsOpen, setUploadReceiptsOpen] = React.useState(false);
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
    const unreviewed = expenses.filter((e) => isUnreviewedStatus(e.status)).length;
    const reimbursementCount = expenses.filter((e) => e.sourceType === "reimbursement").length;
    const catTotals = new Map<string, number>();
    for (const e of expenses) {
      for (const l of e.lines) {
        const c = (l.category ?? "Other").trim() || "Other";
        catTotals.set(c, (catTotals.get(c) ?? 0) + l.amount);
      }
    }
    let topCategory = "—";
    let topCatAmount = 0;
    for (const [c, a] of catTotals) {
      if (a > topCatAmount) {
        topCatAmount = a;
        topCategory = c;
      }
    }
    return { monthTotal, allTotal, unreviewed, reimbursementCount, topCategory };
  }, [expenses]);

  const filtered = React.useMemo(() => {
    let list = expenses;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => {
        const vendorQ = normalizedVendorLabel(e.vendorName).toLowerCase().includes(q);
        const refQ = e.referenceNo?.toLowerCase().includes(q);
        const memoQ = e.lines.some((l) => (l.memo ?? "").toLowerCase().includes(q));
        const tagQ = extractExpenseTags(e).some((t) => t.toLowerCase().includes(q));
        const amtQ = getExpenseTotal(e).toFixed(2).includes(q.replace(/[$,]/g, ""));
        const notesQ = (e.notes ?? "").toLowerCase().includes(q);
        const pid = e.headerProjectId ?? e.lines[0]?.projectId ?? "";
        const projQ = pid ? (projectNameById.get(pid) ?? "").toLowerCase().includes(q) : false;
        const workerQ = e.workerId
          ? (workerNameById.get(e.workerId) ?? "").toLowerCase().includes(q)
          : false;
        const catQ = e.lines.some((l) => (l.category ?? "").toLowerCase().includes(q));
        return vendorQ || refQ || memoQ || tagQ || amtQ || notesQ || projQ || workerQ || catQ;
      });
    }
    if (projectFilter)
      list = list.filter(
        (e) =>
          e.lines.some((l) => l.projectId === projectFilter) ||
          (e.headerProjectId != null && e.headerProjectId === projectFilter)
      );
    if (categoryFilter)
      list = list.filter((e) => e.lines.some((l) => l.category === categoryFilter));
    if (statusFilter && listView !== "unreviewed") {
      list = list.filter((e) => (e.status ?? "pending") === statusFilter);
    }
    if (listView === "unreviewed") {
      list = list.filter((e) => isUnreviewedStatus(e.status));
    }
    if (sourceTypeFilter)
      list = list.filter((e) => (e.sourceType ?? "company") === sourceTypeFilter);
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
    if (listView === "unreviewed") {
      list = [...list].sort((a, b) => {
        const ha = expenseHasReceipt(a) ? 1 : 0;
        const hb = expenseHasReceipt(b) ? 1 : 0;
        if (ha !== hb) return hb - ha;
        const ta = getExpenseTotal(a);
        const tb = getExpenseTotal(b);
        if (ta !== tb) return tb - ta;
        const da = (a.date ?? "").slice(0, 10);
        const db = (b.date ?? "").slice(0, 10);
        return db.localeCompare(da);
      });
    }
    return list;
  }, [
    expenses,
    search,
    projectFilter,
    categoryFilter,
    statusFilter,
    dateRangeFilter,
    sourceTypeFilter,
    projectNameById,
    workerNameById,
    listView,
  ]);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = React.useMemo(() => {
    const start = (curPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [curPage, filtered]);

  const pageRowsRef = React.useRef(pageRows);
  pageRowsRef.current = pageRows;

  const pageRowIdsKey = React.useMemo(() => pageRows.map((r) => r.id).join("|"), [pageRows]);

  const clearInlineEdits = React.useCallback(() => {
    setEditingVendorId(null);
    setEditingAmountId(null);
    setEditingDateId(null);
    setEditingProjectId(null);
    setEditingCategoryId(null);
    setEditingSourceId(null);
  }, []);

  React.useEffect(() => {
    if (listView !== "unreviewed") {
      setActiveExpenseId(null);
      clearInlineEdits();
      return;
    }
    setActiveExpenseId((cur) => {
      const ids = pageRowIdsKey ? pageRowIdsKey.split("|").filter(Boolean) : [];
      if (cur && ids.includes(cur)) return cur;
      return ids[0] ?? null;
    });
  }, [listView, pageRowIdsKey, clearInlineEdits]);

  React.useEffect(() => {
    if (!activeExpenseId || listView !== "unreviewed") return;
    const el = rowElsRef.current[activeExpenseId];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeExpenseId, listView, pageRowIdsKey]);

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
      setReceiptPreview({ items, index: 0, expenseId: row.id });
    },
    [supabase]
  );

  const receiptPreviewRef = React.useRef(receiptPreview);
  receiptPreviewRef.current = receiptPreview;
  const {
    openPreview,
    closePreview,
    patchPreview,
    isOpen: attachmentPreviewOpen,
  } = useAttachmentPreview();

  React.useEffect(() => {
    if (!receiptPreview) {
      closePreview();
      return;
    }
    openPreview({
      files: receiptPreview.items.map((it) => ({
        url: it.url ?? "",
        fileName: it.fileName ?? "Receipt",
        fileType: (receiptItemLooksPdf(it) ? "pdf" : "image") as "pdf" | "image",
      })),
      initialIndex: receiptPreview.index,
      onIndexChange: (i: number) => setReceiptPreview((p) => (p ? { ...p, index: i } : p)),
      showReplace: Boolean(receiptPreview.expenseId && supabase),
      replaceInputRef: receiptReplaceRef,
      replaceBusy: receiptReplacing,
      onReplaceClick: () => receiptReplaceRef.current?.click(),
      onReplaceInputChange: async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const rp = receiptPreviewRef.current;
        if (!file || !rp?.expenseId || !supabase) return;
        setReceiptReplacing(true);
        try {
          const path = `receipts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
          const { error } = await supabase.storage.from("receipts").upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: true,
          });
          if (error) throw error;
          const { data } = supabase.storage.from("receipts").getPublicUrl(path);
          await updateExpenseReceiptUrl(rp.expenseId, data.publicUrl);
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
          void refresh();
        } finally {
          setReceiptReplacing(false);
          e.target.value = "";
        }
      },
      onClosed: () => setReceiptPreview(null),
    });
  }, [receiptPreview, supabase, closePreview, openPreview, refresh]);

  React.useEffect(() => {
    patchPreview({ replaceBusy: receiptReplacing });
  }, [receiptReplacing, patchPreview]);

  const handleExpenseSave = React.useCallback(
    (patch: ExpenseReviewSavePatch) => {
      const prevList = expensesRef.current;
      const target = prevList.find((e) => e.id === patch.expenseId);
      if (!target) return;
      const merged = mergeExpenseReviewPatch(target, patch);
      const t0 = uiActionMark();
      flushSync(() => {
        setExpenses((prev) => prev.map((e) => (e.id === patch.expenseId ? merged : e)));
        setEditModalOpen(false);
        setEditExpense(null);
      });
      uiActionLog("expense-edit-save-ui", t0, 100);
      void (async () => {
        try {
          const next = await updateExpenseForReview(patch.expenseId, {
            date: patch.date,
            vendorName: patch.vendorName,
            amount: patch.amount,
            projectId: patch.projectId,
            workerId: patch.workerId,
            category: patch.category,
            notes: patch.notes,
            status: patch.status,
            sourceType: patch.sourceType,
            paymentAccountId: patch.paymentAccountId,
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
          const pa = next.paymentAccountId?.trim();
          if (pa && (next.vendorName ?? "").trim()) {
            rememberExpenseVendorPaymentAccount(next.vendorName!.trim(), pa);
            persistLastExpensePaymentAccountId(pa);
          }
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

  const handleNew = () => {
    const t0 = uiNavMark();
    router.push("/financial/expenses/new");
    requestAnimationFrame(() => uiNavLog("expenses->new-expense", t0, 200));
  };

  const handleDelete = React.useCallback(
    (expense: Expense) => {
      if (typeof window === "undefined" || !window.confirm("Delete this expense?")) return;
      const prev = expensesRef.current;
      const t0 = uiActionMark();
      setDeletingExpenseId(expense.id);
      setExpenses((list) => list.filter((e) => e.id !== expense.id));
      uiActionLog("expense-delete-ui", t0, 100);
      expense.attachments?.forEach((a) => {
        if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
      void (async () => {
        try {
          await deleteExpense(expense.id);
        } catch {
          setExpenses(prev);
          toast({ title: "Delete failed", variant: "error" });
        } finally {
          setDeletingExpenseId(null);
        }
      })();
    },
    [toast]
  );

  const persistInlineField = React.useCallback(
    (expenseId: string, field: InlineEditField): boolean => {
      const t0 = uiActionMark();
      switch (field) {
        case "vendor": {
          const nextVendor = vendorDraft.trim() || "Unknown";
          const prev = expensesRef.current;
          setExpenses((list) =>
            list.map((e) => (e.id === expenseId ? { ...e, vendorName: nextVendor } : e))
          );
          uiActionLog("expense-inline-save-ui", t0, 100);
          void (async () => {
            try {
              const next = await updateExpenseForReview(expenseId, { vendorName: nextVendor });
              if (!next) throw new Error("Failed");
              setExpenses((list) => list.map((e) => (e.id === expenseId ? next : e)));
            } catch {
              setExpenses(prev);
              toast({ title: "Vendor update failed", variant: "error" });
            }
          })();
          return true;
        }
        case "amount": {
          const num = parseFloat(amountDraft.replace(/,/g, ""));
          if (Number.isNaN(num) || num < 0) {
            toast({ title: "Invalid amount", variant: "error" });
            return false;
          }
          const prev = expensesRef.current;
          setExpenses((list) =>
            list.map((e) => {
              if (e.id !== expenseId) return e;
              if (e.lines.length === 0) {
                return {
                  ...e,
                  lines: [
                    { id: `tmp-${expenseId}`, projectId: null, category: "Other", amount: num },
                  ],
                };
              }
              return {
                ...e,
                lines: e.lines.map((line, i) => (i === 0 ? { ...line, amount: num } : line)),
              };
            })
          );
          uiActionLog("expense-inline-save-ui", t0, 100);
          void (async () => {
            try {
              const next = await updateExpenseForReview(expenseId, { amount: num });
              if (!next) throw new Error("Failed");
              setExpenses((list) => list.map((e) => (e.id === expenseId ? next : e)));
            } catch {
              setExpenses(prev);
              toast({ title: "Amount update failed", variant: "error" });
            }
          })();
          return true;
        }
        case "date": {
          const d = dateDraft.trim().slice(0, 10);
          if (!d) return false;
          const prev = expensesRef.current;
          setExpenses((list) => list.map((e) => (e.id === expenseId ? { ...e, date: d } : e)));
          uiActionLog("expense-inline-save-ui", t0, 100);
          void (async () => {
            try {
              const next = await updateExpenseForReview(expenseId, { date: d });
              if (!next) throw new Error("Failed");
              setExpenses((list) => list.map((e) => (e.id === expenseId ? next : e)));
            } catch {
              setExpenses(prev);
              toast({ title: "Date update failed", variant: "error" });
            }
          })();
          return true;
        }
        case "project": {
          const raw = projectDraft.trim();
          const pid = raw === "" ? null : raw;
          const prev = expensesRef.current;
          setExpenses((list) =>
            list.map((e) => {
              if (e.id !== expenseId) return e;
              if (e.lines.length === 0) {
                return {
                  ...e,
                  headerProjectId: pid,
                  lines: [{ id: `tmp-${expenseId}`, projectId: pid, category: "Other", amount: 0 }],
                };
              }
              return {
                ...e,
                headerProjectId: pid,
                lines: e.lines.map((line, i) => (i === 0 ? { ...line, projectId: pid } : line)),
              };
            })
          );
          uiActionLog("expense-inline-save-ui", t0, 100);
          void (async () => {
            try {
              const next = await updateExpenseForReview(expenseId, { projectId: pid });
              if (!next) throw new Error("Failed");
              setExpenses((list) => list.map((e) => (e.id === expenseId ? next : e)));
            } catch {
              setExpenses(prev);
              toast({ title: "Project update failed", variant: "error" });
            }
          })();
          return true;
        }
        case "category": {
          const cat = categoryDraft.trim() || "Other";
          const prev = expensesRef.current;
          setExpenses((list) =>
            list.map((e) => {
              if (e.id !== expenseId) return e;
              if (e.lines.length === 0) {
                return {
                  ...e,
                  lines: [{ id: `tmp-${expenseId}`, projectId: null, category: cat, amount: 0 }],
                };
              }
              return {
                ...e,
                lines: e.lines.map((line, i) => (i === 0 ? { ...line, category: cat } : line)),
              };
            })
          );
          uiActionLog("expense-inline-save-ui", t0, 100);
          void (async () => {
            try {
              const next = await updateExpenseForReview(expenseId, { category: cat });
              if (!next) throw new Error("Failed");
              setExpenses((list) => list.map((e) => (e.id === expenseId ? next : e)));
            } catch {
              setExpenses(prev);
              toast({ title: "Category update failed", variant: "error" });
            }
          })();
          return true;
        }
        case "source": {
          const prev = expensesRef.current;
          setExpenses((list) =>
            list.map((e) => (e.id === expenseId ? { ...e, sourceType: sourceTypeDraft } : e))
          );
          uiActionLog("expense-inline-save-ui", t0, 100);
          void (async () => {
            try {
              const next = await updateExpenseForReview(expenseId, { sourceType: sourceTypeDraft });
              if (!next) throw new Error("Failed");
              setExpenses((list) => list.map((e) => (e.id === expenseId ? next : e)));
            } catch {
              setExpenses(prev);
              toast({ title: "Source update failed", variant: "error" });
            }
          })();
          return true;
        }
        default:
          return false;
      }
    },
    [vendorDraft, amountDraft, dateDraft, projectDraft, categoryDraft, sourceTypeDraft, toast]
  );

  const handleVendorInlineSave = (expenseId: string) => {
    persistInlineField(expenseId, "vendor");
    clearInlineEdits();
  };

  const handleAmountInlineSave = (expenseId: string) => {
    if (!persistInlineField(expenseId, "amount")) return;
    clearInlineEdits();
  };

  const handleDateInlineSave = (expenseId: string) => {
    if (!persistInlineField(expenseId, "date")) return;
    clearInlineEdits();
  };

  const handleProjectInlineSave = (expenseId: string) => {
    persistInlineField(expenseId, "project");
    clearInlineEdits();
  };

  const handleCategoryInlineSave = (expenseId: string) => {
    persistInlineField(expenseId, "category");
    clearInlineEdits();
  };

  const handleSourceInlineSave = (expenseId: string) => {
    persistInlineField(expenseId, "source");
    clearInlineEdits();
  };

  const openInlineField = React.useCallback(
    (expenseId: string, field: InlineEditField) => {
      const row = expensesRef.current.find((e) => e.id === expenseId);
      if (!row) return;
      clearInlineEdits();
      switch (field) {
        case "vendor":
          setEditingVendorId(expenseId);
          setVendorDraft((row.vendorName ?? "").trim());
          break;
        case "amount":
          setEditingAmountId(expenseId);
          setAmountDraft(
            getExpenseTotal(row).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          );
          break;
        case "date":
          setEditingDateId(expenseId);
          setDateDraft((row.date ?? "").slice(0, 10));
          break;
        case "project":
          setEditingProjectId(expenseId);
          setProjectDraft(primaryProjectId(row));
          break;
        case "category": {
          const c = primaryCategory(row);
          setEditingCategoryId(expenseId);
          setCategoryDraft(c === "—" ? "Other" : c);
          break;
        }
        case "source":
          setEditingSourceId(expenseId);
          setSourceTypeDraft(row.sourceType ?? "company");
          break;
      }
    },
    [clearInlineEdits]
  );

  const focusUnreviewedFromReceiptBulk = searchParams.get("focus_unreviewed") === "1";
  const focusUnreviewedConsumedRef = React.useRef(false);

  React.useEffect(() => {
    if (!focusUnreviewedFromReceiptBulk) {
      focusUnreviewedConsumedRef.current = false;
      return;
    }
    if (listView !== "unreviewed" || pageRows.length === 0) return;
    const first = pageRows[0];
    if (!first || !expensesRef.current.some((e) => e.id === first.id)) return;
    if (focusUnreviewedConsumedRef.current) return;
    focusUnreviewedConsumedRef.current = true;

    const id = first.id;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setActiveExpenseId(id);
        openInlineField(id, "vendor");
        const sp = new URLSearchParams(searchParams.toString());
        sp.delete("focus_unreviewed");
        const qs = sp.toString();
        router.replace(qs ? `/financial/expenses?${qs}` : `/financial/expenses`, { scroll: false });
      });
    });
  }, [
    focusUnreviewedFromReceiptBulk,
    listView,
    pageRowIdsKey,
    pageRows,
    openInlineField,
    router,
    searchParams,
  ]);

  const advanceInlineField = React.useCallback(
    (expenseId: string, field: InlineEditField, dir: 1 | -1) => {
      const ix = INLINE_EDIT_FIELDS.indexOf(field);
      const nextIx = (ix + dir + INLINE_EDIT_FIELDS.length) % INLINE_EDIT_FIELDS.length;
      openInlineField(expenseId, INLINE_EDIT_FIELDS[nextIx]);
    },
    [openInlineField]
  );

  const markExpenseReviewed = React.useCallback(
    (expenseId: string) => {
      const prev = expensesRef.current;
      const t0 = uiActionMark();
      setExpenses((list) =>
        list.map((e) => (e.id === expenseId ? { ...e, status: "reviewed" as const } : e))
      );
      uiActionLog("expense-mark-reviewed-ui", t0, 100);
      void (async () => {
        try {
          const saved = await updateExpenseForReview(expenseId, { status: "reviewed" });
          if (!saved) throw new Error("Failed");
          const persisted = (saved.status ?? "pending") === "reviewed";
          if (persisted) {
            setExpenses((list) => list.map((e) => (e.id === expenseId ? saved : e)));
            return;
          }
          setExpenses(prev);
          toast({
            title: "Could not mark reviewed",
            description: "Status may not be supported in this environment.",
            variant: "default",
          });
        } catch {
          setExpenses(prev);
          toast({ title: "Status update failed", variant: "error" });
        }
      })();
    },
    [toast]
  );

  const handleInlineEnter = React.useCallback(
    (row: Expense, field: InlineEditField, opts: { markReviewed: boolean }) => {
      const ok = persistInlineField(row.id, field);
      if (!ok) return;
      if (!opts.markReviewed) {
        clearInlineEdits();
        return;
      }
      clearInlineEdits();
      const rows = pageRowsRef.current;
      const idx = rows.findIndex((r) => r.id === row.id);
      const nextRow = rows[idx + 1];
      if (isUnreviewedStatus(row.status)) {
        markExpenseReviewed(row.id);
      }
      if (listView === "unreviewed") {
        if (nextRow) {
          setActiveExpenseId(nextRow.id);
          openInlineField(nextRow.id, "vendor");
        } else {
          setActiveExpenseId(null);
        }
      }
    },
    [persistInlineField, clearInlineEdits, markExpenseReviewed, listView, openInlineField]
  );

  const inlineEditing =
    Boolean(editingVendorId) ||
    Boolean(editingAmountId) ||
    Boolean(editingDateId) ||
    Boolean(editingProjectId) ||
    Boolean(editingCategoryId) ||
    Boolean(editingSourceId);

  const kbRef = React.useRef({
    listView,
    attachmentPreviewOpen,
    editModalOpen,
    quickExpenseOpen,
    uploadReceiptsOpen,
    pageRows,
    activeExpenseId,
    inlineEditing,
  });
  kbRef.current = {
    listView,
    attachmentPreviewOpen,
    editModalOpen,
    quickExpenseOpen,
    uploadReceiptsOpen,
    pageRows,
    activeExpenseId,
    inlineEditing,
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = kbRef.current;
      if (k.listView !== "unreviewed") return;
      if (
        k.attachmentPreviewOpen ||
        k.editModalOpen ||
        k.quickExpenseOpen ||
        k.uploadReceiptsOpen
      ) {
        return;
      }
      const t = e.target as HTMLElement | null;
      const inEditable = !!t?.closest("input, textarea, select");

      if (e.key === "Escape" && k.inlineEditing) {
        e.preventDefault();
        clearInlineEdits();
        return;
      }

      if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (inEditable) return;
        e.preventDefault();
        const row = k.pageRows.find((r) => r.id === k.activeExpenseId);
        if (row && typeof window !== "undefined" && window.confirm("Delete this expense?")) {
          void handleDelete(row);
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (inEditable) clearInlineEdits();
        const idx = k.pageRows.findIndex((r) => r.id === k.activeExpenseId);
        if (e.key === "ArrowDown") {
          const n =
            idx < 0 ? Math.min(0, k.pageRows.length - 1) : Math.min(idx + 1, k.pageRows.length - 1);
          const r = k.pageRows[n];
          if (r) setActiveExpenseId(r.id);
        } else {
          const n = idx < 0 ? 0 : Math.max(idx - 1, 0);
          const r = k.pageRows[n];
          if (r) setActiveExpenseId(r.id);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [clearInlineEdits, handleDelete]);

  const toggleStatus = (expense: Expense) => {
    const current = expense.status ?? "pending";
    const next = isUnreviewedStatus(current) ? "reviewed" : "needs_review";
    const prev = expensesRef.current;
    const t0 = uiActionMark();
    setExpenses((list) => list.map((e) => (e.id === expense.id ? { ...e, status: next } : e)));
    uiActionLog("expense-toggle-status-ui", t0, 100);
    void (async () => {
      try {
        const saved = await updateExpenseForReview(expense.id, { status: next });
        if (!saved) throw new Error("Failed");
        const persisted = (saved.status ?? "pending") === next;
        if (persisted) {
          setExpenses((list) => list.map((e) => (e.id === expense.id ? saved : e)));
        } else {
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
    })();
  };

  const onInlineKeyDown = React.useCallback(
    (row: Expense, field: InlineEditField) => (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearInlineEdits();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const ok = persistInlineField(row.id, field);
        if (ok) advanceInlineField(row.id, field, e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void handleInlineEnter(row, field, {
          markReviewed: listView === "unreviewed" && !e.shiftKey,
        });
      }
    },
    [clearInlineEdits, persistInlineField, advanceInlineField, handleInlineEnter, listView]
  );

  const hasNarrowingFilters =
    Boolean(search.trim()) ||
    Boolean(projectFilter) ||
    Boolean(categoryFilter) ||
    Boolean(listView === "all" && statusFilter) ||
    Boolean(sourceTypeFilter) ||
    dateRangeFilter !== "all";

  const showEmptyOnboardingCtas =
    listView === "all" && !hasNarrowingFilters && expenses.length === 0;

  return (
    <div className="expenses-ui w-full">
      <div className="expenses-ui-content mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <PageHeader
          className="[&_h1]:text-text-primary [&_p]:text-text-secondary"
          title="Expenses"
          description="Spend, receipts, reimbursements"
          actions={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="exp-btn-secondary h-8 rounded-sm"
                onClick={() => setUploadReceiptsOpen(true)}
              >
                <Upload className="mr-1 h-3.5 w-3.5" />
                Upload
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="exp-btn-secondary h-8 rounded-sm"
                aria-label="Quick expense"
                onClick={() => setQuickExpenseOpen(true)}
              >
                Quick
              </Button>
              <Button onClick={handleNew} size="sm" className="exp-btn-primary h-8 rounded-sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-gray-300/60 pb-3 text-xs text-text-secondary">
          <span>
            Month{" "}
            <span className="ml-1 font-medium tabular-nums text-text-primary">
              ${summary.monthTotal.toLocaleString()}
            </span>
          </span>
          <span>
            Total{" "}
            <span className="ml-1 font-medium tabular-nums text-text-primary">
              ${summary.allTotal.toLocaleString()}
            </span>
          </span>
          <span>
            Unreviewed{" "}
            <span className="ml-1 font-medium tabular-nums text-text-primary">
              {summary.unreviewed}
            </span>
          </span>
          <span>
            Reimb.{" "}
            <span className="ml-1 font-medium tabular-nums text-text-primary">
              {summary.reimbursementCount}
            </span>
          </span>
          <span className="min-w-0">
            Top cat.{" "}
            <span className="ml-1 font-medium text-text-primary" title={summary.topCategory}>
              {summary.topCategory}
            </span>
          </span>
        </div>

        <div className="flex w-full flex-col gap-1 border-b border-gray-300/60 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={listView === "all" ? "default" : "outline"}
              size="sm"
              className={
                listView === "all"
                  ? "exp-filter-toggle-active exp-btn-primary h-8 rounded-sm transition-colors duration-150"
                  : "exp-filter-toggle-inactive exp-btn-secondary h-8 rounded-sm transition-colors duration-150"
              }
              onClick={() => setListView("all")}
            >
              All
            </Button>
            <Button
              type="button"
              variant={listView === "unreviewed" ? "default" : "outline"}
              size="sm"
              className={
                listView === "unreviewed"
                  ? "exp-filter-toggle-active exp-btn-primary h-8 rounded-sm transition-colors duration-150"
                  : "exp-filter-toggle-inactive exp-btn-secondary h-8 rounded-sm transition-colors duration-150"
              }
              onClick={() => setListView("unreviewed")}
            >
              Unreviewed ({summary.unreviewed})
            </Button>
          </div>
          {listView === "unreviewed" ? (
            <p className="text-[11px] text-text-secondary">
              Enter: save, mark reviewed, next row · Shift+Enter: save only · Tab: next field · ↑↓:
              row · D: delete · Esc: cancel
            </p>
          ) : null}
        </div>

        <div className="space-y-2 pt-0">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 rounded-sm border-gray-300/60 bg-white/70 text-sm text-text-primary shadow-none backdrop-blur-md transition-all duration-200 placeholder:text-text-secondary focus:bg-white focus-visible:border-gray-300/60 focus-visible:ring-2 focus-visible:ring-blue-400/30"
          />
          <div className="flex flex-wrap gap-2">
            <select
              className="h-8 min-w-[8rem] rounded-sm border border-gray-300/60 bg-white/80 px-2 text-xs text-text-primary shadow-none backdrop-blur-sm"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="">Project</option>
              {safeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
            {projectsError ? (
              <span className="self-center text-[11px] text-amber-600 dark:text-amber-400">
                {projectsError}
              </span>
            ) : null}
            <select
              className="h-8 min-w-[7rem] rounded-sm border border-gray-300/60 bg-white/80 px-2 text-xs text-text-primary shadow-none backdrop-blur-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Category</option>
              {categoriesList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="h-8 min-w-[6.5rem] rounded-sm border border-gray-300/60 bg-white/80 px-2 text-xs text-text-primary shadow-none backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-50"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={listView === "unreviewed"}
              title={
                listView === "unreviewed" ? "Status filter applies in All view only" : undefined
              }
            >
              <option value="">Status</option>
              <option value="pending">Pending</option>
              <option value="needs_review">Needs review</option>
              <option value="reviewed">Reviewed</option>
              <option value="reimbursable">Reimbursable</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="reimbursed">Reimbursed</option>
            </select>
            <select
              className="h-8 min-w-[6.5rem] rounded-sm border border-gray-300/60 bg-white/80 px-2 text-xs text-text-primary shadow-none backdrop-blur-sm"
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
            >
              <option value="">Source</option>
              <option value="company">Company</option>
              <option value="receipt_upload">Receipt</option>
              <option value="reimbursement">Reimbursement</option>
            </select>
            <select
              className="h-8 min-w-[6rem] rounded-sm border border-gray-300/60 bg-white/80 px-2 text-xs text-text-primary shadow-none backdrop-blur-sm"
              value={dateRangeFilter}
              onChange={(e) =>
                setDateRangeFilter((e.target.value as "all" | "week" | "month") ?? "all")
              }
            >
              <option value="all">All dates</option>
              <option value="week">7 days</option>
              <option value="month">Month</option>
            </select>
          </div>
        </div>

        <section className="mt-4">
          {total === 0 ? (
            <div className="border-b border-gray-300/60 py-12 text-center">
              <p className="text-sm font-medium text-text-primary">
                {listView === "unreviewed"
                  ? hasNarrowingFilters
                    ? "No unreviewed matches"
                    : expenses.length === 0
                      ? "No expenses yet"
                      : "You're all caught up"
                  : hasNarrowingFilters
                    ? "No matches"
                    : "No expenses yet"}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {listView === "unreviewed"
                  ? hasNarrowingFilters
                    ? "Try clearing filters or switch to All."
                    : expenses.length === 0
                      ? "Add an expense to get started."
                      : "No pending or needs-review items right now."
                  : hasNarrowingFilters
                    ? "Adjust filters or search."
                    : "Add an expense to get started."}
              </p>
              {showEmptyOnboardingCtas ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    className="exp-btn-primary h-8 rounded-sm"
                    onClick={() => setQuickExpenseOpen(true)}
                  >
                    Quick expense
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="exp-btn-secondary h-8 rounded-sm"
                    onClick={() => setUploadReceiptsOpen(true)}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="exp-btn-secondary h-8 rounded-sm"
                    onClick={handleNew}
                  >
                    New expense
                  </Button>
                </div>
              ) : listView === "unreviewed" && !hasNarrowingFilters && expenses.length > 0 ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="exp-btn-secondary h-8 rounded-sm"
                    onClick={() => setListView("all")}
                  >
                    View all expenses
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="exp-list-card overflow-hidden rounded-xl border border-gray-300/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-border/60 dark:bg-card/75 dark:backdrop-blur-md">
              <ul className="exp-divide divide-y divide-gray-300/50 dark:divide-border/60">
                {pageRows.map((row) => {
                  const rowTotal = getExpenseTotal(row);
                  const projLabel = projectLabel(row, projectNameById);
                  const status = row.status ?? "pending";
                  const statusStyle = expenseStatusDotTextClass(status);
                  const catLabel = primaryCategory(row);
                  return (
                    <li
                      key={row.id}
                      ref={(el) => {
                        rowElsRef.current[row.id] = el;
                      }}
                      className={`group exp-row relative flex flex-col gap-2 bg-transparent px-4 py-3 pr-12 transition-all duration-200 ease-out hover:bg-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:-translate-y-px active:scale-[0.99] dark:hover:bg-white/5 dark:hover:shadow-none dark:hover:translate-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pr-14 ${
                        listView === "unreviewed" && activeExpenseId === row.id
                          ? "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-gray-300/70 dark:bg-white/10 dark:ring-border/60"
                          : ""
                      }`}
                      onClick={() => {
                        if (listView === "unreviewed") setActiveExpenseId(row.id);
                      }}
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="min-w-0">
                          {editingVendorId === row.id ? (
                            <div
                              className="flex max-w-md items-center gap-1"
                              data-inline-field
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                className="h-7 rounded-sm border-gray-300/60 text-sm text-text-primary"
                                value={vendorDraft}
                                autoFocus
                                onChange={(e) => setVendorDraft(e.target.value)}
                                onKeyDown={onInlineKeyDown(row, "vendor")}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="btn-outline-ghost exp-icon-btn h-7 w-7 shrink-0"
                                aria-label="Save vendor"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleVendorInlineSave(row.id)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="btn-outline-ghost exp-icon-btn h-7 w-7 shrink-0"
                                aria-label="Cancel"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => clearInlineEdits()}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="truncate text-left text-sm font-semibold text-text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveExpenseId(row.id);
                                openInlineField(row.id, "vendor");
                              }}
                            >
                              {normalizedVendorLabel(row.vendorName)}
                            </button>
                          )}
                        </div>
                        <div
                          className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug text-text-secondary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {editingCategoryId === row.id ? (
                            <span data-inline-field className="inline-flex items-center gap-1">
                              <ExpenseCategorySelect
                                className="h-7 max-w-[9rem] rounded-sm border border-gray-300/60 bg-white/90 px-1.5 text-xs text-text-primary backdrop-blur-sm"
                                value={categoryDraft}
                                autoFocus
                                onValueChange={setCategoryDraft}
                                onCategoriesUpdated={setCategoriesList}
                                onKeyDown={onInlineKeyDown(row, "category")}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="btn-outline-ghost exp-icon-btn h-7 w-7"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleCategoryInlineSave(row.id)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="hover:text-text-primary hover:underline"
                              onClick={() => {
                                setActiveExpenseId(row.id);
                                openInlineField(row.id, "category");
                              }}
                            >
                              {catLabel}
                            </button>
                          )}
                          <span
                            className="text-text-secondary/60 dark:text-text-secondary"
                            aria-hidden
                          >
                            ·
                          </span>
                          {editingProjectId === row.id ? (
                            <span
                              data-inline-field
                              className="inline-flex min-w-0 items-center gap-1"
                            >
                              <select
                                className="h-7 max-w-[10rem] rounded-sm border border-gray-300/60 bg-white/90 px-1.5 text-xs text-text-primary backdrop-blur-sm"
                                value={projectDraft}
                                autoFocus
                                onChange={(e) => setProjectDraft(e.target.value)}
                                onKeyDown={onInlineKeyDown(row, "project")}
                              >
                                <option value="">Overhead</option>
                                {safeProjects.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name ?? p.id}
                                  </option>
                                ))}
                              </select>
                              <Button
                                variant="outline"
                                size="icon"
                                className="btn-outline-ghost exp-icon-btn h-7 w-7 shrink-0"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleProjectInlineSave(row.id)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="min-w-0 max-w-[10rem] truncate hover:text-text-primary hover:underline"
                              onClick={() => {
                                setActiveExpenseId(row.id);
                                openInlineField(row.id, "project");
                              }}
                            >
                              {projLabel}
                            </button>
                          )}
                          <span
                            className="text-text-secondary/60 dark:text-text-secondary"
                            aria-hidden
                          >
                            ·
                          </span>
                          {editingDateId === row.id ? (
                            <span className="inline-flex items-center gap-1" data-inline-field>
                              <Input
                                type="date"
                                className="h-7 w-[9.5rem] rounded-sm border-gray-300/60 text-xs text-text-primary"
                                value={dateDraft}
                                autoFocus
                                onChange={(e) => setDateDraft(e.target.value)}
                                onKeyDown={onInlineKeyDown(row, "date")}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="btn-outline-ghost exp-icon-btn h-7 w-7"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleDateInlineSave(row.id)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="hover:text-text-primary hover:underline"
                              onClick={() => {
                                setActiveExpenseId(row.id);
                                openInlineField(row.id, "date");
                              }}
                            >
                              {row.date || "—"}
                            </button>
                          )}
                          <span
                            className="text-text-secondary/60 dark:text-text-secondary"
                            aria-hidden
                          >
                            ·
                          </span>
                          <span className="inline-flex min-w-0 max-w-[8rem] items-center gap-1">
                            <span className="sr-only">Payment </span>
                            <span
                              className="truncate"
                              title={
                                row.paymentAccountName
                                  ? `Payment: ${row.paymentAccountName}`
                                  : "Payment: —"
                              }
                            >
                              {row.paymentAccountName ?? "—"}
                            </span>
                          </span>
                          <span
                            className="text-text-secondary/60 dark:text-text-secondary"
                            aria-hidden
                          >
                            ·
                          </span>
                          {editingSourceId === row.id ? (
                            <span data-inline-field className="inline-flex items-center gap-1">
                              <select
                                className="h-7 rounded-sm border border-gray-300/60 bg-white/90 px-1.5 text-xs text-text-primary backdrop-blur-sm"
                                value={sourceTypeDraft}
                                autoFocus
                                onChange={(e) =>
                                  setSourceTypeDraft(
                                    e.target.value as NonNullable<Expense["sourceType"]>
                                  )
                                }
                                onKeyDown={onInlineKeyDown(row, "source")}
                              >
                                <option value="company">Company</option>
                                <option value="receipt_upload">Receipt</option>
                                <option value="reimbursement">Reimbursement</option>
                              </select>
                              <Button
                                variant="outline"
                                size="icon"
                                className="btn-outline-ghost exp-icon-btn h-7 w-7"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleSourceInlineSave(row.id)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="hover:text-text-primary hover:underline"
                              onClick={() => {
                                setActiveExpenseId(row.id);
                                openInlineField(row.id, "source");
                              }}
                            >
                              {sourceTypeLabel(row.sourceType)}
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex shrink-0 flex-col gap-2 sm:items-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex w-full items-center justify-between sm:block sm:w-auto sm:text-right">
                          {editingAmountId === row.id ? (
                            <div
                              className="flex items-center justify-end gap-1 sm:ml-auto"
                              data-inline-field
                            >
                              <Input
                                className="h-7 w-24 rounded-sm border-gray-300/60 text-right text-sm tabular-nums text-text-primary"
                                value={amountDraft}
                                autoFocus
                                inputMode="decimal"
                                onChange={(e) => setAmountDraft(e.target.value)}
                                onKeyDown={onInlineKeyDown(row, "amount")}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="btn-outline-ghost exp-icon-btn h-7 w-7"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void handleAmountInlineSave(row.id)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-base font-semibold tabular-nums tracking-tight text-money-expense transition-opacity duration-200 group-hover:opacity-90 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveExpenseId(row.id);
                                openInlineField(row.id, "amount");
                              }}
                            >
                              −$
                              {rowTotal.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 text-[11px]">
                          <ExpenseAttachmentTrigger
                            row={row}
                            onPreview={() => void openReceiptPreview(row)}
                          />
                          <button
                            type="button"
                            className={`inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium ${statusStyle.text}`}
                            onClick={() => void toggleStatus(row)}
                            title={
                              listView === "unreviewed" ? "Mark reviewed" : "Toggle review status"
                            }
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusStyle.dot}`}
                              aria-hidden
                            />
                            {statusDisplayLabel(status)}
                          </button>
                        </div>
                      </div>

                      <div className="absolute right-1.5 top-3 z-[1] flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 sm:top-1/2 sm:-translate-y-1/2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="btn-outline-ghost exp-icon-btn h-7 w-7"
                          title="Edit"
                          aria-label="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditExpense(row);
                            setEditModalOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="btn-outline-ghost exp-icon-danger h-7 w-7"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(row);
                          }}
                        >
                          {deletingExpenseId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-gray-300/60 px-4 py-2 dark:border-border/60">
                <Pagination
                  page={curPage}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  className="text-text-secondary [&_.text-muted-foreground]:text-text-secondary [&_button]:exp-btn-secondary"
                />
              </div>
            </div>
          )}
        </section>

        <QuickExpenseModal
          open={quickExpenseOpen}
          onOpenChange={setQuickExpenseOpen}
          onSuccess={refresh}
          projects={safeProjects}
          expenses={expenses}
        />
        <UploadReceiptsQueueModal
          open={uploadReceiptsOpen}
          onOpenChange={setUploadReceiptsOpen}
          onSuccess={refresh}
        />
        <EditExpenseModal
          expense={editExpense}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          projects={safeProjects}
          workers={workers}
          supabase={supabase}
          onExpenseAttachmentsUpdated={(next) => {
            setExpenses((prev) => prev.map((e) => (e.id === next.id ? next : e)));
            setEditExpense(next);
          }}
          onSave={handleExpenseSave}
        />
      </div>
    </div>
  );
}

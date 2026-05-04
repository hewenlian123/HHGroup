"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import { startTransition } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getExpenseTotal,
  deleteExpense,
  getPaymentAccounts,
  updateExpense,
  updateExpenseReceiptUrl,
  updateExpenseForReview,
  type Expense,
  type PaymentAccountRow,
} from "@/lib/data";
import { createBrowserClient } from "@/lib/supabase";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Filter,
  RefreshCw,
  Search,
  Upload,
  MoreHorizontal,
} from "lucide-react";
import { uiActionLog, uiActionMark, uiNavLog, uiNavMark } from "@/lib/ui-action-perf";
import {
  afterLayout,
  focusFirstFocusableInContainer,
  neighborRowIdAfterRemove,
  scrollElementIntoViewNearest,
} from "@/lib/list-flow";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import type { ExpenseReviewSavePatch } from "./edit-expense-modal";
import type { ExpenseInboxPreviewSavePayload } from "./expense-inbox-preview-modal";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useDelayedPending } from "@/hooks/use-delayed-pending";
import { useInboxUploadHighlight } from "@/hooks/use-inbox-upload-highlight";
import hotToast from "react-hot-toast";
import { useToast } from "@/components/toast/toast-provider";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { EXPENSE_SORT_STORAGE_KEY, readStoredExpenseSort } from "@/lib/expense-list-sort-storage";
import {
  buildExpensesQueryKey,
  expenseCategoriesQueryKey,
  expenseListQueryStaleMs,
  expensesQueryKeyRoot,
  fetchExpenseCategories,
  fetchExpenses,
  fetchWorkers,
  type ExpenseListSort,
  workersQueryKey,
} from "@/lib/queries/expenses";
import { fetchFinancialProjects, financialProjectsQueryKey } from "@/lib/queries/receiptQueue";
import { isDefaultExpenseListSort } from "@/lib/expenses-db";
import { cn } from "@/lib/utils";
import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";
import type { ExpenseListBulkActionsApi } from "./expense-inbox-transaction-list";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ExpenseDateRangeFilter,
  expenseDateInFilter,
  type ExpenseDateFilterValue,
} from "@/components/financial/expense-date-range-filter";
import {
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import { buildExpenseDateGroups } from "@/lib/expense-list-date-groups";
import { expenseInboxDuplicateIdSet } from "@/lib/expense-inbox-dup";
import {
  expenseMatchesExpensesArchivePool,
  countExpensesMatchingInboxPool,
  expenseMatchesInboxPool,
  expenseNeedsReviewFromDb,
  validateApproveInboxUploadDraft,
  validateMarkDoneRequiresProjectAndCategory,
} from "@/lib/expense-workflow-status";
import { isInboxUploadExpenseReference } from "@/lib/inbox-upload-constants";
import {
  getExpenseReceiptItems,
  resolveExpenseReceiptItemsPreviewUrlsWithCache,
  type ExpenseReceiptItem,
} from "@/lib/expense-receipt-items";
import { buildReceiptPreviewShellFiles } from "@/lib/receipt-preview-shell-files";

type ProjectRow = { id: string; name: string | null; status?: string | null };
type WorkerRow = { id: string; name: string };

const QuickExpenseModal = dynamic(
  () => import("./quick-expense-modal").then((m) => m.QuickExpenseModal),
  { ssr: false }
);
const UploadReceiptsQueueModal = dynamic(
  () => import("./upload-receipts-queue-modal").then((m) => m.UploadReceiptsQueueModal),
  { ssr: false }
);
const ExpenseInboxPreviewModal = dynamic(
  () => import("./expense-inbox-preview-modal").then((m) => m.ExpenseInboxPreviewModal),
  { ssr: false }
);
const ExpenseInboxTransactionList = dynamic(
  () => import("./expense-inbox-transaction-list").then((m) => m.ExpenseInboxTransactionList),
  { ssr: false, loading: () => <ExpensesListSkeleton /> }
);

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

function mergeExpenseWithPaymentMethod(
  e: Expense,
  patch: ExpenseReviewSavePatch,
  paymentMethod: string
): Expense {
  return { ...mergeExpenseReviewPatch(e, patch), paymentMethod };
}

function receiptItemLooksPdf(item: ExpenseReceiptItem | undefined): boolean {
  if (!item?.url && !item?.fileName) return false;
  const name = (item.fileName ?? "").toLowerCase();
  const u = (item.url ?? "").toLowerCase();
  return name.endsWith(".pdf") || u.endsWith(".pdf") || u.includes("application/pdf");
}

function normalizedVendorLabel(vendor: string): string {
  const v = (vendor ?? "").trim();
  if (!v || /^unknown$/i.test(v) || /^smokevendor[-_]/i.test(v)) return "Needs Review";
  return v;
}

/** Radix Select cannot use `""` as a value — map “all / placeholder” filters to this sentinel. */
const EXPENSE_FILTER_ALL = "__hh_all__";

function expenseHasReceipt(e: Expense): boolean {
  return getExpenseReceiptItems(e).length > 0;
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

type ExpensesAdvancedFiltersFieldsProps = {
  projectFilter: string;
  setProjectFilter: React.Dispatch<React.SetStateAction<string>>;
  categoryFilter: string;
  setCategoryFilter: React.Dispatch<React.SetStateAction<string>>;
  expenseDateFilter: ExpenseDateFilterValue;
  onExpenseDateChange: (next: ExpenseDateFilterValue) => void;
  sourceTypeFilter: string;
  setSourceTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  expenseSort: ExpenseListSort;
  onSortValueChange: (value: string) => void;
  safeProjects: ProjectRow[];
  categoriesList: string[];
  projectsError: string | null;
  selectTriggerClassName: string;
};

function ExpensesAdvancedFiltersFields({
  projectFilter,
  setProjectFilter,
  categoryFilter,
  setCategoryFilter,
  expenseDateFilter,
  onExpenseDateChange,
  sourceTypeFilter,
  setSourceTypeFilter,
  expenseSort,
  onSortValueChange,
  safeProjects,
  categoriesList,
  projectsError,
  selectTriggerClassName,
}: ExpensesAdvancedFiltersFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <Select
        value={projectFilter === "" ? EXPENSE_FILTER_ALL : projectFilter}
        onValueChange={(v) => setProjectFilter(v === EXPENSE_FILTER_ALL ? "" : v)}
      >
        <SelectTrigger data-expenses-filter-project className={selectTriggerClassName}>
          <SelectValue placeholder="Project" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EXPENSE_FILTER_ALL}>Project</SelectItem>
          {safeProjects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name ?? p.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {projectsError ? (
        <span className="text-[11px] text-amber-600 dark:text-amber-400">{projectsError}</span>
      ) : null}
      <Select
        value={categoryFilter === "" ? EXPENSE_FILTER_ALL : categoryFilter}
        onValueChange={(v) => setCategoryFilter(v === EXPENSE_FILTER_ALL ? "" : v)}
      >
        <SelectTrigger className={selectTriggerClassName}>
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EXPENSE_FILTER_ALL}>Category</SelectItem>
          {categoriesList.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ExpenseDateRangeFilter value={expenseDateFilter} onChange={onExpenseDateChange} />
      <Select
        value={sourceTypeFilter === "" ? EXPENSE_FILTER_ALL : sourceTypeFilter}
        onValueChange={(v) => setSourceTypeFilter(v === EXPENSE_FILTER_ALL ? "" : v)}
      >
        <SelectTrigger className={selectTriggerClassName}>
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EXPENSE_FILTER_ALL}>Source</SelectItem>
          <SelectItem value="company">Company</SelectItem>
          <SelectItem value="receipt_upload">Receipt</SelectItem>
          <SelectItem value="reimbursement">Reimbursement</SelectItem>
        </SelectContent>
      </Select>
      <Select value={`${expenseSort.field}|${expenseSort.order}`} onValueChange={onSortValueChange}>
        <SelectTrigger className={selectTriggerClassName} aria-label="Sort expenses">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date|desc">Sort: Date ↓</SelectItem>
          <SelectItem value="date|asc">Sort: Date ↑</SelectItem>
          <SelectItem value="amount|desc">Sort: Amount ↓</SelectItem>
          <SelectItem value="amount|asc">Sort: Amount ↑</SelectItem>
          <SelectItem value="vendor|asc">Sort: Vendor A–Z</SelectItem>
          <SelectItem value="vendor|desc">Sort: Vendor Z–A</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function KpiSparkline({ className }: { className?: string }) {
  return (
    <svg
      className={cn(
        "h-8 w-[4.5rem] shrink-0 opacity-60 text-gray-300 dark:text-gray-600",
        className
      )}
      viewBox="0 0 72 28"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="2,20 14,14 26,18 38,8 50,12 62,6 70,10"
      />
    </svg>
  );
}

function TransactionInboxEntryActions({
  onQuick,
  onUpload,
  onNewExpense,
  className,
  uploadLabel = "Inbox draft",
  quickButtonSize = "sm",
  compact = false,
}: {
  onQuick: () => void;
  onUpload: () => void;
  onNewExpense: () => void;
  className?: string;
  uploadLabel?: string;
  quickButtonSize?: "sm" | "default";
  /** Tighter header row: icon-only upload, 44px touch targets. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end",
        compact ? "gap-0.5" : "gap-1.5",
        className
      )}
    >
      <Button
        type="button"
        variant="default"
        size={compact ? "sm" : quickButtonSize}
        className={cn(
          "shrink-0 shadow-none touch-manipulation",
          compact && "h-9 px-2.5 text-xs font-medium"
        )}
        onClick={onQuick}
      >
        Quick
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "inline-flex shrink-0 touch-manipulation items-center justify-center shadow-none",
          compact ? "h-9 min-h-11 min-w-11 px-0 sm:min-h-9 sm:min-w-0 sm:px-3" : ""
        )}
        onClick={onUpload}
        aria-label={compact ? uploadLabel : undefined}
      >
        <Upload className={cn("h-4 w-4 shrink-0", !compact && "mr-1")} aria-hidden />
        {compact ? <span className="sr-only">{uploadLabel}</span> : uploadLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "shrink-0 shadow-none touch-manipulation",
              compact ? "h-9 min-h-11 min-w-11 sm:min-h-9 sm:min-w-9" : "h-8 w-8"
            )}
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[200] w-44">
          <DropdownMenuItem onSelect={onNewExpense}>New expense</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ExpensesPageClient({ pool }: { pool: "inbox" | "expenses" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const inboxMode = pool === "inbox";
  const archiveMode = pool === "expenses";
  const listPath = inboxMode ? "/financial/inbox" : "/financial/expenses";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [expenseSort, setExpenseSort] = React.useState<ExpenseListSort>(() =>
    readStoredExpenseSort()
  );

  const readCachedCategories = React.useCallback(
    () => queryClient.getQueryData<string[]>(expenseCategoriesQueryKey),
    [queryClient]
  );
  const readCachedWorkers = React.useCallback(
    () => queryClient.getQueryData<WorkerRow[]>(workersQueryKey),
    [queryClient]
  );
  const [workers, setWorkers] = React.useState<WorkerRow[]>(() => readCachedWorkers() ?? []);
  const [expenses, setExpenses] = React.useState<Expense[]>(
    () => queryClient.getQueryData<Expense[]>(buildExpensesQueryKey(readStoredExpenseSort())) ?? []
  );
  const [categoriesList, setCategoriesList] = React.useState<string[]>(
    () => readCachedCategories() ?? []
  );

  const {
    data: expensesQueryData,
    isPending: expensesQueryPending,
    isFetching: expensesQueryFetching,
    isError: expensesQueryError,
    status: expensesQueryStatus,
  } = useQuery({
    queryKey: buildExpensesQueryKey(expenseSort),
    queryFn: () => fetchExpenses(expenseSort),
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(EXPENSE_SORT_STORAGE_KEY, JSON.stringify(expenseSort));
    } catch {
      /* ignore */
    }
  }, [expenseSort]);
  const { data: categoriesQueryData } = useQuery({
    queryKey: expenseCategoriesQueryKey,
    queryFn: fetchExpenseCategories,
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
  });
  const { data: workersQueryData } = useQuery({
    queryKey: workersQueryKey,
    queryFn: fetchWorkers,
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
  });

  const {
    data: projectsData,
    isError: projectsIsError,
    error: projectsQueryError,
  } = useQuery({
    queryKey: financialProjectsQueryKey,
    queryFn: () => fetchFinancialProjects(supabase!),
    enabled: configured && Boolean(supabase),
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
  });

  const projectsError = React.useMemo(() => {
    if (!configured) return "Supabase is not configured.";
    if (!projectsIsError || !projectsQueryError) return null;
    return projectsQueryError instanceof Error
      ? projectsQueryError.message
      : "Failed to load projects.";
  }, [configured, projectsIsError, projectsQueryError]);

  React.useLayoutEffect(() => {
    if (expensesQueryData === undefined) return;
    setExpenses(expensesQueryData);
  }, [expensesQueryData]);

  /** Prefer React Query payload when mirrored state is still empty (avoids empty archive after reload). */
  const expensesForListing = React.useMemo(
    () => (expenses.length > 0 ? expenses : (expensesQueryData ?? [])),
    [expenses, expensesQueryData]
  );
  React.useLayoutEffect(() => {
    if (categoriesQueryData === undefined) return;
    setCategoriesList(categoriesQueryData);
  }, [categoriesQueryData]);
  React.useLayoutEffect(() => {
    if (workersQueryData === undefined) return;
    setWorkers(workersQueryData as WorkerRow[]);
  }, [workersQueryData]);

  const bundleWaiting = expensesQueryPending && expensesQueryData === undefined;
  const showExpensesSkeleton = useDelayedPending(bundleWaiting && !expensesQueryError);
  /** Background refetch (sort/filter) — keep list visible, avoid “full skeleton” feel. */
  const expensesListRefetching = Boolean(
    expensesQueryFetching && expensesQueryData !== undefined && !expensesQueryError
  );
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);
  const [projectFilter, setProjectFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [expenseDateFilter, setExpenseDateFilter] = React.useState<ExpenseDateFilterValue>({
    kind: "all",
  });
  const [sourceTypeFilter, setSourceTypeFilter] = React.useState("");
  const [activeExpenseId, setActiveExpenseId] = React.useState<string | null>(null);
  const rowElsRef = React.useRef<Record<string, HTMLTableRowElement | HTMLLIElement | null>>({});
  const emptyExpensesRef = React.useRef<HTMLDivElement>(null);
  const listView: "all" | "unreviewed" = inboxMode ? "unreviewed" : "all";

  React.useEffect(() => {
    if (!archiveMode) return;
    if (searchParams.get("view") === "unreviewed") {
      startTransition(() => router.replace("/financial/inbox"));
    }
  }, [archiveMode, router, searchParams]);

  const applyExpenseSortValue = React.useCallback(
    (v: string) => {
      const [field, order] = v.split("|") as [ExpenseListSort["field"], ExpenseListSort["order"]];
      if (
        (field === "date" || field === "amount" || field === "vendor") &&
        (order === "asc" || order === "desc")
      ) {
        setExpenseSort({ field, order });
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("page", "1");
        router.push(`${listPath}?${sp.toString()}`, { scroll: false });
      }
    },
    [router, searchParams, listPath]
  );

  const onExpenseDateFilterChange = React.useCallback(
    (next: ExpenseDateFilterValue) => {
      setExpenseDateFilter(next);
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("page", "1");
      router.push(`${listPath}?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams, listPath]
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
    items: ExpenseReceiptItem[];
    index: number;
    expenseId?: string;
  } | null>(null);
  const [quickExpenseOpen, setQuickExpenseOpen] = React.useState(false);
  const [uploadReceiptsOpen, setUploadReceiptsOpen] = React.useState(false);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = React.useState(false);
  const [filtersPopoverOpen, setFiltersPopoverOpen] = React.useState(false);
  const receiptReplaceRef = React.useRef<HTMLInputElement>(null);
  const [receiptReplacing, setReceiptReplacing] = React.useState(false);
  const [previewExpense, setPreviewExpense] = React.useState<Expense | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewEnterMode, setPreviewEnterMode] = React.useState<"preview" | "edit">("preview");
  const [deletingExpenseId, setDeletingExpenseId] = React.useState<string | null>(null);
  const expensesRef = React.useRef<Expense[]>([]);
  expensesRef.current = expenses;
  const previewExpenseRef = React.useRef<Expense | null>(null);
  previewExpenseRef.current = previewExpense;

  const safeProjects = React.useMemo(
    () => (Array.isArray(projectsData) ? projectsData : []) as ProjectRow[],
    [projectsData]
  );
  const projectNameById = React.useMemo(
    () => new Map(safeProjects.map((p) => [p.id, p.name ?? p.id])),
    [safeProjects]
  );
  const workerNameById = React.useMemo(
    () => new Map(workers.map((w) => [w.id, w.name])),
    [workers]
  );

  const inboxAttentionCount = React.useMemo(
    () => countExpensesMatchingInboxPool(expensesForListing),
    [expensesForListing]
  );
  const archivedExpenses = React.useMemo(
    () => expensesForListing.filter(expenseMatchesExpensesArchivePool),
    [expensesForListing]
  );

  const summary = React.useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
    const basis = archiveMode ? archivedExpenses : expensesForListing;
    const monthTotal = basis
      .filter((e) => (e.date ?? "").startsWith(ym))
      .reduce((s, e) => s + getExpenseTotal(e), 0);
    const allTotal = basis.reduce((s, e) => s + getExpenseTotal(e), 0);
    const reimbursementTotal = basis
      .filter((e) => e.sourceType === "reimbursement")
      .reduce((s, e) => s + getExpenseTotal(e), 0);
    return {
      monthTotal,
      allTotal,
      inboxQueueCount: inboxAttentionCount,
      archivedCount: archivedExpenses.length,
      reimbursementTotal,
    };
  }, [expensesForListing, archivedExpenses, archiveMode, inboxAttentionCount]);

  const baseFilteredExpenses = React.useMemo(() => {
    let list = expensesForListing;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
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
    if (sourceTypeFilter)
      list = list.filter((e) => (e.sourceType ?? "company") === sourceTypeFilter);
    if (expenseDateFilter.kind === "range") {
      list = list.filter((e) => expenseDateInFilter(e.date, expenseDateFilter));
    }
    const dupSet = expenseInboxDuplicateIdSet(list, getExpenseTotal);
    if (inboxMode) {
      list = list.filter((e) => expenseMatchesInboxPool(e, dupSet.has(e.id)));
    } else {
      list = list.filter(expenseMatchesExpensesArchivePool);
    }
    return list;
  }, [
    expensesForListing,
    debouncedSearch,
    projectFilter,
    categoryFilter,
    expenseDateFilter,
    sourceTypeFilter,
    projectNameById,
    workerNameById,
    inboxMode,
  ]);

  const filteredSortedExpenses = React.useMemo(() => {
    let list = baseFilteredExpenses;
    if (inboxMode && isDefaultExpenseListSort(expenseSort)) {
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
  }, [baseFilteredExpenses, inboxMode, expenseSort]);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  /** Page size counts **date groups** (calendar days), not individual expenses. */
  const [pageSize, setPageSize] = React.useState(25);
  const total = filteredSortedExpenses.length;
  const allDateGroups = React.useMemo(
    () => buildExpenseDateGroups(filteredSortedExpenses),
    [filteredSortedExpenses]
  );
  const totalDateGroups = allDateGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalDateGroups / pageSize));
  const curPage = Math.min(page, totalPages);
  const visibleDateGroups = React.useMemo(() => {
    const start = (curPage - 1) * pageSize;
    return allDateGroups.slice(start, start + pageSize);
  }, [allDateGroups, curPage, pageSize]);
  const flatListRows = React.useMemo(
    () => visibleDateGroups.flatMap((g) => g.rows),
    [visibleDateGroups]
  );

  const setPageSizeAndReset = React.useCallback(
    (next: number) => {
      setPageSize(next);
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("page", "1");
      router.push(`${listPath}?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams, listPath]
  );

  const listRowsRef = React.useRef(flatListRows);
  listRowsRef.current = flatListRows;
  const listViewRef = React.useRef(listView);
  listViewRef.current = listView;

  const listRowIdsKey = React.useMemo(
    () => flatListRows.map((r) => r.id).join("|"),
    [flatListRows]
  );

  /** Latest sort for mutation callbacks (avoid stale closure vs. `buildExpensesQueryKey`). */
  const expenseSortRef = React.useRef(expenseSort);
  expenseSortRef.current = expenseSort;

  React.useEffect(() => {
    if (listView !== "unreviewed") {
      setActiveExpenseId(null);
      return;
    }
    setActiveExpenseId((cur) => {
      const ids = listRowIdsKey ? listRowIdsKey.split("|").filter(Boolean) : [];
      if (cur && ids.includes(cur)) return cur;
      return ids[0] ?? null;
    });
  }, [listView, listRowIdsKey]);

  React.useEffect(() => {
    if (!activeExpenseId || listView !== "unreviewed") return;
    const el = rowElsRef.current[activeExpenseId];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeExpenseId, listView, listRowIdsKey]);

  const setPage = React.useCallback(
    (nextPage: number) => {
      const sp = new URLSearchParams(searchParams);
      sp.set("page", String(nextPage));
      startTransition(() => router.push(`${listPath}?${sp.toString()}`, { scroll: false }));
    },
    [router, searchParams, listPath]
  );

  const clearNarrowingFiltersForUploadHighlight = React.useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setProjectFilter("");
    setCategoryFilter("");
    setSourceTypeFilter("");
    setExpenseDateFilter({ kind: "all" });
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("project_id");
    sp.set("page", "1");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${listPath}?${qs}` : listPath, { scroll: false }));
  }, [router, searchParams, listPath]);

  const { rowHighlightRefs, autoExpandDateGroupsForHighlight } = useInboxUploadHighlight({
    inboxMode,
    highlightParam: searchParams.get("highlight"),
    expensesForListing,
    filteredSortedExpenses,
    flatListRows,
    curPage,
    pageSize,
    setPage,
    rowElsRef,
    listPath,
    bundleWaiting,
    listBusyFetching: expensesQueryFetching,
    replaceRoute: (href, opts) => router.replace(href, opts),
    onClearNarrowingFilters: clearNarrowingFiltersForUploadHighlight,
  });

  const manualRefreshGenRef = React.useRef(0);
  const refresh = React.useCallback(async () => {
    const gen = ++manualRefreshGenRef.current;
    try {
      const [ex, cat, w] = await Promise.all([
        fetchExpenses(expenseSort),
        fetchExpenseCategories(),
        fetchWorkers(),
      ]);
      if (gen !== manualRefreshGenRef.current) return;
      setExpenses(ex);
      setCategoriesList(cat);
      setWorkers(w as WorkerRow[]);
      queryClient.setQueryData(buildExpensesQueryKey(expenseSort), ex);
      queryClient.setQueryData(expenseCategoriesQueryKey, cat);
      queryClient.setQueryData(workersQueryKey, w);
    } catch (e) {
      if (gen !== manualRefreshGenRef.current) return;
      const msg = e instanceof Error ? e.message : "Could not refresh.";
      toast({ title: "Refresh failed", description: msg, variant: "error" });
    }
  }, [queryClient, expenseSort, toast]);

  const receiptPreviewRef = React.useRef(receiptPreview);
  receiptPreviewRef.current = receiptPreview;
  const receiptPreviewSessionRef = React.useRef(0);
  const receiptPreviewItemsRef = React.useRef<ExpenseReceiptItem[]>([]);
  React.useEffect(() => {
    if (receiptPreview?.items?.length) receiptPreviewItemsRef.current = receiptPreview.items;
  }, [receiptPreview]);
  const {
    openPreview,
    closePreview,
    patchPreview,
    isOpen: attachmentPreviewOpen,
  } = useAttachmentPreview();
  const patchPreviewRef = React.useRef(patchPreview);
  patchPreviewRef.current = patchPreview;

  const mapReceiptItemsToPreviewFiles = React.useCallback((items: ExpenseReceiptItem[]) => {
    return items.map((it) => ({
      url: it.url ?? "",
      fileName: it.fileName ?? "Receipt",
      fileType: (receiptItemLooksPdf(it) ? "pdf" : "image") as "pdf" | "image",
    }));
  }, []);

  const onReceiptReplaceInputChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const nextItems = rp.items.map((it, idx) =>
          idx === rp.index ? { ...it, url: data.publicUrl } : it
        );
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
        patchPreview({ files: mapReceiptItemsToPreviewFiles(nextItems) });
        toast({ title: "Receipt replaced", variant: "success" });
        void refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Replace failed.";
        toast({ title: "Replace failed", description: msg, variant: "error" });
      } finally {
        setReceiptReplacing(false);
        e.target.value = "";
      }
    },
    [supabase, toast, refresh, patchPreview, mapReceiptItemsToPreviewFiles]
  );

  const prefetchReceiptUrls = React.useCallback(
    (row: Expense) => {
      if (!supabase) return;
      const raw = getExpenseReceiptItems(row);
      if (raw.length === 0) return;
      void resolveExpenseReceiptItemsPreviewUrlsWithCache(raw, supabase);
    },
    [supabase]
  );

  const openReceiptPreview = React.useCallback(
    (row: Expense) => {
      const raw = getExpenseReceiptItems(row);
      if (raw.length === 0) {
        toast({
          title: "No receipt",
          description: "This expense has no attachment or receipt URL yet.",
          variant: "default",
        });
        return;
      }

      const shellFiles = buildReceiptPreviewShellFiles(raw).map((f, i) => ({
        ...f,
        fileType: (receiptItemLooksPdf(raw[i]!) ? "pdf" : "image") as "pdf" | "image",
      }));
      const needsResolve = shellFiles.some((f) => f.pendingSignedUrl);

      setReceiptPreview({ items: raw, index: 0, expenseId: row.id });
      receiptPreviewItemsRef.current = raw;
      const previewSession = ++receiptPreviewSessionRef.current;

      const resolveAndPatch = () => {
        void resolveExpenseReceiptItemsPreviewUrlsWithCache(
          receiptPreviewItemsRef.current,
          supabase
        )
          .then((items) => {
            if (receiptPreviewSessionRef.current !== previewSession) return;
            patchPreviewRef.current({
              files: mapReceiptItemsToPreviewFiles(items),
            });
            setReceiptPreview((p) => (p && p.expenseId === row.id ? { ...p, items } : p));
          })
          .catch(() => {
            if (receiptPreviewSessionRef.current !== previewSession) return;
            patchPreviewRef.current({
              files: buildReceiptPreviewShellFiles(receiptPreviewItemsRef.current).map((f, i) => ({
                ...f,
                fileType: (receiptItemLooksPdf(receiptPreviewItemsRef.current[i]!)
                  ? "pdf"
                  : "image") as "pdf" | "image",
                pendingSignedUrl: false,
                signedUrlResolveFailed: true,
              })),
            });
          });
      };

      openPreview({
        files: shellFiles,
        initialIndex: 0,
        isLoading: false,
        onRetrySignedUrlResolve: () => {
          patchPreviewRef.current({
            files: buildReceiptPreviewShellFiles(receiptPreviewItemsRef.current).map((f, i) => ({
              ...f,
              fileType: (receiptItemLooksPdf(receiptPreviewItemsRef.current[i]!)
                ? "pdf"
                : "image") as "pdf" | "image",
              pendingSignedUrl: needsResolve,
              signedUrlResolveFailed: false,
            })),
          });
          resolveAndPatch();
        },
        onIndexChange: (i: number) => {
          setReceiptPreview((p) => (p ? { ...p, index: i } : p));
        },
        showReplace: Boolean(supabase),
        replaceInputRef: receiptReplaceRef,
        replaceBusy: receiptReplacing,
        onReplaceClick: () => receiptReplaceRef.current?.click(),
        onReplaceInputChange: onReceiptReplaceInputChange,
        onRefreshPreviewUrl: async () => {
          const rp = receiptPreviewRef.current;
          if (!rp || !supabase) return null;
          const resolved = await resolveExpenseReceiptItemsPreviewUrlsWithCache(rp.items, supabase);
          const nextFiles = mapReceiptItemsToPreviewFiles(resolved);
          const u = (nextFiles[rp.index]?.url ?? "").trim();
          if (u) {
            patchPreviewRef.current({ files: nextFiles });
            setReceiptPreview((p) =>
              p && p.expenseId === rp.expenseId ? { ...p, items: resolved } : p
            );
          }
          return u || null;
        },
        onClosed: () => {
          receiptPreviewSessionRef.current += 1;
          setReceiptPreview(null);
        },
      });

      if (needsResolve) resolveAndPatch();
    },
    [
      supabase,
      toast,
      openPreview,
      receiptReplacing,
      onReceiptReplaceInputChange,
      mapReceiptItemsToPreviewFiles,
    ]
  );

  React.useEffect(() => {
    if (!receiptPreview) closePreview();
  }, [receiptPreview, closePreview]);

  React.useEffect(() => {
    patchPreview({ replaceBusy: receiptReplacing });
  }, [receiptReplacing, patchPreview]);

  const handlePreviewModalSave = React.useCallback(
    async (payload: ExpenseInboxPreviewSavePayload): Promise<Expense | null> => {
      const prevList = expensesRef.current;
      const target = prevList.find((e) => e.id === payload.expenseId);
      if (!target) return null;
      const { paymentMethod: pm, ...reviewPatch } = payload;
      const merged = mergeExpenseWithPaymentMethod(target, reviewPatch, pm);
      const t0 = uiActionMark();
      flushSync(() => {
        setExpenses((prev) => prev.map((e) => (e.id === payload.expenseId ? merged : e)));
      });
      uiActionLog("expense-preview-save-ui", t0, 100);
      try {
        const next = await updateExpenseForReview(payload.expenseId, {
          date: reviewPatch.date,
          vendorName: reviewPatch.vendorName,
          amount: reviewPatch.amount,
          projectId: reviewPatch.projectId,
          workerId: reviewPatch.workerId,
          category: reviewPatch.category,
          notes: reviewPatch.notes,
          status: reviewPatch.status,
          sourceType: reviewPatch.sourceType,
          paymentAccountId: reviewPatch.paymentAccountId,
        });
        let final: Expense = next ?? merged;
        const pmTrim = pm.trim();
        if (pmTrim !== (target.paymentMethod ?? "").trim()) {
          const pmNext = await updateExpense(payload.expenseId, { paymentMethod: pmTrim });
          if (pmNext) final = pmNext;
        } else if (next) {
          final = next;
        }
        // Keep UI aligned with the modal even if `updateExpense` verification returns null (stale read).
        if (pmTrim) final = { ...final, paymentMethod: pmTrim };
        flushSync(() => {
          setExpenses((prev) => prev.map((e) => (e.id === payload.expenseId ? final : e)));
          setPreviewExpense(final);
        });
        queryClient.setQueryData(
          buildExpensesQueryKey(expenseSortRef.current),
          (old: Expense[] | undefined) =>
            old ? old.map((e) => (e.id === payload.expenseId ? final : e)) : old
        );
        void queryClient.invalidateQueries({
          queryKey: expensesQueryKeyRoot,
          refetchType: "active",
        });
        const pa = final.paymentAccountId?.trim();
        if (pa && (final.vendorName ?? "").trim()) {
          rememberExpenseVendorPaymentAccount(final.vendorName!.trim(), pa);
          persistLastExpensePaymentAccountId(pa);
        }
        hotToast.success("Saved");
        return final;
      } catch {
        flushSync(() => setExpenses(prevList));
        hotToast.error("Something went wrong");
        return null;
      }
    },
    [queryClient]
  );

  const handlePreviewAttachmentsUpdated = React.useCallback(
    (expense: Expense) => {
      flushSync(() => {
        setExpenses((prev) => prev.map((e) => (e.id === expense.id ? expense : e)));
        setPreviewExpense(expense);
      });
      queryClient.setQueryData(
        buildExpensesQueryKey(expenseSortRef.current),
        (old: Expense[] | undefined) =>
          old ? old.map((e) => (e.id === expense.id ? expense : e)) : old
      );
      void queryClient.invalidateQueries({
        queryKey: expensesQueryKeyRoot,
        refetchType: "active",
      });
    },
    [queryClient]
  );

  const handlePreviewMarkReviewed = React.useCallback(
    async (expense: Expense) => {
      const inboxRef = isInboxUploadExpenseReference(expense.referenceNo);
      const gate = inboxRef
        ? validateApproveInboxUploadDraft(expense)
        : validateMarkDoneRequiresProjectAndCategory(expense);
      if (gate === "project") {
        hotToast.error("Please select a project before marking as done");
        return;
      }
      if (gate === "category") {
        hotToast.error("Please select a category before marking as done");
        return;
      }
      if (gate === "payment") {
        hotToast.error("Please select a payment account before approving");
        return;
      }
      if (inboxRef && String(expense.status ?? "").toLowerCase() === "approved") {
        hotToast.error("Already approved");
        return;
      }
      const targetStatus = inboxRef ? ("approved" as const) : ("reviewed" as const);
      const prevList = expensesRef.current;
      flushSync(() => {
        setExpenses((list) =>
          list.map((e) => (e.id === expense.id ? { ...e, status: targetStatus } : e))
        );
      });
      try {
        const saved = await updateExpenseForReview(expense.id, { status: targetStatus });
        const final = saved ?? { ...expense, status: targetStatus };
        flushSync(() => {
          setExpenses((list) => list.map((e) => (e.id === expense.id ? final : e)));
        });
        queryClient.setQueryData(
          buildExpensesQueryKey(expenseSortRef.current),
          (old: Expense[] | undefined) =>
            old ? old.map((e) => (e.id === expense.id ? final : e)) : old
        );
        void queryClient.invalidateQueries({
          queryKey: expensesQueryKeyRoot,
          refetchType: "active",
        });
        hotToast.success(inboxRef ? "Approved" : "Marked done");
        if (inboxMode) {
          flushSync(() => {
            setPreviewOpen(false);
            setPreviewExpense(null);
          });
        }
      } catch {
        flushSync(() => setExpenses(prevList));
        hotToast.error("Status update failed");
      }
    },
    [queryClient, inboxMode]
  );

  const openExpensePreview = React.useCallback(
    (row: Expense, opts?: { mode?: "preview" | "edit" }) => {
      setPreviewExpense(row);
      setPreviewEnterMode(opts?.mode ?? "preview");
      setPreviewOpen(true);
    },
    []
  );

  useOnAppSync(
    React.useCallback(() => {
      void queryClient.invalidateQueries({
        queryKey: expensesQueryKeyRoot,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: expenseCategoriesQueryKey,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: workersQueryKey,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: financialProjectsQueryKey,
        refetchType: "active",
      });
    }, [queryClient]),
    []
  );

  const handleNew = React.useCallback(() => {
    const t0 = uiNavMark();
    startTransition(() => {
      router.push("/financial/expenses/new");
      requestAnimationFrame(() => uiNavLog("expenses->new-expense", t0, 200));
    });
  }, [router]);

  const handleDelete = React.useCallback(
    (expense: Expense) => {
      if (typeof window === "undefined" || !window.confirm("Delete this expense?")) return;
      const prev = expensesRef.current;
      const rowsBefore = listRowsRef.current;
      const nextId = neighborRowIdAfterRemove(rowsBefore, expense.id);
      const t0 = uiActionMark();
      setDeletingExpenseId(expense.id);
      setExpenses((list) => list.filter((e) => e.id !== expense.id));
      uiActionLog("expense-delete-ui", t0, 100);
      expense.attachments?.forEach((a) => {
        if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
      void (async () => {
        try {
          const ok = await deleteExpense(expense.id);
          if (!ok) {
            setExpenses(prev);
            toast({ title: "Delete failed", variant: "error" });
            return;
          }
          queryClient.setQueriesData<Expense[]>({ queryKey: [...expensesQueryKeyRoot] }, (old) =>
            Array.isArray(old) ? old.filter((e) => e.id !== expense.id) : old
          );
          let closedPreviewForDeleted = false;
          flushSync(() => {
            setPreviewExpense((cur) => {
              if (cur?.id === expense.id) {
                closedPreviewForDeleted = true;
                return null;
              }
              return cur;
            });
          });
          if (closedPreviewForDeleted) setPreviewOpen(false);
          toast({ title: "Expense deleted", variant: "success" });
          afterLayout(() => {
            const li = nextId ? rowElsRef.current[nextId] : null;
            scrollElementIntoViewNearest(li ?? undefined);
            if (listViewRef.current === "unreviewed") {
              if (nextId) {
                setActiveExpenseId(nextId);
                focusFirstFocusableInContainer(li);
              } else {
                const first = listRowsRef.current[0];
                setActiveExpenseId(first?.id ?? null);
                if (first) {
                  const firstLi = rowElsRef.current[first.id];
                  scrollElementIntoViewNearest(firstLi ?? undefined);
                  focusFirstFocusableInContainer(firstLi);
                } else {
                  emptyExpensesRef.current?.focus({ preventScroll: true });
                }
              }
            } else if (nextId) {
              focusFirstFocusableInContainer(li);
            } else {
              emptyExpensesRef.current?.focus({ preventScroll: true });
            }
          });
        } catch {
          setExpenses(prev);
          toast({ title: "Delete failed", variant: "error" });
        } finally {
          setDeletingExpenseId(null);
        }
      })();
    },
    [queryClient, toast]
  );

  const focusUnreviewedFromReceiptBulk = searchParams.get("focus_unreviewed") === "1";
  const focusUnreviewedConsumedRef = React.useRef(false);

  React.useEffect(() => {
    if (!focusUnreviewedFromReceiptBulk) {
      focusUnreviewedConsumedRef.current = false;
      return;
    }
    if (!inboxMode || listView !== "unreviewed" || flatListRows.length === 0) return;
    const first = flatListRows[0];
    if (!first || !expensesRef.current.some((e) => e.id === first.id)) return;
    if (focusUnreviewedConsumedRef.current) return;
    focusUnreviewedConsumedRef.current = true;

    const id = first.id;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setActiveExpenseId(id);
        openExpensePreview(first);
        const sp = new URLSearchParams(searchParams.toString());
        sp.delete("focus_unreviewed");
        const qs = sp.toString();
        router.replace(qs ? `${listPath}?${qs}` : listPath, { scroll: false });
      });
    });
  }, [
    focusUnreviewedFromReceiptBulk,
    inboxMode,
    listPath,
    listView,
    listRowIdsKey,
    flatListRows,
    openExpensePreview,
    router,
    searchParams,
  ]);

  const kbRef = React.useRef({
    listView,
    attachmentPreviewOpen,
    previewOpen,
    quickExpenseOpen,
    uploadReceiptsOpen,
    listRows: flatListRows,
    activeExpenseId,
  });
  kbRef.current = {
    listView,
    attachmentPreviewOpen,
    previewOpen,
    quickExpenseOpen,
    uploadReceiptsOpen,
    listRows: flatListRows,
    activeExpenseId,
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = kbRef.current;
      if (k.listView !== "unreviewed") return;
      if (k.attachmentPreviewOpen || k.previewOpen || k.quickExpenseOpen || k.uploadReceiptsOpen) {
        return;
      }
      const t = e.target as HTMLElement | null;
      const inEditable = !!t?.closest("input, textarea, select");

      if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (inEditable) return;
        e.preventDefault();
        const row = k.listRows.find((r) => r.id === k.activeExpenseId);
        if (row && typeof window !== "undefined" && window.confirm("Delete this expense?")) {
          void handleDelete(row);
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (inEditable) return;
        e.preventDefault();
        const idx = k.listRows.findIndex((r) => r.id === k.activeExpenseId);
        if (e.key === "ArrowDown") {
          const n =
            idx < 0 ? Math.min(0, k.listRows.length - 1) : Math.min(idx + 1, k.listRows.length - 1);
          const r = k.listRows[n];
          if (r) setActiveExpenseId(r.id);
        } else {
          const n = idx < 0 ? 0 : Math.max(idx - 1, 0);
          const r = k.listRows[n];
          if (r) setActiveExpenseId(r.id);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleDelete]);

  const toggleStatus = React.useCallback(
    (expense: Expense) => {
      const current = expense.status ?? "pending";
      const goingDone = expenseNeedsReviewFromDb(current);
      const inboxRef = isInboxUploadExpenseReference(expense.referenceNo);
      if (goingDone) {
        const gate = inboxRef
          ? validateApproveInboxUploadDraft(expense)
          : validateMarkDoneRequiresProjectAndCategory(expense);
        if (gate === "project") {
          hotToast.error("Please select a project before marking as done");
          return;
        }
        if (gate === "category") {
          hotToast.error("Please select a category before marking as done");
          return;
        }
        if (gate === "payment") {
          hotToast.error("Please select a payment account before approving");
          return;
        }
        if (inboxRef && String(current).toLowerCase() === "approved") {
          hotToast.error("Already approved");
          return;
        }
      }
      const next = goingDone ? (inboxRef ? "approved" : "reviewed") : "needs_review";
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
            queryClient.setQueryData(
              buildExpensesQueryKey(expenseSortRef.current),
              (old: Expense[] | undefined) =>
                old ? old.map((e) => (e.id === expense.id ? saved : e)) : old
            );
            void queryClient.invalidateQueries({
              queryKey: expensesQueryKeyRoot,
              refetchType: "active",
            });
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
    },
    [toast, queryClient]
  );

  const [paymentAccountsForBulk, setPaymentAccountsForBulk] = React.useState<PaymentAccountRow[]>(
    []
  );
  React.useEffect(() => {
    void getPaymentAccounts()
      .then(setPaymentAccountsForBulk)
      .catch(() => setPaymentAccountsForBulk([]));
  }, []);

  const [bulkBusy, setBulkBusy] = React.useState(false);

  const mergeSavedExpenseInCaches = React.useCallback(
    (saved: Expense) => {
      setExpenses((list) => list.map((e) => (e.id === saved.id ? saved : e)));
      queryClient.setQueryData(
        buildExpensesQueryKey(expenseSortRef.current),
        (old: Expense[] | undefined) =>
          old ? old.map((e) => (e.id === saved.id ? saved : e)) : old
      );
    },
    [queryClient]
  );

  const bulkRunMarkDone = React.useCallback(
    async (ids: string[]) => {
      setBulkBusy(true);
      let ok = 0;
      let skipped = 0;
      try {
        for (const id of ids) {
          const expense = expensesRef.current.find((e) => e.id === id);
          if (!expense || !expenseNeedsReviewFromDb(expense.status)) {
            skipped++;
            continue;
          }
          const inboxRef = isInboxUploadExpenseReference(expense.referenceNo);
          const gate = inboxRef
            ? validateApproveInboxUploadDraft(expense)
            : validateMarkDoneRequiresProjectAndCategory(expense);
          if (gate) {
            skipped++;
            continue;
          }
          if (inboxRef && String(expense.status ?? "").toLowerCase() === "approved") {
            skipped++;
            continue;
          }
          const targetStatus = inboxRef ? "approved" : "reviewed";
          try {
            const saved = await updateExpenseForReview(id, { status: targetStatus });
            if (saved && (saved.status ?? "pending") === targetStatus) {
              mergeSavedExpenseInCaches(saved);
              ok++;
            } else {
              skipped++;
            }
          } catch {
            skipped++;
          }
        }
        void queryClient.invalidateQueries({
          queryKey: expensesQueryKeyRoot,
          refetchType: "active",
        });
        if (ok > 0) {
          toast({
            title: `Marked ${ok} done${skipped > 0 ? ` · ${skipped} skipped` : ""}`,
            variant: "success",
          });
        } else if (skipped > 0) {
          hotToast.error("No expenses could be marked done. Check project, category, and status.");
        }
      } finally {
        setBulkBusy(false);
      }
    },
    [mergeSavedExpenseInCaches, queryClient, toast]
  );

  const bulkRunSetProject = React.useCallback(
    async (ids: string[], projectId: string | null) => {
      setBulkBusy(true);
      let ok = 0;
      try {
        for (const id of ids) {
          const saved = await updateExpenseForReview(id, { projectId });
          if (saved) {
            mergeSavedExpenseInCaches(saved);
            ok++;
          }
        }
        void queryClient.invalidateQueries({
          queryKey: expensesQueryKeyRoot,
          refetchType: "active",
        });
        if (ok > 0) {
          toast({
            title: `Updated project on ${ok} expense${ok !== 1 ? "s" : ""}`,
            variant: "success",
          });
        }
      } catch {
        hotToast.error("Bulk project update failed");
      } finally {
        setBulkBusy(false);
      }
    },
    [mergeSavedExpenseInCaches, queryClient, toast]
  );

  const bulkRunSetCategory = React.useCallback(
    async (ids: string[], category: string) => {
      setBulkBusy(true);
      let ok = 0;
      try {
        for (const id of ids) {
          const saved = await updateExpenseForReview(id, { category });
          if (saved) {
            mergeSavedExpenseInCaches(saved);
            ok++;
          }
        }
        void queryClient.invalidateQueries({
          queryKey: expensesQueryKeyRoot,
          refetchType: "active",
        });
        if (ok > 0) {
          toast({
            title: `Updated category on ${ok} expense${ok !== 1 ? "s" : ""}`,
            variant: "success",
          });
        }
      } catch {
        hotToast.error("Bulk category update failed");
      } finally {
        setBulkBusy(false);
      }
    },
    [mergeSavedExpenseInCaches, queryClient, toast]
  );

  const bulkRunSetPayment = React.useCallback(
    async (ids: string[], paymentAccountId: string | null) => {
      setBulkBusy(true);
      let ok = 0;
      try {
        for (const id of ids) {
          const saved = await updateExpenseForReview(id, { paymentAccountId });
          if (saved) {
            mergeSavedExpenseInCaches(saved);
            ok++;
          }
        }
        void queryClient.invalidateQueries({
          queryKey: expensesQueryKeyRoot,
          refetchType: "active",
        });
        if (ok > 0) {
          toast({
            title: `Updated payment on ${ok} expense${ok !== 1 ? "s" : ""}`,
            variant: "success",
          });
        }
      } catch {
        hotToast.error("Bulk payment update failed");
      } finally {
        setBulkBusy(false);
      }
    },
    [mergeSavedExpenseInCaches, queryClient, toast]
  );

  const bulkRunDeleteMany = React.useCallback(
    async (ids: string[]) => {
      if (typeof window === "undefined") return false;
      if (!window.confirm(`Delete ${ids.length} expenses? This cannot be undone.`)) {
        return false;
      }
      setBulkBusy(true);
      const prev = expensesRef.current;
      try {
        let ok = 0;
        for (const id of ids) {
          const expense = expensesRef.current.find((e) => e.id === id);
          if (!expense) continue;
          expense.attachments?.forEach((a) => {
            if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
          });
          setExpenses((list) => list.filter((e) => e.id !== id));
          const deleted = await deleteExpense(id);
          if (!deleted) {
            setExpenses(prev);
            toast({ title: "Delete failed", variant: "error" });
            return false;
          }
          queryClient.setQueriesData<Expense[]>({ queryKey: [...expensesQueryKeyRoot] }, (old) =>
            Array.isArray(old) ? old.filter((e) => e.id !== id) : old
          );
          const wasPreviewing = previewExpenseRef.current?.id === id;
          flushSync(() => {
            setPreviewExpense((cur) => (cur?.id === id ? null : cur));
          });
          if (wasPreviewing) setPreviewOpen(false);
          ok++;
        }
        void queryClient.invalidateQueries({
          queryKey: expensesQueryKeyRoot,
          refetchType: "active",
        });
        if (ok > 0) {
          toast({ title: `Deleted ${ok} expense${ok !== 1 ? "s" : ""}`, variant: "success" });
        }
        return true;
      } catch {
        setExpenses(prev);
        toast({ title: "Delete failed", variant: "error" });
        return false;
      } finally {
        setBulkBusy(false);
      }
    },
    [queryClient, toast]
  );

  const bulkDownloadComingSoon = React.useCallback(() => {
    toast({
      title: "Download",
      description: "Bulk download is not available yet.",
      variant: "default",
    });
  }, [toast]);

  const bulkActionsApi = React.useMemo<ExpenseListBulkActionsApi>(
    () => ({
      pool: inboxMode ? "inbox" : "expenses",
      busy: bulkBusy,
      projects: safeProjects,
      categories: categoriesList,
      paymentAccounts: paymentAccountsForBulk,
      runMarkDone: bulkRunMarkDone,
      runSetProject: bulkRunSetProject,
      runSetCategory: bulkRunSetCategory,
      runSetPayment: bulkRunSetPayment,
      runDeleteMany: bulkRunDeleteMany,
      onDownloadComingSoon: bulkDownloadComingSoon,
    }),
    [
      inboxMode,
      bulkBusy,
      safeProjects,
      categoriesList,
      paymentAccountsForBulk,
      bulkRunMarkDone,
      bulkRunSetProject,
      bulkRunSetCategory,
      bulkRunSetPayment,
      bulkRunDeleteMany,
      bulkDownloadComingSoon,
    ]
  );

  const possibleDuplicateIds = React.useMemo(
    () => expenseInboxDuplicateIdSet(filteredSortedExpenses, getExpenseTotal),
    [filteredSortedExpenses]
  );

  const hasNarrowingFilters =
    Boolean(searchInput.trim()) ||
    Boolean(projectFilter) ||
    Boolean(categoryFilter) ||
    Boolean(sourceTypeFilter) ||
    expenseDateFilter.kind !== "all";

  /** Advanced filters only (tabs replace status dropdown). */
  const activeAdvancedFilterCount =
    (projectFilter ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (sourceTypeFilter ? 1 : 0) +
    (expenseDateFilter.kind !== "all" ? 1 : 0) +
    (!isDefaultExpenseListSort(expenseSort) ? 1 : 0);

  const showEmptyOnboardingCtas = !hasNarrowingFilters && expensesForListing.length === 0;

  const groupDeskStart = totalDateGroups === 0 ? 0 : (curPage - 1) * pageSize + 1;
  const groupDeskEnd = Math.min(totalDateGroups, curPage * pageSize);
  const expensesOnVisibleGroups = visibleDateGroups.reduce((s, g) => s + g.itemCount, 0);

  const previewExpenseLive = React.useMemo(() => {
    if (!previewExpense) return null;
    return expenses.find((e) => e.id === previewExpense.id) ?? previewExpense;
  }, [expenses, previewExpense]);

  const previewModalNav = React.useMemo(() => {
    if (!previewOpen || !previewExpenseLive) return undefined;
    const idx = filteredSortedExpenses.findIndex((r) => r.id === previewExpenseLive.id);
    if (idx < 0) return undefined;
    return {
      canPrev: idx > 0,
      canNext: idx < filteredSortedExpenses.length - 1,
      onPrev: () => {
        const prev = filteredSortedExpenses[idx - 1];
        if (prev) setPreviewExpense(prev);
      },
      onNext: () => {
        const next = filteredSortedExpenses[idx + 1];
        if (next) setPreviewExpense(next);
      },
    };
  }, [previewOpen, previewExpenseLive, filteredSortedExpenses]);

  const previewPossibleDuplicate =
    previewExpenseLive != null && possibleDuplicateIds.has(previewExpenseLive.id);

  const pageTitle = inboxMode ? "Inbox draft" : "Expenses";
  const pageDescription = inboxMode
    ? "Review and process incoming transactions"
    : "Tracked project costs and completed expenses";

  return (
    <div
      className="expenses-ui min-w-0 overflow-x-hidden"
      data-expenses-query-status={expensesQueryStatus}
    >
      <div className="expenses-ui-content mx-auto w-full min-w-0 max-w-[430px] px-3 py-2 sm:max-w-[460px] md:max-w-[1280px] md:px-8 md:py-8">
        <div className="space-y-3 max-md:pb-1 md:space-y-5">
          <div className="flex items-start justify-between gap-2 border-b border-gray-100/80 pb-2.5 dark:border-border/60 md:hidden">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-[17px] font-semibold leading-tight tracking-tight text-gray-900 dark:text-foreground">
                  {pageTitle}
                </h1>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground"
                  onClick={() =>
                    startTransition(() =>
                      router.push(inboxMode ? "/financial/expenses" : "/financial/inbox")
                    )
                  }
                >
                  {inboxMode ? "Expenses" : "Inbox draft"}
                </Button>
              </div>
              <p className="mt-0.5 hidden text-[11px] leading-snug text-gray-500 dark:text-muted-foreground sm:line-clamp-2">
                {pageDescription}
              </p>
            </div>
            <TransactionInboxEntryActions
              onQuick={() => setQuickExpenseOpen(true)}
              onUpload={() => setUploadReceiptsOpen(true)}
              onNewExpense={handleNew}
              compact
              className="shrink-0 justify-end"
            />
          </div>

          <div className="hidden md:block">
            <PageHeader
              className="[&_h1]:font-semibold [&_h1]:text-gray-900 [&_p]:text-sm [&_p]:text-gray-600 dark:[&_h1]:text-foreground dark:[&_p]:text-muted-foreground"
              title={pageTitle}
              description={pageDescription}
              actions={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 shadow-none"
                    onClick={() =>
                      router.push(inboxMode ? "/financial/expenses" : "/financial/inbox")
                    }
                  >
                    {inboxMode ? "Expenses" : "Inbox draft"}
                  </Button>
                  <TransactionInboxEntryActions
                    onQuick={() => setQuickExpenseOpen(true)}
                    onUpload={() => setUploadReceiptsOpen(true)}
                    onNewExpense={handleNew}
                  />
                </div>
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 md:gap-3">
            <div className="flex min-h-[52px] items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-2 py-1.5 shadow-none md:h-[76px] md:gap-2.5 md:px-3 md:py-2 dark:border-gray-800 dark:bg-gray-950">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 md:h-8 md:w-8 dark:bg-gray-800 dark:text-gray-400">
                <AlertCircle className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[8px] font-medium uppercase tracking-wide leading-none text-gray-500 md:text-[9px] md:normal-case md:tracking-normal dark:text-gray-400">
                  {inboxMode ? "In queue" : "Archived"}
                </p>
                <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-gray-900 md:text-xl dark:text-gray-100">
                  {inboxMode ? summary.inboxQueueCount : summary.archivedCount}
                </p>
              </div>
            </div>
            <div className="flex min-h-[52px] items-center justify-between gap-1 rounded-xl border border-gray-200/90 bg-white px-2 py-1.5 shadow-none md:h-[76px] md:gap-2 md:px-3 md:py-2 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex min-w-0 items-center gap-1.5 md:gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 md:h-8 md:w-8 dark:bg-gray-800 dark:text-gray-400">
                  <CalendarDays
                    className="h-3 w-3 md:h-3.5 md:w-3.5"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-[8px] font-medium uppercase tracking-wide leading-none text-gray-500 md:text-[9px] md:normal-case md:tracking-normal dark:text-gray-400">
                    This Month
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-gray-900 md:text-xl dark:text-gray-100">
                    ${summary.monthTotal.toLocaleString()}
                  </p>
                </div>
              </div>
              <KpiSparkline className="hidden shrink-0 opacity-50 md:block" />
            </div>
            <div className="flex min-h-[52px] items-center justify-between gap-1 rounded-xl border border-gray-200/90 bg-white px-2 py-1.5 shadow-none md:h-[76px] md:gap-2 md:px-3 md:py-2 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex min-w-0 items-center gap-1.5 md:gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 md:h-8 md:w-8 dark:bg-gray-800 dark:text-gray-400">
                  <DollarSign
                    className="h-3 w-3 md:h-3.5 md:w-3.5"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-[8px] font-medium uppercase tracking-wide leading-none text-gray-500 md:text-[9px] md:normal-case md:tracking-normal dark:text-gray-400">
                    {archiveMode ? "Total (archived)" : "Total (all)"}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-gray-900 md:text-xl dark:text-gray-100">
                    ${summary.allTotal.toLocaleString()}
                  </p>
                </div>
              </div>
              <KpiSparkline className="hidden shrink-0 text-emerald-300 opacity-50 dark:text-emerald-900/40 md:block" />
            </div>
            <div className="flex min-h-[52px] items-center justify-between gap-1 rounded-xl border border-gray-200/90 bg-white px-2 py-1.5 shadow-none md:h-[76px] md:gap-2 md:px-3 md:py-2 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex min-w-0 items-center gap-1.5 md:gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 md:h-8 md:w-8 dark:bg-gray-800 dark:text-gray-400">
                  <RefreshCw className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[8px] font-medium uppercase tracking-wide leading-none text-gray-500 md:text-[9px] md:normal-case md:tracking-normal dark:text-gray-400">
                    Reimbursements
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-gray-900 md:text-xl dark:text-gray-100">
                    ${summary.reimbursementTotal.toLocaleString()}
                  </p>
                </div>
              </div>
              <KpiSparkline className="hidden shrink-0 text-violet-300 opacity-50 dark:text-violet-900/40 md:block" />
            </div>
          </div>

          {/* Mobile: search + filters drawer (pool switch lives in header) */}
          <div className="flex w-full min-w-0 items-center gap-2 md:hidden">
            <Input
              placeholder="Search…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-11 min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200/90 bg-white text-base text-gray-900 shadow-none dark:border-border/60 dark:bg-card dark:text-foreground"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="relative h-11 min-h-11 w-[5.75rem] shrink-0 gap-1 rounded-xl border-gray-200/90 px-2 dark:border-border/60"
              onClick={() => setFiltersDrawerOpen(true)}
            >
              <Filter className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate text-xs font-medium">
                Filters
                {activeAdvancedFilterCount > 0 ? (
                  <span className="text-muted-foreground"> · {activeAdvancedFilterCount}</span>
                ) : null}
              </span>
            </Button>
          </div>
          <Sheet open={filtersDrawerOpen} onOpenChange={setFiltersDrawerOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[90vh] overflow-y-auto rounded-t-lg p-4 md:hidden"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="text-base font-semibold">Filters & more</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-4 pb-8">
                <div className="flex flex-col gap-2 border-b border-gray-100/80 pb-4 dark:border-border/60">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-10 w-full shrink-0 rounded-sm shadow-none"
                    onClick={() => {
                      setQuickExpenseOpen(true);
                      setFiltersDrawerOpen(false);
                    }}
                  >
                    Quick
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-full shrink-0 rounded-sm shadow-none"
                    onClick={() => {
                      setUploadReceiptsOpen(true);
                      setFiltersDrawerOpen(false);
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                    Inbox draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-full shrink-0 rounded-sm shadow-none"
                    onClick={() => {
                      handleNew();
                      setFiltersDrawerOpen(false);
                    }}
                  >
                    New expense
                  </Button>
                </div>
                <ExpensesAdvancedFiltersFields
                  projectFilter={projectFilter}
                  setProjectFilter={setProjectFilter}
                  categoryFilter={categoryFilter}
                  setCategoryFilter={setCategoryFilter}
                  expenseDateFilter={expenseDateFilter}
                  onExpenseDateChange={onExpenseDateFilterChange}
                  sourceTypeFilter={sourceTypeFilter}
                  setSourceTypeFilter={setSourceTypeFilter}
                  expenseSort={expenseSort}
                  onSortValueChange={applyExpenseSortValue}
                  safeProjects={safeProjects}
                  categoriesList={categoriesList}
                  projectsError={projectsError}
                  selectTriggerClassName="h-10 w-full rounded-sm border border-gray-100/80 bg-white text-xs shadow-none dark:border-border/60 dark:bg-card"
                />
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setFiltersDrawerOpen(false)}
                >
                  Done
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <section
            className={cn(
              "relative",
              expensesListRefetching &&
                expensesForListing.length > 0 &&
                "pointer-events-none opacity-60"
            )}
            aria-busy={expensesListRefetching && expensesForListing.length > 0 ? true : undefined}
          >
            {expensesListRefetching && expensesForListing.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex justify-center pt-1">
                <span className="text-xs text-muted-foreground">Updating…</span>
              </div>
            ) : null}

            {/* Filters + table: one white card on md+ */}
            <div className="overflow-hidden md:rounded-2xl md:border md:border-gray-200/70 md:bg-white md:shadow-sm dark:md:border-gray-800 dark:md:bg-gray-950">
              <div className="hidden flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 md:flex">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 rounded-lg border-gray-200 bg-white text-xs font-medium text-gray-700 shadow-none hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                    onClick={() =>
                      startTransition(() =>
                        router.push(inboxMode ? "/financial/expenses" : "/financial/inbox")
                      )
                    }
                  >
                    {inboxMode ? "Expenses" : "Inbox draft"}
                  </Button>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 lg:max-w-xl">
                  <div className="relative min-w-[12rem] max-w-md flex-1">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                      aria-hidden
                    />
                    <Input
                      placeholder="Search…"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="h-9 rounded-lg border-gray-200 bg-white py-1 pl-8 pr-14 text-sm shadow-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                    />
                    <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border border-gray-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-gray-400 lg:inline dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500">
                      ⌘K
                    </kbd>
                  </div>
                  <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 gap-1.5 rounded-lg border-gray-200 px-3 dark:border-gray-700 dark:bg-gray-950 dark:hover:bg-gray-900"
                      >
                        <Filter className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="text-xs font-medium">
                          Filters
                          {activeAdvancedFilterCount > 0 ? (
                            <span className="text-gray-500 dark:text-gray-400">
                              {" "}
                              · {activeAdvancedFilterCount}
                            </span>
                          ) : null}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      sideOffset={8}
                      className="z-50 overflow-visible w-[min(calc(100vw-2rem),22rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-950"
                    >
                      <ExpensesAdvancedFiltersFields
                        projectFilter={projectFilter}
                        setProjectFilter={setProjectFilter}
                        categoryFilter={categoryFilter}
                        setCategoryFilter={setCategoryFilter}
                        expenseDateFilter={expenseDateFilter}
                        onExpenseDateChange={onExpenseDateFilterChange}
                        sourceTypeFilter={sourceTypeFilter}
                        setSourceTypeFilter={setSourceTypeFilter}
                        expenseSort={expenseSort}
                        onSortValueChange={applyExpenseSortValue}
                        safeProjects={safeProjects}
                        categoriesList={categoriesList}
                        projectsError={projectsError}
                        selectTriggerClassName="h-9 w-full rounded-lg border border-gray-200 bg-white text-xs shadow-none dark:border-gray-700 dark:bg-gray-950"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {inboxMode ? (
                <p className="hidden border-b border-gray-100 px-4 py-1.5 text-[11px] leading-snug text-gray-500 dark:border-gray-800 dark:text-gray-400 md:block">
                  Enter: save · Shift+Enter: save only · Tab: field · ↑↓ row · D delete · Esc cancel
                </p>
              ) : null}
              {showExpensesSkeleton && expenses.length === 0 ? (
                <div className="border-t border-gray-100 px-4 py-8 dark:border-gray-800 md:border-t-0">
                  <ExpensesListSkeleton rows={8} showStatCards={false} />
                </div>
              ) : total === 0 ? (
                <>
                  <div
                    className="hidden min-h-[min(55vh,480px)] flex-col justify-center border-t border-gray-100 px-6 py-16 text-center dark:border-gray-800 md:flex"
                    tabIndex={-1}
                    data-expenses-empty
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-foreground">
                      No transactions found
                    </p>
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-muted-foreground">
                      {inboxMode
                        ? hasNarrowingFilters
                          ? "Try clearing filters or search."
                          : expensesForListing.length === 0
                            ? "Add an expense to get started."
                            : summary.inboxQueueCount === 0
                              ? "Nothing needs attention. Open Expenses to see archived costs."
                              : "No matching items."
                        : hasNarrowingFilters
                          ? "Adjust filters or search."
                          : expensesForListing.length === 0
                            ? "Add an expense to get started."
                            : summary.archivedCount === 0
                              ? "No archived expenses yet. Mark items done from Inbox."
                              : "No matching archived expenses."}
                    </p>
                    {showEmptyOnboardingCtas ? (
                      <div className="mt-4 flex justify-center">
                        <TransactionInboxEntryActions
                          onQuick={() => setQuickExpenseOpen(true)}
                          onUpload={() => setUploadReceiptsOpen(true)}
                          onNewExpense={handleNew}
                          className="justify-center"
                        />
                      </div>
                    ) : inboxMode &&
                      !hasNarrowingFilters &&
                      expensesForListing.length > 0 &&
                      summary.inboxQueueCount === 0 ? (
                      <div className="mt-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-sm border border-gray-100 bg-white text-gray-700 shadow-none hover:bg-gray-50 dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted/50"
                          onClick={() => router.push("/financial/expenses")}
                        >
                          View Expenses
                        </Button>
                      </div>
                    ) : archiveMode && !hasNarrowingFilters && summary.archivedCount === 0 ? (
                      <div className="mt-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-sm border border-gray-100 bg-white text-gray-700 shadow-none hover:bg-gray-50 dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted/50"
                          onClick={() => router.push("/financial/inbox")}
                        >
                          Open Inbox
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="flex flex-col items-center border-b border-gray-100/80 py-6 md:hidden dark:border-border/60"
                    tabIndex={-1}
                    data-expenses-empty-mobile
                  >
                    <Upload
                      className="h-8 w-8 text-text-secondary dark:text-muted-foreground"
                      aria-hidden
                    />
                    <p className="mt-3 text-center text-sm font-semibold text-gray-900 dark:text-foreground">
                      No transactions found
                    </p>
                    <p className="mt-1 max-w-xs text-center text-xs text-text-secondary dark:text-muted-foreground">
                      {inboxMode
                        ? hasNarrowingFilters
                          ? "Try filters or search."
                          : expensesForListing.length === 0
                            ? "Add an expense to get started."
                            : summary.inboxQueueCount === 0
                              ? "Nothing needs attention."
                              : "No matching items."
                        : hasNarrowingFilters
                          ? "Adjust filters or search."
                          : expensesForListing.length === 0
                            ? "Add an expense to get started."
                            : summary.archivedCount === 0
                              ? "Nothing archived yet. Use Inbox."
                              : "No matching archived expenses."}
                    </p>
                    {showEmptyOnboardingCtas ? (
                      <div className="mt-4 flex w-full max-w-sm justify-center px-2">
                        <TransactionInboxEntryActions
                          onQuick={() => setQuickExpenseOpen(true)}
                          onUpload={() => setUploadReceiptsOpen(true)}
                          onNewExpense={handleNew}
                          quickButtonSize="default"
                          className="max-w-full justify-center gap-1"
                        />
                      </div>
                    ) : inboxMode &&
                      !hasNarrowingFilters &&
                      expensesForListing.length > 0 &&
                      summary.inboxQueueCount === 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={() => router.push("/financial/expenses")}
                      >
                        View Expenses
                      </Button>
                    ) : archiveMode && !hasNarrowingFilters && summary.archivedCount === 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={() => router.push("/financial/inbox")}
                      >
                        Open Inbox
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-full overflow-hidden bg-background md:bg-white dark:md:bg-gray-950">
                    <ExpenseInboxTransactionList
                      dateChunks={visibleDateGroups}
                      possibleDuplicateIds={possibleDuplicateIds}
                      bulkActions={bulkActionsApi}
                      api={{
                        listView,
                        dateGroupPool: inboxMode ? "inbox" : "expenses",
                        autoExpandDateGroups:
                          hasNarrowingFilters || autoExpandDateGroupsForHighlight,
                        highlightReferenceNos: rowHighlightRefs,
                        activeExpenseId,
                        setActiveExpenseId,
                        rowElsRef,
                        projectNameById,
                        deletingExpenseId,
                        toggleStatus,
                        openReceiptPreview,
                        prefetchReceiptUrls,
                        openExpensePreview,
                        handleDelete,
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-2 border-t border-gray-100 bg-white px-4 py-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400 md:flex-row md:items-center md:justify-between">
                    <p className="tabular-nums">
                      {total === 0
                        ? "Showing 0 results"
                        : `Date groups ${groupDeskStart}–${groupDeskEnd} of ${totalDateGroups} · ${expensesOnVisibleGroups} expenses on this page · ${total} total`}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 md:gap-4">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 shrink-0 border-gray-200 p-0 shadow-none dark:border-gray-700"
                          disabled={curPage <= 1}
                          aria-label="Previous page"
                          onClick={() => setPage(curPage - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-[2rem] text-center tabular-nums text-gray-900 dark:text-foreground">
                          {curPage}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 shrink-0 border-gray-200 p-0 shadow-none dark:border-gray-700"
                          disabled={curPage >= totalPages}
                          aria-label="Next page"
                          onClick={() => setPage(curPage + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-gray-600 dark:text-gray-400">
                          Groups per page
                        </span>
                        <Select
                          value={String(pageSize)}
                          onValueChange={(v) => setPageSizeAndReset(Number(v))}
                        >
                          <SelectTrigger className="h-7 w-[4.25rem] rounded-sm border-gray-200 text-xs shadow-none dark:border-gray-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {quickExpenseOpen ? (
          <QuickExpenseModal
            open={quickExpenseOpen}
            onOpenChange={setQuickExpenseOpen}
            onSuccess={refresh}
            projects={safeProjects}
            expenses={expensesForListing}
          />
        ) : null}
        {uploadReceiptsOpen ? (
          <UploadReceiptsQueueModal
            open={uploadReceiptsOpen}
            onOpenChange={setUploadReceiptsOpen}
            onSuccess={refresh}
          />
        ) : null}
        {previewOpen ? (
          <ExpenseInboxPreviewModal
            expense={previewExpenseLive}
            open={previewOpen}
            onOpenChange={(o) => {
              setPreviewOpen(o);
              if (!o) setPreviewExpense(null);
            }}
            enterMode={previewEnterMode}
            projects={safeProjects}
            workers={workers}
            projectNameById={projectNameById}
            supabase={supabase}
            setCategoriesList={setCategoriesList}
            onSave={handlePreviewModalSave}
            onMarkReviewed={handlePreviewMarkReviewed}
            onAttachmentsUpdated={handlePreviewAttachmentsUpdated}
            previewNav={previewModalNav}
            possibleDuplicate={previewPossibleDuplicate}
          />
        ) : null}
      </div>
    </div>
  );
}

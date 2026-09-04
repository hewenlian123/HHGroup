"use client";

import "./expenses-ui-theme.css";
import * as React from "react";
import { startTransition } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingState, NeoAmount, NeoPanel, NeoToolbar } from "@/components/base";
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
  defaultExpenseListSort,
  getExpenseTotal,
  isDefaultExpenseListSort,
} from "@/lib/expense-domain";
import type { Expense } from "@/lib/expenses-db";
import type { PaymentAccountRow } from "@/lib/payment-accounts-db";
import type { SubcontractDeductionOption } from "@/lib/subcontract-deductions-db";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { uiActionLog, uiActionMark } from "@/lib/ui-action-perf";
import {
  afterLayout,
  focusFirstFocusableInContainer,
  neighborRowIdAfterRemove,
  scrollElementIntoViewNearest,
} from "@/lib/list-flow";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import {
  INBOX_DRAFT_OCR_WRITEBACK_EVENT,
  type InboxDraftOcrWritebackEventDetail,
} from "@/lib/expense-inbox-draft-ocr-events";
import type { ExpenseReviewSavePatch } from "./edit-expense-modal";
import type { ExpenseInboxPreviewSavePayload } from "./expense-inbox-preview-modal";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useDelayedPending } from "@/hooks/use-delayed-pending";
import { useInboxUploadHighlight } from "@/hooks/use-inbox-upload-highlight";
import { toast as hotToast } from "@/lib/toast";
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
  fetchSubcontractDeductionOptions,
  fetchWorkers,
  subcontractDeductionOptionsQueryKey,
  type ExpensesInitialData,
  type ExpenseListSort,
  workersQueryKey,
} from "@/lib/queries/expenses";
import { fetchFinancialProjects, financialProjectsQueryKey } from "@/lib/queries/receiptQueue";
import { cn } from "@/lib/utils";
import { cleanExpenseDescriptionForDisplay } from "@/lib/expense-form-system";
import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";
import type { ExpenseListBulkActionsApi } from "./expense-inbox-transaction-list";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  computePresetRange,
  ExpenseDateRangeFilter,
  expenseDateInFilter,
  type ExpenseDateFilterValue,
} from "@/components/financial/expense-date-range-filter";
import {
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import { buildExpenseDateGroups } from "@/lib/expense-list-date-groups";
import {
  isExpenseHeaderLineMismatchIssue,
  type ExpenseIssueFocus,
} from "@/lib/expense-header-line-mismatch";
import { expenseInboxDuplicateIdSet } from "@/lib/expense-inbox-dup";
import {
  expenseHasCategoryForWorkflow,
  expenseHasRequiredProjectForWorkflow,
  expenseMatchesExpensesArchivePool,
  countExpensesMatchingInboxPool,
  expenseMatchesInboxPool,
  expenseMissingReceiptForInbox,
  expenseNeedsReviewFromDb,
  expenseStatusUiLabel,
  validateApproveInboxUploadDraft,
  validateMarkDoneRequiresProjectAndCategory,
} from "@/lib/expense-workflow-status";
import {
  isInboxUploadExpenseReference,
  stripInboxUploadNoiseFromText,
} from "@/lib/inbox-upload-constants";
import { getExpenseReceiptItems } from "@/lib/expense-receipt-items";
import { buildReceiptPreviewShellFiles } from "@/lib/receipt-preview-shell-files";
import {
  fetchExpenseReceiptManifest,
  replaceExpenseReceipt,
  type ExpenseReceiptApiItem,
  type ExpenseReceiptApiManifest,
} from "@/lib/expense-receipt-api-client";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { OS } from "@/lib/typography";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { ExpenseOperationsWorkspaceNav } from "@/components/financial/expense-operations-workspace-nav";
import { ReceiptInboxSourceNav } from "@/components/financial/receipt-inbox-source-nav";

type ProjectRow = { id: string; name: string | null; status?: string | null };
type WorkerRow = { id: string; name: string };

type ExpenseReviewApiPayload = {
  expenseId: string;
  date: string;
  vendorName: string;
  amount: number;
  projectId: string | null;
  workerId: string | null;
  category: string;
  notes: string | undefined;
  status: Expense["status"];
  sourceType: Expense["sourceType"];
  paymentAccountId: string | null;
  paymentMethod: string;
  subcontractDeduction?: {
    enabled: boolean;
    subcontractId: string | null;
    subcontractorId: string | null;
    projectId: string | null;
    amount: number;
    note?: string | null;
  } | null;
};

type ExpenseApiResponse = {
  ok?: boolean;
  message?: string;
};

type ExpenseMutationApiResponse = ExpenseApiResponse & {
  expense?: Expense;
};

type ExpenseReviewStatusPatch = Partial<{
  date: string;
  vendorName: string;
  notes: string;
  status: NonNullable<Expense["status"]>;
  workerId: string | null;
  projectId: string | null;
  category: string;
  amount: number;
  sourceType: Expense["sourceType"];
  paymentAccountId: string | null;
  paymentMethod: string;
}>;

async function loadPaymentAccounts(): Promise<PaymentAccountRow[]> {
  const { getPaymentAccounts } = await import("@/lib/data");
  return getPaymentAccounts();
}

async function updateExpenseForReviewLazy(
  expenseId: string,
  patch: ExpenseReviewStatusPatch
): Promise<Expense | null> {
  const { updateExpenseForReview } = await import("@/lib/data");
  return updateExpenseForReview(expenseId, patch);
}

async function saveExpenseReviewViaApi(payload: ExpenseReviewApiPayload): Promise<void> {
  const response = await fetch(`/api/expenses/${encodeURIComponent(payload.expenseId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      date: payload.date,
      vendorName: payload.vendorName,
      amount: payload.amount,
      projectId: payload.projectId,
      workerId: payload.workerId,
      category: payload.category,
      notes: payload.notes,
      status: payload.status,
      sourceType: payload.sourceType,
      paymentAccountId: payload.paymentAccountId,
      paymentMethod: payload.paymentMethod,
      subcontractDeduction: payload.subcontractDeduction,
    }),
  });
  let body: ExpenseApiResponse | null = null;
  try {
    body = (await response.json()) as ExpenseApiResponse;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || "Failed to save expense.");
  }
}

async function approveInboxDraftViaApi(expenseId: string): Promise<Expense> {
  const response = await fetch(
    `/api/financial/expenses/${encodeURIComponent(expenseId)}/approve-inbox`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
    }
  );
  let body: ExpenseMutationApiResponse | null = null;
  try {
    body = (await response.json()) as ExpenseMutationApiResponse;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.ok || !body.expense) {
    throw new Error(body?.message || "Failed to approve Inbox draft.");
  }
  return body.expense;
}

async function deleteExpenseViaApi(expenseId: string): Promise<void> {
  const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  let body: ExpenseApiResponse | null = null;
  try {
    body = (await response.json()) as ExpenseApiResponse;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || "Failed to delete expense.");
  }
}

const QuickExpenseModal = dynamic(
  () => import("./quick-expense-modal").then((m) => m.QuickExpenseModal),
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
const UploadReceiptsQueueModal = dynamic(
  () => import("./upload-receipts-queue-modal").then((m) => m.UploadReceiptsQueueModal),
  { ssr: false }
);

/** HH Finance OS — visual parity with Finance Owner dashboard (presentation only). */
const financeOsPageWrap =
  "financial-nums expenses-ui min-w-0 overflow-x-hidden bg-[var(--hh-l1-workspace)] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[var(--hh-text-secondary)]";

const financeOsListShell = "overflow-hidden p-0";

const financeToolbarButtonClass =
  "h-9 shrink-0 rounded-lg border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-xs font-medium text-[var(--hh-text-primary)] shadow-none transition-colors duration-150 hover:bg-[var(--hh-l3-hover)] focus-visible:ring-[var(--hh-focus-ring)]";

const financePrimaryActionClass =
  "border-transparent bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] shadow-none hover:bg-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)]";

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
    notes:
      p.notes !== undefined
        ? cleanExpenseDescriptionForDisplay(p.notes, stripInboxUploadNoiseFromText)
        : e.notes,
    status: p.status,
    workerId: p.workerId,
    sourceType: p.sourceType !== undefined ? p.sourceType : e.sourceType,
    paymentAccountId: p.paymentAccountId,
    paymentAccountName: p.paymentAccountName,
    paymentMethod: p.paymentMethod !== undefined ? p.paymentMethod : e.paymentMethod,
    lines: nextLines,
    headerProjectId: p.projectId,
    subcontractDeduction: p.subcontractDeduction?.enabled
      ? {
          id: e.subcontractDeduction?.id ?? `optimistic-deduction-${p.expenseId}`,
          expense_id: p.expenseId,
          project_id: p.subcontractDeduction.projectId,
          subcontractor_id: p.subcontractDeduction.subcontractorId ?? "",
          subcontract_id: p.subcontractDeduction.subcontractId,
          amount: p.subcontractDeduction.amount,
          note: p.subcontractDeduction.note ?? null,
          created_at: e.subcontractDeduction?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : p.subcontractDeduction === null
        ? null
        : e.subcontractDeduction,
  };
}

function receiptItemLooksPdf(
  item: { fileName?: string; mimeType?: string; signedUrl?: string; url?: string } | undefined
): boolean {
  if (!item?.url && !item?.signedUrl && !item?.fileName) return false;
  const name = (item.fileName ?? "").toLowerCase();
  const u = (item.url ?? item.signedUrl ?? "").toLowerCase();
  return (
    item.mimeType === "application/pdf" ||
    name.endsWith(".pdf") ||
    u.endsWith(".pdf") ||
    u.includes("application/pdf")
  );
}

function normalizedVendorLabel(vendor: string): string {
  const v = (vendor ?? "").trim();
  if (!v || /^unknown$/i.test(v) || /^smokevendor[-_]/i.test(v)) return "Needs Review";
  return v;
}

/** Radix Select cannot use `""` as a value — map “all / placeholder” filters to this sentinel. */
const EXPENSE_FILTER_ALL = "__hh_all__";

function defaultExpenseDateFilterForPool(pool: "inbox" | "expenses"): ExpenseDateFilterValue {
  if (pool !== "expenses") return { kind: "all" };
  const { start, end } = computePresetRange("thisMonth");
  return { kind: "range", start, end, preset: "thisMonth" };
}

function expenseHasReceipt(e: Expense): boolean {
  return getExpenseReceiptItems(e).length > 0;
}

function extractExpenseTags(expense: Expense): string[] {
  const notes = stripInboxUploadNoiseFromText(expense.notes ?? "");
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

const EXPENSE_FILTER_FIELD_LABEL_CLASS =
  "text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]";

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
    <div className="grid grid-cols-1 gap-3.5">
      <div className="grid gap-1.5">
        <span className={EXPENSE_FILTER_FIELD_LABEL_CLASS}>Project</span>
        <Select
          value={projectFilter === "" ? EXPENSE_FILTER_ALL : projectFilter}
          onValueChange={(v) => setProjectFilter(v === EXPENSE_FILTER_ALL ? "" : v)}
        >
          <SelectTrigger
            data-expenses-filter-project
            className={selectTriggerClassName}
            aria-label="Filter by project"
          >
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent className="expenses-ui-dialog" data-expense-component-surface="select">
            <SelectItem value={EXPENSE_FILTER_ALL}>All projects</SelectItem>
            {safeProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name ?? p.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {projectsError ? (
        <span className="text-hh-status text-[var(--hh-warning)] dark:text-[var(--hh-warning)]">
          {projectsError}
        </span>
      ) : null}
      <div className="grid gap-1.5">
        <span className={EXPENSE_FILTER_FIELD_LABEL_CLASS}>Category</span>
        <Select
          value={categoryFilter === "" ? EXPENSE_FILTER_ALL : categoryFilter}
          onValueChange={(v) => setCategoryFilter(v === EXPENSE_FILTER_ALL ? "" : v)}
        >
          <SelectTrigger className={selectTriggerClassName} aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="expenses-ui-dialog" data-expense-component-surface="select">
            <SelectItem value={EXPENSE_FILTER_ALL}>All categories</SelectItem>
            {categoriesList.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <span className={EXPENSE_FILTER_FIELD_LABEL_CLASS}>Date</span>
        <ExpenseDateRangeFilter value={expenseDateFilter} onChange={onExpenseDateChange} />
      </div>
      <div className="grid gap-1.5">
        <span className={EXPENSE_FILTER_FIELD_LABEL_CLASS}>Source</span>
        <Select
          value={sourceTypeFilter === "" ? EXPENSE_FILTER_ALL : sourceTypeFilter}
          onValueChange={(v) => setSourceTypeFilter(v === EXPENSE_FILTER_ALL ? "" : v)}
        >
          <SelectTrigger className={selectTriggerClassName} aria-label="Filter by source">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent className="expenses-ui-dialog" data-expense-component-surface="select">
            <SelectItem value={EXPENSE_FILTER_ALL}>All sources</SelectItem>
            <SelectItem value="company">Manual</SelectItem>
            <SelectItem value="receipt_upload">Receipt upload</SelectItem>
            <SelectItem value="reimbursement">Worker reimbursement</SelectItem>
            <SelectItem value="bank_import">Bank import</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <span className={EXPENSE_FILTER_FIELD_LABEL_CLASS}>Sort</span>
        <Select
          value={`${expenseSort.field}|${expenseSort.order}`}
          onValueChange={onSortValueChange}
        >
          <SelectTrigger className={selectTriggerClassName} aria-label="Sort expenses">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="expenses-ui-dialog" data-expense-component-surface="select">
            <SelectItem value="date|desc">Date ↓</SelectItem>
            <SelectItem value="date|asc">Date ↑</SelectItem>
            <SelectItem value="amount|desc">Amount ↓</SelectItem>
            <SelectItem value="amount|asc">Amount ↑</SelectItem>
            <SelectItem value="vendor|asc">Vendor A–Z</SelectItem>
            <SelectItem value="vendor|desc">Vendor Z–A</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function TransactionInboxEntryActions({
  onQuick,
  onUpload,
  className,
  uploadLabel = "Upload receipt",
  quickButtonSize = "sm",
  compact = false,
}: {
  onQuick: () => void;
  onUpload: () => void;
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
          financePrimaryActionClass,
          "shrink-0 shadow-none touch-manipulation",
          compact && "h-9 px-2.5 text-xs font-medium"
        )}
        onClick={onQuick}
      >
        <Plus className="mr-1 h-4 w-4 shrink-0" aria-hidden />
        New Expense
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid={compact ? "mobile-upload-receipt" : undefined}
        className={cn(
          OS.secondaryButton,
          "inline-flex shrink-0 touch-manipulation items-center justify-center shadow-none",
          compact ? "h-9 min-h-11 min-w-11 px-0 sm:min-h-9 sm:min-w-0 sm:px-3" : ""
        )}
        onClick={onUpload}
        aria-label={compact ? uploadLabel : undefined}
      >
        <Upload className={cn("h-4 w-4 shrink-0", !compact && "mr-1")} aria-hidden />
        {compact ? <span className="sr-only">{uploadLabel}</span> : uploadLabel}
      </Button>
    </div>
  );
}

export function ExpensesPageClient({
  pool,
  initialData,
}: {
  pool: "inbox" | "expenses";
  initialData?: ExpensesInitialData;
}) {
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
  const supabaseRef = React.useRef<SupabaseClient | null>(null);
  const [supabase, setSupabase] = React.useState<SupabaseClient | null>(null);
  const loadBrowserSupabase = React.useCallback(async (): Promise<SupabaseClient | null> => {
    if (!configured || !url || !anon) return null;
    if (supabaseRef.current) return supabaseRef.current;
    const { createBrowserClient } = await import("@/lib/supabase");
    const client = createBrowserClient(url, anon);
    supabaseRef.current = client;
    setSupabase(client);
    return client;
  }, [configured, url, anon]);

  React.useEffect(() => {
    void loadBrowserSupabase();
  }, [loadBrowserSupabase]);

  const [expenseSort, setExpenseSort] = React.useState<ExpenseListSort>(() =>
    readStoredExpenseSort()
  );
  const initialSortMatches = Boolean(initialData && isDefaultExpenseListSort(expenseSort));

  const readCachedCategories = React.useCallback(
    () => queryClient.getQueryData<string[]>(expenseCategoriesQueryKey),
    [queryClient]
  );
  const readCachedWorkers = React.useCallback(
    () => queryClient.getQueryData<WorkerRow[]>(workersQueryKey),
    [queryClient]
  );
  const [workers, setWorkers] = React.useState<WorkerRow[]>(
    () => readCachedWorkers() ?? initialData?.workers ?? []
  );
  const [subcontractDeductionOptions, setSubcontractDeductionOptions] = React.useState<
    SubcontractDeductionOption[]
  >(
    () =>
      queryClient.getQueryData<SubcontractDeductionOption[]>(subcontractDeductionOptionsQueryKey) ??
      initialData?.subcontractDeductionOptions ??
      []
  );
  const [expenses, setExpenses] = React.useState<Expense[]>(
    () =>
      queryClient.getQueryData<Expense[]>(buildExpensesQueryKey(readStoredExpenseSort())) ??
      (initialSortMatches ? initialData?.expenses : undefined) ??
      []
  );
  const [categoriesList, setCategoriesList] = React.useState<string[]>(
    () => readCachedCategories() ?? initialData?.categories ?? []
  );

  const {
    data: expensesQueryData,
    isPending: expensesQueryPending,
    isFetching: expensesQueryFetching,
    isError: expensesQueryError,
    status: expensesQueryStatus,
    refetch: refetchExpensesQuery,
  } = useQuery({
    queryKey: buildExpensesQueryKey(expenseSort),
    queryFn: () => fetchExpenses(expenseSort),
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
    initialData: initialSortMatches ? initialData?.expenses : undefined,
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
    initialData: initialData?.categories,
  });
  const { data: workersQueryData } = useQuery({
    queryKey: workersQueryKey,
    queryFn: fetchWorkers,
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
    initialData: initialData?.workers,
  });
  const { data: subcontractDeductionOptionsQueryData } = useQuery({
    queryKey: subcontractDeductionOptionsQueryKey,
    queryFn: fetchSubcontractDeductionOptions,
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
    initialData: initialData?.subcontractDeductionOptions,
  });

  const {
    data: projectsData,
    isError: projectsIsError,
    error: projectsQueryError,
  } = useQuery({
    queryKey: financialProjectsQueryKey,
    queryFn: async () => {
      const client = await loadBrowserSupabase();
      if (!client) throw new Error("Supabase is not configured.");
      return fetchFinancialProjects(client);
    },
    enabled: configured,
    placeholderData: keepPreviousData,
    staleTime: expenseListQueryStaleMs,
    refetchOnMount: false,
    initialData: initialData?.projects,
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
  React.useLayoutEffect(() => {
    if (subcontractDeductionOptionsQueryData === undefined) return;
    setSubcontractDeductionOptions(subcontractDeductionOptionsQueryData);
  }, [subcontractDeductionOptionsQueryData]);

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
  const [expenseDateFilter, setExpenseDateFilter] = React.useState<ExpenseDateFilterValue>(() =>
    defaultExpenseDateFilterForPool(pool)
  );
  const [sourceTypeFilter, setSourceTypeFilter] = React.useState("");
  const [activeExpenseId, setActiveExpenseId] = React.useState<string | null>(null);
  const selectedExpenseIdFromUrl = (searchParams.get("ops_record") ?? "").trim();
  const receiptEvidenceRequested = searchParams.get("ops_preview") === "receipt";
  const rowElsRef = React.useRef<Record<string, HTMLTableRowElement | HTMLLIElement | null>>({});
  const emptyExpensesRef = React.useRef<HTMLDivElement>(null);
  const listView: "all" | "unreviewed" = inboxMode ? "unreviewed" : "all";
  const focusExpenseIdParam = (searchParams.get("focusExpenseId") ?? "").trim();
  const issueParam = searchParams.get("issue");
  const expenseIssueFocus = React.useMemo<ExpenseIssueFocus | null>(() => {
    if (!focusExpenseIdParam || !isExpenseHeaderLineMismatchIssue(issueParam)) return null;
    return { expenseId: focusExpenseIdParam, issue: issueParam };
  }, [focusExpenseIdParam, issueParam]);

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
  const clearAdvancedFilters = React.useCallback(() => {
    setProjectFilter("");
    setCategoryFilter("");
    setSourceTypeFilter("");
    setExpenseDateFilter({ kind: "all" });
    setExpenseSort(defaultExpenseListSort);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("page", "1");
    router.push(`${listPath}?${sp.toString()}`, { scroll: false });
  }, [listPath, router, searchParams]);
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
    items: ExpenseReceiptApiItem[];
    index: number;
    expenseId: string;
  } | null>(null);
  const [quickExpenseOpen, setQuickExpenseOpen] = React.useState(
    () => searchParams.get("new_expense") === "1"
  );
  const [uploadReceiptsOpen, setUploadReceiptsOpen] = React.useState(false);

  /** Open directly from the user gesture; the modal itself suppresses early outside interactions on iOS. */
  const openUploadReceiptsModal = React.useCallback(() => {
    setUploadReceiptsOpen(true);
  }, []);
  React.useEffect(() => {
    if (searchParams.get("new_expense") === "1") setQuickExpenseOpen(true);
  }, [searchParams]);

  const setNewExpenseOpen = React.useCallback(
    (nextOpen: boolean) => {
      setQuickExpenseOpen(nextOpen);
      if (nextOpen || searchParams.get("new_expense") !== "1") return;
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("new_expense");
      const qs = sp.toString();
      router.replace(qs ? `${listPath}?${qs}` : listPath, { scroll: false });
    },
    [listPath, router, searchParams]
  );
  const [filtersDrawerOpen, setFiltersDrawerOpen] = React.useState(false);
  const [filtersPopoverOpen, setFiltersPopoverOpen] = React.useState(false);
  const receiptReplaceRef = React.useRef<HTMLInputElement>(null);
  const [receiptReplacing, setReceiptReplacing] = React.useState(false);
  const [previewExpense, setPreviewExpense] = React.useState<Expense | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewEnterMode, setPreviewEnterMode] = React.useState<"preview" | "edit">("preview");
  const [focusReviewOnOpen, setFocusReviewOnOpen] = React.useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = React.useState<string | null>(null);
  const expensesRef = React.useRef<Expense[]>([]);
  expensesRef.current = expenses;
  const previewExpenseRef = React.useRef<Expense | null>(null);
  previewExpenseRef.current = previewExpense;

  React.useEffect(() => {
    if (!previewOpen) return;

    const appScrollRoot = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    if (!appScrollRoot) return;

    const compactDetail = window.matchMedia("(max-width: 1023px)");
    const prior = {
      overflow: appScrollRoot.style.overflow,
      overflowY: appScrollRoot.style.overflowY,
      overscrollBehavior: appScrollRoot.style.overscrollBehavior,
      scrollTop: appScrollRoot.scrollTop,
    };
    let locked = false;

    const unlock = () => {
      if (!locked) return;
      appScrollRoot.style.overflow = prior.overflow;
      appScrollRoot.style.overflowY = prior.overflowY;
      appScrollRoot.style.overscrollBehavior = prior.overscrollBehavior;
      delete appScrollRoot.dataset.expenseDetailScrollLock;
      appScrollRoot.scrollTop = prior.scrollTop;
      locked = false;
    };

    const syncLock = () => {
      if (!compactDetail.matches) {
        unlock();
        return;
      }
      if (locked) return;
      prior.scrollTop = appScrollRoot.scrollTop;
      appScrollRoot.style.overflow = "hidden";
      appScrollRoot.style.overflowY = "hidden";
      appScrollRoot.style.overscrollBehavior = "none";
      appScrollRoot.dataset.expenseDetailScrollLock = "true";
      locked = true;
    };

    syncLock();
    compactDetail.addEventListener("change", syncLock);
    return () => {
      compactDetail.removeEventListener("change", syncLock);
      unlock();
    };
  }, [previewOpen]);

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

  /** Inbox triage summary from the same client-side list as the sidebar badge (no extra fetch). */
  const inboxReviewStats = React.useMemo(() => {
    const dup = expenseInboxDuplicateIdSet(expensesForListing, getExpenseTotal);
    let pending = 0;
    let missingReceipt = 0;
    let missingInfo = 0;
    for (const e of expensesForListing) {
      if (!expenseMatchesInboxPool(e, dup.has(e.id))) continue;
      pending += 1;
      if (expenseMissingReceiptForInbox(e)) missingReceipt += 1;
      if (!expenseHasRequiredProjectForWorkflow(e) || !expenseHasCategoryForWorkflow(e)) {
        missingInfo += 1;
      }
    }
    return { pending, missingReceipt, missingInfo };
  }, [expensesForListing]);
  const archivedExpenses = React.useMemo(
    () => expensesForListing.filter(expenseMatchesExpensesArchivePool),
    [expensesForListing]
  );

  const summary = React.useMemo(() => {
    const ym = `${hawaiiTodayYmd().slice(0, 7)}-`;
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
        const refQ =
          e.referenceNo &&
          !isInboxUploadExpenseReference(e.referenceNo) &&
          e.referenceNo.toLowerCase().includes(q);
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
  const focusedExpense = React.useMemo(() => {
    if (!expenseIssueFocus) return null;
    return (
      filteredSortedExpenses.find((expense) => expense.id === expenseIssueFocus.expenseId) ?? null
    );
  }, [expenseIssueFocus, filteredSortedExpenses]);
  const focusedDateGroupIndex = React.useMemo(() => {
    if (!expenseIssueFocus) return -1;
    return allDateGroups.findIndex((group) =>
      group.rows.some((expense) => expense.id === expenseIssueFocus.expenseId)
    );
  }, [allDateGroups, expenseIssueFocus]);
  const focusedDateKey =
    focusedDateGroupIndex >= 0 ? allDateGroups[focusedDateGroupIndex]?.dateKey : null;
  const forcedExpandedDateKeys = React.useMemo(
    () => (focusedDateKey ? new Set([focusedDateKey]) : null),
    [focusedDateKey]
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

  React.useEffect(() => {
    if (!expenseIssueFocus || focusedDateGroupIndex < 0) return;
    const targetPage = Math.floor(focusedDateGroupIndex / pageSize) + 1;
    if (targetPage !== curPage) setPage(targetPage);
  }, [curPage, expenseIssueFocus, focusedDateGroupIndex, pageSize, setPage]);

  React.useEffect(() => {
    const expenseId = expenseIssueFocus?.expenseId;
    if (!expenseId) return;
    const el = rowElsRef.current[expenseId];
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expenseIssueFocus?.expenseId, listRowIdsKey]);

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

  React.useEffect(() => {
    if (!inboxMode) return;
    const onOcrWriteback = (event: Event) => {
      const detail = (event as CustomEvent<InboxDraftOcrWritebackEventDetail>).detail;
      void refresh();
      if (detail?.ok === false) {
        toast({
          title: "Receipt needs review",
          description:
            detail.message ||
            "Receipt OCR could not safely update this draft. The receipt is still attached.",
          variant: "default",
        });
      }
    };
    window.addEventListener(INBOX_DRAFT_OCR_WRITEBACK_EVENT, onOcrWriteback);
    return () => window.removeEventListener(INBOX_DRAFT_OCR_WRITEBACK_EVENT, onOcrWriteback);
  }, [inboxMode, refresh, toast]);

  const receiptPreviewRef = React.useRef(receiptPreview);
  receiptPreviewRef.current = receiptPreview;
  const receiptPreviewSessionRef = React.useRef(0);
  const receiptPreviewItemsRef = React.useRef<ExpenseReceiptApiItem[]>([]);
  const receiptManifestCacheRef = React.useRef(new Map<string, ExpenseReceiptApiManifest>());
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

  const mapReceiptItemsToPreviewFiles = React.useCallback((items: ExpenseReceiptApiItem[]) => {
    return items.map((it) => ({
      url: it.signedUrl ?? "",
      fileName: it.fileName ?? "Receipt",
      fileType: (receiptItemLooksPdf(it) ? "pdf" : "image") as "pdf" | "image",
      mimeType: it.mimeType,
    }));
  }, []);

  const onReceiptReplaceInputChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const rp = receiptPreviewRef.current;
      const selected = rp?.items[rp.index];
      if (!file || !rp?.expenseId || !selected || receiptReplacing) return;
      setReceiptReplacing(true);
      try {
        const replaced = await replaceExpenseReceipt({
          expenseId: rp.expenseId,
          file,
          item: selected,
        });
        const nextItems = rp.items.map((item, index) => (index === rp.index ? replaced : item));
        receiptPreviewItemsRef.current = nextItems;
        receiptManifestCacheRef.current.delete(rp.expenseId);
        setReceiptPreview((p) =>
          p
            ? {
                ...p,
                items: p.items.map((item, index) => (index === p.index ? replaced : item)),
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
    [mapReceiptItemsToPreviewFiles, patchPreview, receiptReplacing, refresh, toast]
  );

  const prefetchReceiptUrls = React.useCallback((row: Expense) => {
    const raw = getExpenseReceiptItems(row);
    if (raw.length === 0) return;
    const cached = receiptManifestCacheRef.current.get(row.id);
    if (cached && Date.parse(cached.expiresAt) > Date.now() + 30_000) return;
    void fetchExpenseReceiptManifest(row.id)
      .then((manifest) => {
        receiptManifestCacheRef.current.set(row.id, manifest);
      })
      .catch(() => undefined);
  }, []);

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
      const projectNames = Array.from(
        new Set(
          [row.headerProjectId, ...row.lines.map((line) => line.projectId)]
            .filter((projectId): projectId is string => Boolean(projectId))
            .map((projectId) => projectNameById.get(projectId) ?? projectId)
        )
      );

      setReceiptPreview({ items: [], index: 0, expenseId: row.id });
      receiptPreviewItemsRef.current = [];
      const previewSession = ++receiptPreviewSessionRef.current;

      const resolveAndPatch = (forceRefresh = false) => {
        const cached = receiptManifestCacheRef.current.get(row.id);
        const manifestPromise =
          !forceRefresh && cached && Date.parse(cached.expiresAt) > Date.now() + 30_000
            ? Promise.resolve(cached)
            : fetchExpenseReceiptManifest(row.id);
        return manifestPromise
          .then((manifest) => {
            if (receiptPreviewSessionRef.current !== previewSession) return;
            receiptManifestCacheRef.current.set(row.id, manifest);
            receiptPreviewItemsRef.current = manifest.items;
            patchPreviewRef.current({
              files: mapReceiptItemsToPreviewFiles(manifest.items),
              showReplace: true,
            });
            setReceiptPreview((p) =>
              p && p.expenseId === row.id ? { ...p, items: manifest.items } : p
            );
            return manifest;
          })
          .catch(() => {
            if (receiptPreviewSessionRef.current !== previewSession) return;
            patchPreviewRef.current({
              files: buildReceiptPreviewShellFiles(raw).map((f, i) => ({
                ...f,
                fileType: (receiptItemLooksPdf(raw[i]!) ? "pdf" : "image") as "pdf" | "image",
                pendingSignedUrl: false,
                signedUrlResolveFailed: true,
              })),
              showReplace: false,
            });
            return undefined;
          });
      };

      openPreview({
        files: shellFiles,
        initialIndex: 0,
        isLoading: false,
        presentation: {
          kind: "receipt",
          metadata: {
            merchant: normalizedVendorLabel(row.vendorName),
            expenseDate: formatDate(row.date),
            amount: formatCurrency(getExpenseTotal(row)),
            project: projectNames.join(", "),
            category: Array.from(
              new Set(row.lines.map((line) => line.category.trim()).filter(Boolean))
            ).join(", "),
            paymentSource: row.paymentAccountName || row.paymentMethod,
            status: expenseStatusUiLabel(row.status),
          },
        },
        onRetrySignedUrlResolve: () => {
          patchPreviewRef.current({
            files: buildReceiptPreviewShellFiles(raw).map((f, i) => ({
              ...f,
              fileType: (receiptItemLooksPdf(raw[i]!) ? "pdf" : "image") as "pdf" | "image",
              pendingSignedUrl: needsResolve,
              signedUrlResolveFailed: false,
            })),
            showReplace: false,
          });
          void resolveAndPatch(true);
        },
        onIndexChange: (i: number) => {
          setReceiptPreview((p) => (p ? { ...p, index: i } : p));
        },
        showReplace: false,
        replaceInputRef: receiptReplaceRef,
        replaceBusy: receiptReplacing,
        onReplaceClick: () => receiptReplaceRef.current?.click(),
        onReplaceInputChange: onReceiptReplaceInputChange,
        onRefreshPreviewUrl: async () => {
          const rp = receiptPreviewRef.current;
          if (!rp) return null;
          const manifest = await resolveAndPatch(true);
          if (!manifest) return null;
          const nextFiles = mapReceiptItemsToPreviewFiles(manifest.items);
          const u = (nextFiles[rp.index]?.url ?? "").trim();
          return u || null;
        },
        onClosed: () => {
          receiptPreviewSessionRef.current += 1;
          setReceiptPreview(null);
        },
      });

      void resolveAndPatch();
    },
    [
      toast,
      openPreview,
      receiptReplacing,
      onReceiptReplaceInputChange,
      mapReceiptItemsToPreviewFiles,
      projectNameById,
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
      const target = expensesRef.current.find((e) => e.id === payload.expenseId);
      if (!target) return null;
      const merged = mergeExpenseReviewPatch(target, payload);
      const t0 = uiActionMark();
      try {
        const pmTrim =
          payload.paymentMethod.trim() || (target.paymentMethod ?? "").trim() || "Cash";
        await saveExpenseReviewViaApi({
          expenseId: payload.expenseId,
          date: payload.date,
          vendorName: payload.vendorName,
          amount: payload.amount,
          projectId: payload.projectId,
          workerId: payload.workerId,
          category: payload.category,
          notes: payload.notes,
          status: payload.status,
          sourceType: payload.sourceType,
          paymentAccountId: payload.paymentAccountId,
          paymentMethod: pmTrim,
          subcontractDeduction: payload.subcontractDeduction,
        });
        let final: Expense = merged;
        if (pmTrim) final = { ...final, paymentMethod: pmTrim };
        flushSync(() => {
          setExpenses((prev) => prev.map((e) => (e.id === payload.expenseId ? final : e)));
          setPreviewExpense(final);
        });
        uiActionLog("expense-preview-save-ui", t0, 100);
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
      } catch (error) {
        hotToast.error(error instanceof Error ? error.message : "Failed to save expense");
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
    async (expense: Expense): Promise<boolean> => {
      const inboxRef = isInboxUploadExpenseReference(expense.referenceNo);
      const gate = inboxRef
        ? validateApproveInboxUploadDraft(expense)
        : validateMarkDoneRequiresProjectAndCategory(expense);
      if (gate === "project") {
        hotToast.error("Please select a project before marking as done");
        return false;
      }
      if (gate === "category") {
        hotToast.error("Please select a category before marking as done");
        return false;
      }
      if (gate === "payment") {
        hotToast.error("Please select a payment account before approving");
        return false;
      }
      if (gate === "worker") {
        hotToast.error("Please select a worker before approving reimbursement");
        return false;
      }
      if (inboxRef && String(expense.status ?? "").toLowerCase() === "approved") {
        hotToast.error("Already approved");
        return false;
      }
      const targetStatus = inboxRef ? ("approved" as const) : ("reviewed" as const);
      const prevList = expensesRef.current;
      flushSync(() => {
        setExpenses((list) =>
          list.map((e) => (e.id === expense.id ? { ...e, status: targetStatus } : e))
        );
      });
      try {
        const saved = inboxRef
          ? await approveInboxDraftViaApi(expense.id)
          : await updateExpenseForReviewLazy(expense.id, { status: targetStatus });
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
        return true;
      } catch {
        flushSync(() => setExpenses(prevList));
        hotToast.error("Status update failed");
        return false;
      }
    },
    [queryClient]
  );

  const openExpensePreview = React.useCallback(
    (row: Expense, opts?: { mode?: "preview" | "edit"; focusReview?: boolean }) => {
      setPreviewExpense(row);
      setPreviewEnterMode(opts?.mode ?? "preview");
      setFocusReviewOnOpen(Boolean(opts?.focusReview));
      setPreviewOpen(true);
      setActiveExpenseId(row.id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("ops_record", row.id);
      params.delete("ops_preview");
      router.push(`${listPath}?${params.toString()}`, { scroll: false });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          rowElsRef.current[row.id]?.scrollIntoView({ block: "nearest" });
        });
      });
    },
    [listPath, router, searchParams]
  );

  const closeExpenseWorkspaceDetail = React.useCallback(() => {
    setPreviewOpen(false);
    setPreviewExpense(null);
    setActiveExpenseId(null);
    setFocusReviewOnOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ops_record");
    params.delete("ops_preview");
    const query = params.toString();
    router.push(query ? `${listPath}?${query}` : listPath, { scroll: false });
  }, [listPath, router, searchParams]);

  const updateWorkspaceReceiptContext = React.useCallback(
    (open: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (open) params.set("ops_preview", "receipt");
      else params.delete("ops_preview");
      router.replace(`${listPath}?${params.toString()}`, { scroll: false });
    },
    [listPath, router, searchParams]
  );

  React.useEffect(() => {
    if (!selectedExpenseIdFromUrl) {
      setPreviewOpen(false);
      setPreviewExpense(null);
      setActiveExpenseId(null);
      return;
    }
    const selected = expensesForListing.find((expense) => expense.id === selectedExpenseIdFromUrl);
    if (!selected) return;
    setActiveExpenseId(selected.id);
    setPreviewExpense((current) => (current?.id === selected.id ? current : selected));
    setPreviewOpen(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        rowElsRef.current[selected.id]?.scrollIntoView({ block: "nearest" });
      });
    });
  }, [expensesForListing, selectedExpenseIdFromUrl]);

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
          await deleteExpenseViaApi(expense.id);
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
        } catch (error) {
          setExpenses(prev);
          toast({
            title: "Delete failed",
            description: error instanceof Error ? error.message : "Failed to delete expense.",
            variant: "error",
          });
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
        if (gate === "worker") {
          hotToast.error("Please select a worker before approving reimbursement");
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
          const saved =
            inboxRef && next === "approved"
              ? await approveInboxDraftViaApi(expense.id)
              : await updateExpenseForReviewLazy(expense.id, { status: next });
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
    initialData?.paymentAccounts ?? []
  );
  React.useEffect(() => {
    if (initialData?.paymentAccounts) return;
    void loadPaymentAccounts()
      .then(setPaymentAccountsForBulk)
      .catch(() => setPaymentAccountsForBulk([]));
  }, [initialData?.paymentAccounts]);

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
            const saved = inboxRef
              ? await approveInboxDraftViaApi(id)
              : await updateExpenseForReviewLazy(id, { status: targetStatus });
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
          const saved = await updateExpenseForReviewLazy(id, { projectId });
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
          const saved = await updateExpenseForReviewLazy(id, { category });
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
          const saved = await updateExpenseForReviewLazy(id, { paymentAccountId });
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
          await deleteExpenseViaApi(id);
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
      } catch (error) {
        setExpenses(prev);
        toast({
          title: "Delete failed",
          description: error instanceof Error ? error.message : "Failed to delete expense.",
          variant: "error",
        });
        return false;
      } finally {
        setBulkBusy(false);
      }
    },
    [queryClient, toast]
  );

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
  const focusedIssueNotFound = Boolean(
    expenseIssueFocus && expensesQueryStatus === "success" && !focusedExpense
  );

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

  const previewExpenseLive = React.useMemo(() => {
    if (!previewExpense) return null;
    return expenses.find((e) => e.id === previewExpense.id) ?? previewExpense;
  }, [expenses, previewExpense]);

  const selectWorkspaceExpense = React.useCallback(
    (expense: Expense, history: "push" | "replace" = "push") => {
      setPreviewExpense(expense);
      setPreviewEnterMode("preview");
      setFocusReviewOnOpen(false);
      setPreviewOpen(true);
      setActiveExpenseId(expense.id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("ops_record", expense.id);
      params.delete("ops_preview");
      const href = `${listPath}?${params.toString()}`;
      if (history === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [listPath, router, searchParams]
  );

  const previewModalNav = React.useMemo(() => {
    if (!previewOpen || !previewExpenseLive) return undefined;
    const idx = filteredSortedExpenses.findIndex((r) => r.id === previewExpenseLive.id);
    if (idx < 0) return undefined;
    return {
      canPrev: idx > 0,
      canNext: idx < filteredSortedExpenses.length - 1,
      queuePosition: `${idx + 1} of ${filteredSortedExpenses.length}`,
      onPrev: () => {
        const prev = filteredSortedExpenses[idx - 1];
        if (prev) selectWorkspaceExpense(prev);
      },
      onNext: () => {
        const next = filteredSortedExpenses[idx + 1];
        if (next) selectWorkspaceExpense(next, "replace");
      },
    };
  }, [previewOpen, previewExpenseLive, filteredSortedExpenses, selectWorkspaceExpense]);

  const previewPossibleDuplicate =
    previewExpenseLive != null && possibleDuplicateIds.has(previewExpenseLive.id);
  const previewIssueFocus =
    previewExpenseLive && expenseIssueFocus?.expenseId === previewExpenseLive.id
      ? expenseIssueFocus
      : null;

  const pageTitle = inboxMode ? "Receipt Inbox" : "Expenses";
  const pageDescription = inboxMode
    ? "Review uploaded receipts and draft expenses"
    : "Tracked project costs and completed expenses";

  return (
    <div
      className={financeOsPageWrap}
      data-expense-depth-system="l0-l5"
      data-expenses-query-status={expensesQueryStatus}
      data-expenses-list-page={inboxMode ? "inbox" : "expenses"}
      data-expense-workspace-detail-open={previewOpen ? "true" : "false"}
    >
      <div
        className={cn(
          "expenses-ui-content page-shell-wide mx-auto w-full min-w-0 max-w-none px-3 py-3 md:px-6 xl:max-w-[1440px] xl:px-8",
          inboxMode ? "md:pb-7 md:pt-3" : "md:py-8"
        )}
      >
        <ExpenseOperationsWorkspaceNav className="mb-2 md:mb-3" />
        {inboxMode ? <ReceiptInboxSourceNav className="mb-2 md:mb-3" /> : null}
        <div
          className={cn(
            "max-md:pb-1",
            inboxMode ? "space-y-2 md:space-y-2.5" : "space-y-3 md:space-y-4"
          )}
        >
          <div
            data-expense-surface-header="mobile"
            className={cn(
              "flex items-start justify-between gap-3 md:hidden",
              inboxMode ? "pb-2" : "pb-3"
            )}
          >
            <div className="min-w-0 flex-1">
              <h1 className="text-hh-page-title tracking-normal text-[var(--hh-text-primary)]">
                {pageTitle}
              </h1>
              <p
                className={cn(
                  "text-hh-status leading-snug text-[var(--hh-text-secondary)]",
                  inboxMode ? "mt-0.5 line-clamp-2" : "mt-1 hidden sm:line-clamp-2"
                )}
              >
                {pageDescription}
              </p>
            </div>
            <TransactionInboxEntryActions
              onQuick={() => setQuickExpenseOpen(true)}
              onUpload={openUploadReceiptsModal}
              compact
              className="shrink-0 justify-end"
            />
          </div>

          {inboxMode ? (
            <div
              data-inbox-queue-summary
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--hh-border)] pb-2 md:-mt-1 md:pb-2"
              aria-label="Inbox queue summary"
            >
              <span
                data-inbox-queue-state="pending"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-hh-status text-[var(--hh-text-secondary)]"
              >
                <span className="font-semibold tabular-nums text-[var(--hh-text-primary)]">
                  {inboxReviewStats.pending}
                </span>
                pending
              </span>
              <span
                data-inbox-queue-state="missing-info"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-hh-status text-[var(--hh-text-secondary)]"
              >
                <span className="font-semibold tabular-nums text-[var(--hh-text-primary)]">
                  {inboxReviewStats.missingInfo}
                </span>
                missing info
              </span>
              <span
                data-inbox-queue-state="missing-receipt"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-hh-status text-[var(--hh-warning)]"
              >
                <span className="font-semibold tabular-nums text-[var(--hh-text-primary)]">
                  {inboxReviewStats.missingReceipt}
                </span>
                no receipt
              </span>
            </div>
          ) : null}

          <div
            data-expense-surface-header="desktop"
            className={cn("hidden md:block", inboxMode && "-mt-0.5")}
          >
            <PageHeader
              className={cn(
                "border-b-0 pb-3 [&_h1]:!text-hh-page-title [&_h1]:!tracking-normal [&_p]:!mt-1 [&_p]:!max-w-xl [&_p]:!text-hh-body",
                inboxMode ? "gap-2 lg:items-baseline lg:gap-x-4 lg:gap-y-2" : "gap-3"
              )}
              title={pageTitle}
              description={pageDescription}
              actions={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <TransactionInboxEntryActions
                    onQuick={() => setQuickExpenseOpen(true)}
                    onUpload={openUploadReceiptsModal}
                  />
                </div>
              }
            />
          </div>

          {inboxMode ? (
            <section
              data-inbox-decision-brief
              aria-label="Expense decision brief"
              className="-mt-0.5 overflow-hidden border-y border-[var(--hh-border)] bg-transparent text-[var(--hh-text-primary)] md:-mt-1"
            >
              <dl className="grid grid-cols-2 md:grid-cols-4">
                {[
                  {
                    label: "In queue",
                    value: String(summary.inboxQueueCount),
                    amount: false,
                  },
                  { label: "This Month", value: formatCurrency(summary.monthTotal), amount: true },
                  {
                    label: archiveMode ? "Total (archived)" : "Total (all)",
                    value: formatCurrency(summary.allTotal),
                    amount: true,
                  },
                  {
                    label: "Reimbursements",
                    value: formatCurrency(summary.reimbursementTotal),
                    amount: true,
                  },
                ].map((metric, index) => (
                  <div
                    key={metric.label}
                    className={cn(
                      "min-w-0 px-3 py-2 md:px-3.5 md:py-2.5",
                      index % 2 === 1 && "border-l border-[var(--hh-border)]",
                      index >= 2 && "border-t border-[var(--hh-border)] md:border-t-0",
                      index >= 1 && "md:border-l md:border-[var(--hh-border)]"
                    )}
                  >
                    <dt className="truncate text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                      {metric.label}
                    </dt>
                    <dd className="mt-1 truncate text-hh-body font-semibold tabular-nums leading-none">
                      {metric.amount ? <NeoAmount>{metric.value}</NeoAmount> : metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : (
            <section
              data-expenses-kpi-strip
              aria-label="Expense summary"
              className="overflow-x-auto rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational"
            >
              <dl className="flex min-w-max items-stretch">
                {[
                  { label: "Archived", value: String(summary.archivedCount), amount: false },
                  { label: "This month", value: formatCurrency(summary.monthTotal), amount: true },
                  {
                    label: archiveMode ? "Archived total" : "All expenses",
                    value: formatCurrency(summary.allTotal),
                    amount: true,
                  },
                  {
                    label: "Reimbursements",
                    value: formatCurrency(summary.reimbursementTotal),
                    amount: true,
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="flex min-w-40 flex-1 items-baseline justify-between gap-3 px-3 py-2.5 md:min-w-44 md:px-4"
                  >
                    <dt className="whitespace-nowrap text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                      {metric.label}
                    </dt>
                    <dd className="whitespace-nowrap text-sm font-semibold tabular-nums leading-none md:text-hh-body">
                      {metric.amount ? <NeoAmount>{metric.value}</NeoAmount> : metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Mobile: search + filters drawer (pool switch lives in header) */}
          <NeoToolbar className="flex-row items-center gap-2 p-2 md:hidden">
            <div
              data-expenses-list-toolbar={!inboxMode ? "mobile" : undefined}
              className="relative min-w-0 flex-1"
            >
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]"
                aria-hidden
              />
              <Input
                type={inboxMode ? "text" : "search"}
                aria-label="Search expenses"
                placeholder="Merchant, description, project…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-11 min-h-11 w-full rounded-lg border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] pl-9 pr-11 text-base text-[var(--hh-text-primary)] shadow-none placeholder:text-[var(--hh-text-tertiary)] focus-visible:border-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)]"
              />
              {searchInput ? (
                <button
                  type="button"
                  aria-label="Clear expense search"
                  className="absolute right-0 top-0 flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-[var(--hh-text-tertiary)] outline-none hover:text-[var(--hh-text-primary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--hh-focus-ring)]"
                  onClick={() => setSearchInput("")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="relative h-11 min-h-11 w-[5.75rem] shrink-0 gap-1 rounded-lg border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2 text-[var(--hh-text-primary)] shadow-none transition-colors duration-150 hover:bg-[var(--hh-l3-hover)]"
              onClick={() => setFiltersDrawerOpen(true)}
            >
              <Filter className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate text-xs font-medium">
                Filters
                {activeAdvancedFilterCount > 0 ? (
                  <span
                    data-expenses-active-filter-count
                    className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--hh-l3-selected)] px-1 text-hh-status tabular-nums text-[var(--hh-text-secondary)]"
                  >
                    {activeAdvancedFilterCount}
                  </span>
                ) : null}
              </span>
            </Button>
          </NeoToolbar>
          <Sheet open={filtersDrawerOpen} onOpenChange={setFiltersDrawerOpen}>
            <SheetContent
              side="bottom"
              data-expense-component-surface="filters"
              className="expenses-ui-dialog max-h-[90vh] overflow-y-auto rounded-t-[14px] p-4 md:hidden"
            >
              <SheetHeader className="flex-row items-center justify-between gap-3 pr-11 text-left">
                <div>
                  <SheetTitle className="text-base font-semibold">Expense filters</SheetTitle>
                  <p className="mt-0.5 text-xs text-[var(--hh-text-secondary)]">
                    Narrow the current queue without leaving context.
                  </p>
                </div>
                {activeAdvancedFilterCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 min-h-11 shrink-0 px-2 text-xs"
                    onClick={clearAdvancedFilters}
                  >
                    Clear
                  </Button>
                ) : null}
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-4 pb-8">
                <div className="flex flex-col gap-2 border-b border-[var(--hh-border)] pb-4">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className={cn(
                      financePrimaryActionClass,
                      "h-10 w-full shrink-0 rounded-md shadow-none"
                    )}
                    onClick={() => {
                      setQuickExpenseOpen(true);
                      setFiltersDrawerOpen(false);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                    New Expense
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      OS.secondaryButton,
                      "h-10 w-full shrink-0 rounded-md shadow-none"
                    )}
                    onClick={() => {
                      setFiltersDrawerOpen(false);
                      openUploadReceiptsModal();
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                    Upload receipt
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
                  selectTriggerClassName="h-10 w-full rounded-md border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-xs text-[var(--hh-text-primary)] shadow-none"
                />
                <Button
                  type="button"
                  className={cn(financePrimaryActionClass, "w-full")}
                  onClick={() => setFiltersDrawerOpen(false)}
                >
                  Done
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <div
            data-expense-operations-workspace=""
            data-receipt-inbox-workspace={inboxMode ? "" : undefined}
            data-expense-detail-open={previewOpen ? "true" : "false"}
            className="expense-operations-workspace"
          >
            <section
              data-expenses-ledger=""
              className={cn(
                "relative min-w-0",
                expensesListRefetching &&
                  expensesForListing.length > 0 &&
                  "pointer-events-none opacity-60"
              )}
              aria-busy={expensesListRefetching && expensesForListing.length > 0 ? true : undefined}
            >
              {expensesListRefetching && expensesForListing.length > 0 ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex justify-center pt-1">
                  <LoadingState
                    text="Updating..."
                    className="rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-1 text-xs shadow-operational"
                  />
                </div>
              ) : null}

              {/* Filters + table: Finance OS card shell */}
              <NeoPanel
                data-inbox-queue-surface={inboxMode ? "" : undefined}
                className={cn(financeOsListShell, "expense-operations-ledger-panel")}
                bodyClassName="contents"
              >
                <NeoToolbar
                  data-inbox-toolbar={inboxMode ? "" : undefined}
                  className="hidden flex-wrap items-center justify-between gap-3 rounded-none border-0 border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-3 shadow-none md:flex"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={financeToolbarButtonClass}
                      onClick={() =>
                        startTransition(() =>
                          router.push(inboxMode ? "/financial/expenses" : "/financial/inbox")
                        )
                      }
                    >
                      {inboxMode ? "Expenses" : "Inbox draft"}
                    </Button>
                  </div>
                  <div
                    data-expenses-list-toolbar={!inboxMode ? "desktop" : undefined}
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 lg:max-w-xl"
                  >
                    <div className="relative min-w-[12rem] max-w-md flex-1">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--hh-text-tertiary)]"
                        aria-hidden
                      />
                      <Input
                        type={inboxMode ? "text" : "search"}
                        aria-label="Search expenses"
                        placeholder="Merchant, description, project…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="h-9 rounded-lg border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] py-1 pl-8 pr-14 text-sm text-[var(--hh-text-primary)] shadow-none placeholder:text-[var(--hh-text-tertiary)] transition-[border-color] duration-150 focus-visible:border-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)]"
                      />
                      {searchInput ? (
                        <button
                          type="button"
                          aria-label="Clear expense search"
                          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--hh-text-tertiary)] outline-none hover:text-[var(--hh-text-primary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--hh-focus-ring)]"
                          onClick={() => setSearchInput("")}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : (
                        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-1.5 py-0.5 font-sans text-hh-status font-medium text-[var(--hh-text-tertiary)] lg:inline">
                          ⌘K
                        </kbd>
                      )}
                    </div>
                    <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(financeToolbarButtonClass, "gap-1.5 px-3")}
                        >
                          <Filter className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="text-xs font-medium">
                            Filters
                            {activeAdvancedFilterCount > 0 ? (
                              <span
                                data-expenses-active-filter-count
                                className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--hh-l3-selected)] px-1 text-hh-status tabular-nums text-[var(--hh-text-secondary)]"
                              >
                                {activeAdvancedFilterCount}
                              </span>
                            ) : null}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        sideOffset={8}
                        data-expense-component-surface="filters"
                        className="expenses-ui-dialog z-50 w-[min(calc(100vw-2rem),22rem)] overflow-visible rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 text-[var(--hh-text-primary)] shadow-operational"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--hh-border)] pb-2.5">
                          <div>
                            <p className="text-xs font-semibold text-[var(--hh-text-primary)]">
                              Expense filters
                            </p>
                            <p className="mt-0.5 text-hh-status text-[var(--hh-text-tertiary)]">
                              Refine the current queue
                            </p>
                          </div>
                          {activeAdvancedFilterCount > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 shrink-0 px-2 text-hh-status"
                              onClick={clearAdvancedFilters}
                            >
                              Clear
                            </Button>
                          ) : null}
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
                          selectTriggerClassName="h-9 w-full rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-xs text-[var(--hh-text-primary)] shadow-none transition-colors duration-150"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </NeoToolbar>
                {inboxMode ? (
                  <p
                    data-inbox-shortcuts
                    className="hidden border-b border-[var(--hh-border)] px-4 py-2 text-hh-status leading-snug text-[var(--hh-text-secondary)] md:block"
                  >
                    ⌘/Ctrl+Enter: approve &amp; next · ⌘/Ctrl+S: save · Tab: field · Esc: protect
                    changes
                  </p>
                ) : null}
                {focusedIssueNotFound ? (
                  <div
                    data-testid="expense-focus-not-found"
                    className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2.5 text-sm text-[var(--hh-text-secondary)]"
                    role="status"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hh-warning)]"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--hh-text-primary)]">
                        Expense issue not found on this page.
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--hh-text-secondary)]">
                        Try clearing filters.
                      </p>
                    </div>
                  </div>
                ) : null}
                {expensesQueryError && expensesQueryData === undefined ? (
                  <div
                    data-expenses-error
                    role="alert"
                    aria-live="assertive"
                    className="flex min-h-56 flex-col items-start justify-center gap-4 border-t border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-5 py-10 text-left md:min-h-72 md:flex-row md:items-center md:justify-center md:px-8"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border-strong)] bg-[var(--hh-l3-hover)] text-[var(--hh-action-primary)]">
                      <AlertCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0 max-w-md flex-1 md:flex-none">
                      <p className="text-sm font-semibold text-[var(--hh-text-primary)]">
                        Expenses couldn’t load
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--hh-text-secondary)]">
                        The ledger is unavailable right now. No expense totals or empty results are
                        being inferred.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(financeToolbarButtonClass, "h-11 min-h-11 md:h-9 md:min-h-0")}
                      onClick={() => void refetchExpensesQuery()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : showExpensesSkeleton && expenses.length === 0 ? (
                  <div className="border-t border-[var(--hh-border)] px-4 py-8 md:border-t-0">
                    <ExpensesListSkeleton
                      rows={8}
                      showStatCards={false}
                      mode={inboxMode ? "default" : "ledger"}
                    />
                  </div>
                ) : total === 0 ? (
                  <>
                    <div
                      className="hidden min-h-[280px] flex-col justify-center border-t border-[var(--hh-border)] px-6 py-14 text-center md:flex"
                      tabIndex={-1}
                      data-expenses-empty
                    >
                      <EmptyState
                        className="mx-auto max-w-md border-[var(--hh-border-strong)] bg-[var(--hh-l3-hover)] px-8 py-10"
                        title={
                          inboxMode &&
                          !hasNarrowingFilters &&
                          expensesForListing.length > 0 &&
                          summary.inboxQueueCount === 0
                            ? "Inbox clear — all drafts reviewed"
                            : "No transactions found"
                        }
                        description={
                          inboxMode
                            ? hasNarrowingFilters
                              ? "Try clearing filters or search."
                              : expensesForListing.length === 0
                                ? "Add an expense to get started."
                                : summary.inboxQueueCount === 0
                                  ? "Open Expenses to view archived costs."
                                  : "No matching items."
                            : hasNarrowingFilters
                              ? "Adjust filters or search."
                              : expensesForListing.length === 0
                                ? "Add an expense to get started."
                                : summary.archivedCount === 0
                                  ? "No archived expenses yet. Mark items done from Inbox."
                                  : "No matching archived expenses."
                        }
                        action={
                          showEmptyOnboardingCtas ? (
                            <TransactionInboxEntryActions
                              onQuick={() => setQuickExpenseOpen(true)}
                              onUpload={openUploadReceiptsModal}
                              className="justify-center"
                            />
                          ) : inboxMode &&
                            !hasNarrowingFilters &&
                            expensesForListing.length > 0 &&
                            summary.inboxQueueCount === 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={financeToolbarButtonClass}
                              onClick={() => router.push("/financial/expenses")}
                            >
                              View Expenses
                            </Button>
                          ) : archiveMode && !hasNarrowingFilters && summary.archivedCount === 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={financeToolbarButtonClass}
                              onClick={() => router.push("/financial/inbox")}
                            >
                              Open Inbox
                            </Button>
                          ) : null
                        }
                      />
                    </div>
                    <EmptyState
                      className="mx-2 mb-2 border-[var(--hh-border-strong)] bg-[var(--hh-l3-hover)] px-4 py-10 md:hidden"
                      tabIndex={-1}
                      data-expenses-empty-mobile
                      icon={<Upload className="h-5 w-5" aria-hidden />}
                      title={
                        inboxMode &&
                        !hasNarrowingFilters &&
                        expensesForListing.length > 0 &&
                        summary.inboxQueueCount === 0
                          ? "Inbox clear — all drafts reviewed"
                          : "No transactions found"
                      }
                      description={
                        inboxMode
                          ? hasNarrowingFilters
                            ? "Try filters or search."
                            : expensesForListing.length === 0
                              ? "Add an expense to get started."
                              : summary.inboxQueueCount === 0
                                ? "Open Expenses for archived costs."
                                : "No matching items."
                          : hasNarrowingFilters
                            ? "Adjust filters or search."
                            : expensesForListing.length === 0
                              ? "Add an expense to get started."
                              : summary.archivedCount === 0
                                ? "Nothing archived yet. Use Inbox."
                                : "No matching archived expenses."
                      }
                      action={
                        showEmptyOnboardingCtas ? (
                          <TransactionInboxEntryActions
                            onQuick={() => setQuickExpenseOpen(true)}
                            onUpload={openUploadReceiptsModal}
                            quickButtonSize="default"
                            className="max-w-full justify-center gap-1"
                          />
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
                        ) : null
                      }
                    />
                  </>
                ) : (
                  <>
                    <div
                      data-expenses-ledger-body
                      className="w-full min-h-0 overflow-hidden bg-[var(--hh-l2-operational-surface)]"
                    >
                      <ExpenseInboxTransactionList
                        dateChunks={visibleDateGroups}
                        possibleDuplicateIds={possibleDuplicateIds}
                        bulkActions={bulkActionsApi}
                        api={{
                          listView,
                          dateGroupPool: inboxMode ? "inbox" : "expenses",
                          autoExpandDateGroups: autoExpandDateGroupsForHighlight,
                          forceExpandedDateKeys: forcedExpandedDateKeys,
                          expenseIssueFocus,
                          focusedExpenseId: expenseIssueFocus?.expenseId ?? null,
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
                    <div
                      data-inbox-pagination={inboxMode ? "" : undefined}
                      data-expenses-pagination={!inboxMode ? "" : undefined}
                      className="flex flex-col gap-3 border-t border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-3 text-xs text-[var(--hh-text-secondary)] md:flex-row md:items-center md:justify-between md:gap-4"
                    >
                      <p
                        data-expenses-pagination-summary
                        className="shrink-0 whitespace-nowrap tabular-nums"
                      >
                        {total === 0
                          ? "Showing 0 results"
                          : `Groups ${groupDeskStart}–${groupDeskEnd}/${totalDateGroups} · ${total} expenses`}
                      </p>
                      <div
                        data-expenses-pagination-controls
                        className="flex flex-wrap items-center gap-3 md:gap-4"
                      >
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-11 min-h-11 w-11 min-w-11 shrink-0 border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-0 text-[var(--hh-text-primary)] shadow-none transition-colors duration-150 hover:bg-[var(--hh-l3-hover)] md:h-7 md:min-h-0 md:w-7 md:min-w-0"
                            disabled={curPage <= 1}
                            aria-label="Previous page"
                            onClick={() => setPage(curPage - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="min-w-[2rem] text-center tabular-nums text-foreground">
                            {curPage}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-11 min-h-11 w-11 min-w-11 shrink-0 border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-0 text-[var(--hh-text-primary)] shadow-none transition-colors duration-150 hover:bg-[var(--hh-l3-hover)] md:h-7 md:min-h-0 md:w-7 md:min-w-0"
                            disabled={curPage >= totalPages}
                            aria-label="Next page"
                            onClick={() => setPage(curPage + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap text-[var(--hh-text-secondary)]">
                            Groups/page
                          </span>
                          <Select
                            value={String(pageSize)}
                            onValueChange={(v) => setPageSizeAndReset(Number(v))}
                          >
                            <SelectTrigger className="h-11 min-h-11 w-[4.25rem] rounded-lg border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-xs shadow-none transition-colors duration-150 md:h-7 md:min-h-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent
                              className="expenses-ui-dialog"
                              data-expense-component-surface="select"
                            >
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
              </NeoPanel>
            </section>

            {previewOpen ? (
              <ExpenseInboxPreviewModal
                expense={previewExpenseLive}
                open={previewOpen}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) closeExpenseWorkspaceDetail();
                }}
                enterMode={previewEnterMode}
                presentation="panel"
                evidenceFirst={inboxMode}
                focusReviewOnOpen={focusReviewOnOpen}
                projects={safeProjects}
                workers={workers}
                subcontractDeductionOptions={subcontractDeductionOptions}
                projectNameById={projectNameById}
                supabase={supabase}
                setCategoriesList={setCategoriesList}
                onSave={handlePreviewModalSave}
                onSaveAndNext={previewModalNav?.canNext ? previewModalNav.onNext : undefined}
                receiptEvidenceRequested={receiptEvidenceRequested}
                onReceiptEvidenceChange={updateWorkspaceReceiptContext}
                onMarkReviewed={handlePreviewMarkReviewed}
                onAttachmentsUpdated={handlePreviewAttachmentsUpdated}
                previewNav={previewModalNav}
                possibleDuplicate={previewPossibleDuplicate}
                issueContext={previewIssueFocus}
              />
            ) : null}
          </div>
        </div>

        {quickExpenseOpen ? (
          <QuickExpenseModal
            open={quickExpenseOpen}
            onOpenChange={setNewExpenseOpen}
            onSuccess={refresh}
            projects={safeProjects}
            subcontractDeductionOptions={subcontractDeductionOptions}
            expenses={expensesForListing}
          />
        ) : null}
        <UploadReceiptsQueueModal
          open={uploadReceiptsOpen}
          onOpenChange={setUploadReceiptsOpen}
          onSuccess={refresh}
        />
      </div>
    </div>
  );
}

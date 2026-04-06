"use client";

import * as React from "react";
import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/skeleton";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { cn } from "@/lib/utils";
import {
  getExpenses,
  getExpenseTotal,
  getPaymentAccounts,
  getWorkers,
  type Expense,
  type PaymentAccountRow,
} from "@/lib/data";
import { pickDefaultPaymentAccountId } from "@/lib/expense-payment-preferences";
import { createBrowserClient } from "@/lib/supabase";
import { inferExpenseCategoryFromVendor } from "@/lib/receipt-infer-category";
import {
  processReceiptQueueUpload,
  type ProcessReceiptQueueResult,
} from "@/lib/receipt-queue-process-upload";
import { finalizeReceiptQueueExpense } from "@/lib/receipt-queue-expense";
import {
  RECEIPT_QUEUE_CHANGED_EVENT,
  notifyReceiptQueueChanged,
  insertReceiptQueueProcessing,
  updateReceiptQueueRow,
  deleteReceiptQueueRow,
  type ReceiptQueuePatch,
  type ReceiptQueueRow,
} from "@/lib/receipt-queue";
import { ReceiptQueueRowCard, type RowMotionPhase } from "./receipt-queue-row-card";
import { useRqLayout } from "./use-rq-layout";
import { AlertTriangle, Camera, Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import hotToast from "react-hot-toast";
import { useToast } from "@/components/toast/toast-provider";
import { uiActionLog, uiActionMark, uiNavLog, uiNavMark } from "@/lib/ui-action-perf";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildExpensesQueryKey,
  defaultExpenseListSort,
  expensesQueryKeyRoot,
  fetchExpenses,
  fetchWorkers,
  workersQueryKey,
} from "@/lib/queries/expenses";
import {
  fetchFinancialProjects,
  fetchReceiptQueue,
  financialProjectsQueryKey,
  receiptQueueQueryKey,
} from "@/lib/queries/receiptQueue";
import { useDelayedPending } from "@/hooks/use-delayed-pending";
import { ReceiptQueueSkeleton } from "@/components/financial/receipt-queue-skeleton";
import {
  afterLayout,
  neighborRowIdAfterRemove,
  scrollElementIntoViewNearest,
} from "@/lib/list-flow";

type ProjectRow = { id: string; name: string | null; status?: string | null };
type WorkerRow = { id: string; name: string };

async function signStoragePath(
  supabase: NonNullable<ReturnType<typeof createBrowserClient>>,
  path: string
): Promise<string | null> {
  const clean = path.replace(/^\/+/, "");
  for (const bucket of ["expense-attachments", "receipts"] as const) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(clean, 3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  const { data: pub } = supabase.storage.from("receipts").getPublicUrl(clean);
  return pub?.publicUrl ?? null;
}

async function downloadReceiptBlob(src: string, fileName: string) {
  const name = fileName.trim() || "receipt";
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.open(src, "_blank", "noopener,noreferrer");
  }
}

function queueStatusBadge(status: ReceiptQueueRow["status"]): {
  label: string;
  variant: "default" | "success" | "warning" | "danger" | "muted";
} {
  if (status === "processing") return { label: "Processing", variant: "muted" };
  if (status === "failed") return { label: "Failed", variant: "danger" };
  return { label: "Pending", variant: "warning" };
}

function amountIsMissing(row: ReceiptQueueRow): boolean {
  const raw = String(row.amount ?? "")
    .replace(/,/g, "")
    .trim();
  if (raw === "") return true;
  const n = parseFloat(raw);
  return !Number.isFinite(n) || n <= 0;
}

/** Rows that need user attention (not while still processing upload/OCR). */
function rowNeedsFix(row: ReceiptQueueRow): boolean {
  if (row.status === "processing") return false;
  return row.status === "failed" || row.vendor_name.trim() === "" || amountIsMissing(row);
}

const ENTER_FIELD_ORDER = [
  "vendor",
  "amount",
  "date",
  "project",
  "category",
  "payment",
  "worker",
] as const;

type QueueFocusField = (typeof ENTER_FIELD_ORDER)[number];

function firstEditableFieldForRow(row: ReceiptQueueRow): QueueFocusField {
  if (!row.vendor_name.trim()) return "vendor";
  if (amountIsMissing(row)) return "amount";
  return "date";
}

/** Visual neighbor after removal; skip `processing` rows by scanning outward in list order. */
function nextQueueRowForFocus(
  remainingAfter: ReceiptQueueRow[],
  snapshotBeforeRemove: ReceiptQueueRow[],
  removedId: string
): ReceiptQueueRow | null {
  const nid = neighborRowIdAfterRemove(snapshotBeforeRemove, removedId);
  if (!nid) return null;
  const start = remainingAfter.findIndex((r) => r.id === nid);
  if (start < 0) return null;
  if (remainingAfter[start]!.status !== "processing") return remainingAfter[start]!;
  for (let j = start + 1; j < remainingAfter.length; j++) {
    if (remainingAfter[j]!.status !== "processing") return remainingAfter[j]!;
  }
  for (let j = start - 1; j >= 0; j--) {
    if (remainingAfter[j]!.status !== "processing") return remainingAfter[j]!;
  }
  return null;
}

/** Among rows whose ids are in `addedIds`, pick the one with the greatest `created_at`. */
function newestAddedQueueRowId(list: ReceiptQueueRow[], addedIds: string[]): string | null {
  if (!addedIds.length) return null;
  const set = new Set(addedIds);
  let best: ReceiptQueueRow | null = null;
  for (const r of list) {
    if (!set.has(r.id)) continue;
    if (!best || String(r.created_at) > String(best.created_at)) best = r;
  }
  return best?.id ?? null;
}

type FieldRefs = {
  vendor: Record<string, HTMLInputElement | null>;
  amount: Record<string, HTMLInputElement | null>;
  date: Record<string, HTMLInputElement | null>;
};

/** Buttons: hover lighten 140ms ease; active scale 0.95 90ms spring */
const RQ_BTN =
  "transition-[background-color,transform,color] duration-[140ms] ease-out active:scale-[0.95] active:duration-90 active:ease-[cubic-bezier(0.34,1.56,0.64,1)]";

function scrollReceiptQueueRowIntoView(rowId: string, behavior: ScrollBehavior = "smooth") {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-receipt-queue-row="${rowId}"]`);
    scrollElementIntoViewNearest(el ?? undefined, behavior);
  });
}

export function ReceiptQueueWorkspace() {
  const rqLayout = useRqLayout();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const emptyQueueRef = React.useRef<HTMLDivElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const previewReplaceInputRef = React.useRef<HTMLInputElement>(null);
  const rowReuploadInputRef = React.useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = React.useState<string | null>(null);
  const readCachedQueue = React.useCallback(
    () => queryClient.getQueryData<ReceiptQueueRow[]>(receiptQueueQueryKey),
    [queryClient]
  );
  const readCachedProjects = React.useCallback(
    () => queryClient.getQueryData<ProjectRow[]>(financialProjectsQueryKey),
    [queryClient]
  );
  const readCachedExpenses = React.useCallback(
    () => queryClient.getQueryData<Expense[]>(buildExpensesQueryKey(defaultExpenseListSort)),
    [queryClient]
  );
  const readCachedWorkers = React.useCallback(
    () => queryClient.getQueryData<WorkerRow[]>(workersQueryKey),
    [queryClient]
  );
  const [rows, setRows] = React.useState<ReceiptQueueRow[]>(() => readCachedQueue() ?? []);
  const [projects, setProjects] = React.useState<ProjectRow[]>(() => readCachedProjects() ?? []);
  const [expenses, setExpenses] = React.useState<Expense[]>(() => readCachedExpenses() ?? []);
  const [workers, setWorkers] = React.useState<WorkerRow[]>(() => readCachedWorkers() ?? []);
  const [dragOver, setDragOver] = React.useState(false);
  const [captureUploading, setCaptureUploading] = React.useState(false);
  const [uploadBatchProgress, setUploadBatchProgress] = React.useState<{
    done: number;
    total: number;
  } | null>(null);
  const [bulkAdding, setBulkAdding] = React.useState(false);
  const [previewUrls, setPreviewUrls] = React.useState<Record<string, string>>({});
  const previewUrlsRef = React.useRef(previewUrls);
  previewUrlsRef.current = previewUrls;
  const [receiptPreview, setReceiptPreview] = React.useState<{
    rowId: string;
    src: string;
    isPdf: boolean;
    fileName: string;
  } | null>(null);
  const receiptPreviewRef = React.useRef(receiptPreview);
  receiptPreviewRef.current = receiptPreview;
  const { openPreview, closePreview } = useAttachmentPreview();
  /** Per-row rAF handles: coalesce rapid typing into ≤1 PATCH per frame (no visible input lag). */
  const rowPatchRafRef = React.useRef<Map<string, number>>(new Map());
  const confirmingRowIdsRef = React.useRef<Set<string>>(new Set());
  const pendingPatchesById = React.useRef<Map<string, ReceiptQueuePatch>>(new Map());
  /** Debounced saves continue async after pendingPatches is cleared; await these before refetching rows. */
  const rowSavePromises = React.useRef<Map<string, Promise<void>>>(new Map());
  const fieldRefs = React.useRef<FieldRefs>({ vendor: {}, amount: {}, date: {} });
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const [paymentAccountRows, setPaymentAccountRows] = React.useState<PaymentAccountRow[]>([]);
  const queueAutoPaymentDoneRef = React.useRef<Set<string>>(new Set());
  const vendorPaymentSuggestTimers = React.useRef<Map<string, number>>(new Map());
  const [listFilter, setListFilter] = React.useState<"all" | "needs_fix">("all");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [vendorSearch, setVendorSearch] = React.useState("");
  const [activeQueueRowId, setActiveQueueRowId] = React.useState<string | null>(null);
  const [newRowHighlightIds, setNewRowHighlightIds] = React.useState<string[]>([]);
  const removeInFlightRef = React.useRef<Set<string>>(new Set());
  const initialFocusAppliedRef = React.useRef(false);
  const queueBottomSentinelRef = React.useRef<HTMLDivElement | null>(null);
  /** Row exit: success check → fade/slide → height collapse. */
  const [rowMotion, setRowMotion] = React.useState<Record<string, RowMotionPhase>>({});
  const [confirmInvalid, setConfirmInvalid] = React.useState<{
    rowId: string;
    vendor: boolean;
    amount: boolean;
  } | null>(null);
  const lastConfirmFlashRef = React.useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const hotSavedCooldownRef = React.useRef(0);

  const flashConfirmInvalid = React.useCallback(
    (rowId: string, fields: { vendor?: boolean; amount?: boolean }) => {
      const key = `${rowId}:${!!fields.vendor}:${!!fields.amount}`;
      const now = Date.now();
      if (lastConfirmFlashRef.current.key === key && now - lastConfirmFlashRef.current.at < 650) {
        return;
      }
      lastConfirmFlashRef.current = { key, at: now };
      setConfirmInvalid({
        rowId,
        vendor: !!fields.vendor,
        amount: !!fields.amount,
      });
      window.setTimeout(() => {
        setConfirmInvalid((cur) => (cur?.rowId === rowId ? null : cur));
      }, 340);
    },
    []
  );

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const {
    data: receiptQueueData,
    isPending: receiptQueuePending,
    isError: receiptQueueError,
  } = useQuery({
    queryKey: receiptQueueQueryKey,
    queryFn: () => fetchReceiptQueue(supabase!),
    enabled: Boolean(supabase),
    placeholderData: keepPreviousData,
  });
  const { data: expensesQueryData } = useQuery({
    queryKey: buildExpensesQueryKey(defaultExpenseListSort),
    queryFn: () => fetchExpenses(defaultExpenseListSort),
    placeholderData: keepPreviousData,
  });
  const { data: workersQueryData } = useQuery({
    queryKey: workersQueryKey,
    queryFn: fetchWorkers,
    placeholderData: keepPreviousData,
  });
  const { data: projectsQueryData } = useQuery({
    queryKey: financialProjectsQueryKey,
    queryFn: () => fetchFinancialProjects(supabase!),
    enabled: Boolean(supabase),
    placeholderData: keepPreviousData,
  });

  React.useLayoutEffect(() => {
    if (receiptQueueData === undefined) return;
    setRows(receiptQueueData);
  }, [receiptQueueData]);
  React.useLayoutEffect(() => {
    if (expensesQueryData === undefined) return;
    setExpenses(expensesQueryData);
  }, [expensesQueryData]);
  React.useLayoutEffect(() => {
    if (workersQueryData === undefined) return;
    setWorkers(workersQueryData as WorkerRow[]);
  }, [workersQueryData]);
  React.useLayoutEffect(() => {
    if (projectsQueryData === undefined) return;
    setProjects(projectsQueryData as ProjectRow[]);
  }, [projectsQueryData]);

  const queueBootstrapWaiting =
    Boolean(supabase) && receiptQueuePending && receiptQueueData === undefined;
  const showQueueSkeleton = useDelayedPending(queueBootstrapWaiting && !receiptQueueError);

  const patchQueueRowMutation = useMutation({
    mutationFn: async (vars: { id: string; patch: ReceiptQueuePatch }) => {
      if (!supabase) throw new Error("Supabase is not configured.");
      await updateReceiptQueueRow(supabase, vars.id, vars.patch);
    },
    onSuccess: (_void, { id, patch }) => {
      queryClient.setQueryData<ReceiptQueueRow[]>(receiptQueueQueryKey, (old) =>
        (old ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row))
      );
    },
  });

  React.useEffect(() => {
    if (supabase) return;
    setRows([]);
    setProjects([]);
    setExpenses([]);
    setWorkers([]);
  }, [supabase]);

  const flushPendingDebouncedPatches = React.useCallback(async () => {
    if (!supabase) return;
    for (const [, raf] of rowPatchRafRef.current) cancelAnimationFrame(raf);
    rowPatchRafRef.current.clear();
    const entries = [...pendingPatchesById.current.entries()];
    pendingPatchesById.current.clear();
    for (const [id, patch] of entries) {
      if (Object.keys(patch).length === 0) continue;
      try {
        await patchQueueRowMutation.mutateAsync({ id, patch });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        toast({ title: "Queue row", description: msg, variant: "error" });
      }
    }
    const inflight = [...rowSavePromises.current.values()];
    if (inflight.length) await Promise.allSettled(inflight);
  }, [supabase, toast, patchQueueRowMutation]);

  const needsFixCount = React.useMemo(() => rows.filter(rowNeedsFix).length, [rows]);

  const queueProgress = React.useMemo(() => {
    if (rows.length === 0) return { done: 0, total: 0, pct: 0 };
    const done = rows.filter((r) => !rowNeedsFix(r)).length;
    return { done, total: rows.length, pct: Math.round((done / rows.length) * 100) };
  }, [rows]);

  const displayedRows = React.useMemo(() => {
    const base = listFilter === "needs_fix" ? rows.filter(rowNeedsFix) : rows;
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => r.vendor_name.toLowerCase().includes(q));
  }, [rows, listFilter, vendorSearch]);

  const activeDrawerFilterCount = listFilter === "needs_fix" ? 1 : 0;

  const applyQueueFieldFocus = React.useCallback((field: QueueFocusField, rowId: string) => {
    if (field === "vendor" || field === "amount" || field === "date") {
      const el = fieldRefs.current[field][rowId];
      el?.focus();
      el?.select();
      scrollReceiptQueueRowIntoView(rowId);
      return;
    }
    const root = document.querySelector(`[data-receipt-queue-row="${rowId}"]`);
    const host = root?.querySelector(`[data-queue-field="${field}"]`);
    const elRaw =
      host instanceof HTMLInputElement || host instanceof HTMLSelectElement
        ? host
        : host?.querySelector("input,select");
    if (!(elRaw instanceof HTMLElement)) return;
    const el = elRaw as HTMLInputElement | HTMLSelectElement;
    if (el.disabled) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    scrollReceiptQueueRowIntoView(rowId);
  }, []);

  /** Next frame — use after layout when the target row is already mounted. */
  const focusRowField = React.useCallback(
    (field: QueueFocusField, rowId: string) => {
      requestAnimationFrame(() => applyQueueFieldFocus(field, rowId));
    },
    [applyQueueFieldFocus]
  );

  /** After a state update removes/reorders rows (confirm): wait for commit + layout. */
  const focusRowFieldAfterLayout = React.useCallback(
    (field: QueueFocusField, rowId: string) => {
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => applyQueueFieldFocus(field, rowId));
        });
      });
    },
    [applyQueueFieldFocus]
  );

  const tryFocusNextFieldInSameRow = React.useCallback(
    (rowId: string, currentField: string): boolean => {
      const i = (ENTER_FIELD_ORDER as readonly string[]).indexOf(currentField);
      if (i < 0) return false;
      const root = document.querySelector(`[data-receipt-queue-row="${rowId}"]`);
      if (!root || !(root instanceof HTMLElement)) return false;
      for (let j = i + 1; j < ENTER_FIELD_ORDER.length; j++) {
        const f = ENTER_FIELD_ORDER[j];
        const host = root.querySelector(`[data-queue-field="${f}"]`);
        if (!host) continue;
        const elRaw =
          host instanceof HTMLInputElement || host instanceof HTMLSelectElement
            ? host
            : host.querySelector("input,select");
        if (!(elRaw instanceof HTMLElement)) continue;
        const el = elRaw as HTMLInputElement | HTMLSelectElement;
        if (el.disabled) continue;
        el.focus();
        if (el instanceof HTMLInputElement) el.select();
        setActiveQueueRowId(rowId);
        scrollReceiptQueueRowIntoView(rowId);
        return true;
      }
      return false;
    },
    []
  );

  React.useEffect(() => {
    if (queueBootstrapWaiting || rows.length === 0 || initialFocusAppliedRef.current) return;
    const fix = rows.filter((r) => rowNeedsFix(r) && r.status !== "processing");
    if (fix.length === 0) return;
    initialFocusAppliedRef.current = true;
    const row = fix[0];
    const field = firstEditableFieldForRow(row);
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        setActiveQueueRowId(row.id);
        focusRowField(field, row.id);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [queueBootstrapWaiting, rows, focusRowField]);

  const loadRows = React.useCallback(async () => {
    if (!supabase) {
      startTransition(() => setRows([]));
      return;
    }
    try {
      await flushPendingDebouncedPatches();
      const list = await fetchReceiptQueue(supabase);
      startTransition(() => setRows(list));
      queryClient.setQueryData(receiptQueueQueryKey, list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load queue";
      toast({ title: "Receipt queue", description: msg, variant: "error" });
    }
  }, [supabase, toast, flushPendingDebouncedPatches, queryClient]);

  const refreshAll = React.useCallback(async (): Promise<ReceiptQueueRow[]> => {
    await flushPendingDebouncedPatches();
    let list: ReceiptQueueRow[] = [];
    let expList: Expense[] = [];
    let workerList: WorkerRow[] = [];
    const settled = await Promise.allSettled([
      supabase ? fetchReceiptQueue(supabase) : Promise.resolve([] as ReceiptQueueRow[]),
      getExpenses(defaultExpenseListSort),
      getWorkers(),
    ]);
    const q = settled[0];
    if (q.status === "fulfilled") list = q.value;
    else {
      const msg = q.reason instanceof Error ? q.reason.message : String(q.reason);
      toast({ title: "Receipt queue", description: msg, variant: "error" });
    }
    const ex = settled[1];
    if (ex.status === "fulfilled") expList = ex.value;
    else {
      const msg = ex.reason instanceof Error ? ex.reason.message : String(ex.reason);
      toast({ title: "Expenses", description: msg, variant: "error" });
    }
    const w = settled[2];
    if (w.status === "fulfilled") workerList = w.value as WorkerRow[];
    startTransition(() => {
      setRows(list);
      setExpenses(expList);
      setWorkers(workerList);
    });
    queryClient.setQueryData(receiptQueueQueryKey, list);
    queryClient.setQueryData(buildExpensesQueryKey(defaultExpenseListSort), expList);
    queryClient.setQueryData(workersQueryKey, workerList);
    return list;
  }, [supabase, toast, flushPendingDebouncedPatches, queryClient]);

  /** Lighter than refreshAll: queue + expenses only (no workers reload). */
  const softRefreshQueueAndExpenses = React.useCallback(async () => {
    if (!supabase) return;
    let list: ReceiptQueueRow[] = [];
    try {
      await flushPendingDebouncedPatches();
      list = await fetchReceiptQueue(supabase);
      startTransition(() => setRows(list));
      queryClient.setQueryData(receiptQueueQueryKey, list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load queue";
      toast({ title: "Receipt queue", description: msg, variant: "error" });
    }
    try {
      const expList = await getExpenses(defaultExpenseListSort);
      startTransition(() => setExpenses(expList));
      queryClient.setQueryData(buildExpensesQueryKey(defaultExpenseListSort), expList);
    } catch {
      /* keep previous expenses for duplicate hints */
    }
  }, [supabase, toast, flushPendingDebouncedPatches, queryClient]);

  const receiptQueueRefreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const onChange = () => {
      if (receiptQueueRefreshTimerRef.current) clearTimeout(receiptQueueRefreshTimerRef.current);
      receiptQueueRefreshTimerRef.current = setTimeout(() => {
        receiptQueueRefreshTimerRef.current = null;
        void softRefreshQueueAndExpenses();
      }, 140);
    };
    window.addEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onChange);
      if (receiptQueueRefreshTimerRef.current) clearTimeout(receiptQueueRefreshTimerRef.current);
    };
  }, [softRefreshQueueAndExpenses]);

  React.useEffect(() => {
    if (!supabase || !rows.length) {
      setPreviewUrls({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const row of rows) {
        const pub = (row.receipt_public_url ?? "").trim();
        if (/^https?:\/\//i.test(pub)) {
          next[row.id] = pub;
          continue;
        }
        const path = row.storage_path?.trim();
        if (path) {
          const signed = await signStoragePath(supabase, path);
          if (signed) next[row.id] = signed;
        }
      }
      if (!cancelled) setPreviewUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, rows]);

  const patchRowDebounced = React.useCallback(
    (id: string, patch: ReceiptQueuePatch) => {
      if (!supabase) return;
      const prevPatch = pendingPatchesById.current.get(id) ?? {};
      pendingPatchesById.current.set(id, { ...prevPatch, ...patch });
      const prevRaf = rowPatchRafRef.current.get(id);
      if (prevRaf != null) cancelAnimationFrame(prevRaf);
      const raf = requestAnimationFrame(() => {
        rowPatchRafRef.current.delete(id);
        const merged = pendingPatchesById.current.get(id);
        pendingPatchesById.current.delete(id);
        if (!merged || Object.keys(merged).length === 0) return;
        const p = (async () => {
          try {
            await patchQueueRowMutation.mutateAsync({ id, patch: merged });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Save failed";
            toast({ title: "Queue row", description: msg, variant: "error" });
          }
        })();
        rowSavePromises.current.set(id, p);
        void p.finally(() => {
          if (rowSavePromises.current.get(id) === p) rowSavePromises.current.delete(id);
        });
      });
      rowPatchRafRef.current.set(id, raf);
    },
    [supabase, toast, patchQueueRowMutation]
  );

  const patchRowImmediate = React.useCallback(
    async (id: string, patch: ReceiptQueuePatch) => {
      if (!supabase) return;
      const inflight = rowSavePromises.current.get(id);
      if (inflight) await inflight;
      try {
        await patchQueueRowMutation.mutateAsync({ id, patch });
        startTransition(() => {
          setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
        });
        const now = Date.now();
        if (now - hotSavedCooldownRef.current > 1400) {
          hotToast.success("Saved");
          hotSavedCooldownRef.current = now;
        }
      } catch {
        hotToast.error("Something went wrong");
      }
    },
    [supabase, toast, patchQueueRowMutation]
  );

  const queueVendorPaymentSuggest = React.useCallback(
    (rowId: string, vendor: string) => {
      const prev = vendorPaymentSuggestTimers.current.get(rowId);
      if (prev) clearTimeout(prev);
      const t = window.setTimeout(() => {
        vendorPaymentSuggestTimers.current.delete(rowId);
        const current = rowsRef.current.find((x) => x.id === rowId);
        if (!current || current.payment_account_id) return;
        if (paymentAccountRows.length === 0) return;
        const pid = pickDefaultPaymentAccountId(paymentAccountRows, vendor);
        if (!pid) return;
        void patchRowImmediate(rowId, { payment_account_id: pid });
      }, 480);
      vendorPaymentSuggestTimers.current.set(rowId, t);
    },
    [paymentAccountRows, patchRowImmediate]
  );

  React.useEffect(() => {
    void getPaymentAccounts()
      .then(setPaymentAccountRows)
      .catch(() => setPaymentAccountRows([]));
  }, []);

  React.useEffect(() => {
    if (paymentAccountRows.length === 0) return;
    for (const r of rows) {
      if (r.payment_account_id || !r.vendor_name.trim()) continue;
      if (queueAutoPaymentDoneRef.current.has(r.id)) continue;
      queueAutoPaymentDoneRef.current.add(r.id);
      const pid = pickDefaultPaymentAccountId(paymentAccountRows, r.vendor_name);
      if (pid) void patchRowImmediate(r.id, { payment_account_id: pid });
    }
  }, [rows, paymentAccountRows, patchRowImmediate]);

  const flushRowToDb = React.useCallback(
    async (row: ReceiptQueueRow) => {
      if (!supabase) return;
      const raf = rowPatchRafRef.current.get(row.id);
      if (raf != null) {
        cancelAnimationFrame(raf);
        rowPatchRafRef.current.delete(row.id);
      }
      pendingPatchesById.current.delete(row.id);
      const inflight = rowSavePromises.current.get(row.id);
      if (inflight) await inflight;
      try {
        await patchQueueRowMutation.mutateAsync({
          id: row.id,
          patch: {
            vendor_name: row.vendor_name,
            amount: row.amount,
            expense_date: row.expense_date.slice(0, 10),
            payment_account_id: row.payment_account_id ?? null,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        toast({ title: "Queue row", description: msg, variant: "error" });
      }
    },
    [supabase, toast, patchQueueRowMutation]
  );

  const finalizeConfirmMutation = useMutation({
    mutationFn: async (live: ReceiptQueueRow) => {
      if (!supabase) throw new Error("Supabase is not configured.");
      await flushRowToDb(live);
      await finalizeReceiptQueueExpense(supabase, live, "confirm");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: receiptQueueQueryKey });
      void queryClient.invalidateQueries({ queryKey: expensesQueryKeyRoot });
    },
  });

  const handleEnterSaveNav = React.useCallback(
    async (rowId: string, shiftKey: boolean, sourceField: string | null) => {
      if (!supabase) return;
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row || row.status === "processing") return;
      if (shiftKey) {
        await flushRowToDb(row);
        await flushPendingDebouncedPatches();
        return;
      }
      void flushRowToDb(row);
      if (sourceField && tryFocusNextFieldInSameRow(rowId, sourceField)) {
        return;
      }
      const all = rowsRef.current;
      const curIdx = all.findIndex((r) => r.id === rowId);
      if (curIdx === -1) return;
      let next: ReceiptQueueRow | undefined;
      for (let i = curIdx + 1; i < all.length; i++) {
        const r = all[i];
        if (r.status !== "processing") {
          next = r;
          break;
        }
      }
      if (!next) {
        for (let i = 0; i < curIdx; i++) {
          const r = all[i];
          if (r.status !== "processing") {
            next = r;
            break;
          }
        }
      }
      if (next) {
        setActiveQueueRowId(next.id);
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              applyQueueFieldFocus(firstEditableFieldForRow(next!), next!.id);
            });
          });
        });
      }
    },
    [
      supabase,
      flushRowToDb,
      applyQueueFieldFocus,
      flushPendingDebouncedPatches,
      tryFocusNextFieldInSameRow,
    ]
  );

  const onEditableKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key !== "Enter") return;
      if (e.nativeEvent.isComposing) return;
      const id = e.currentTarget.getAttribute("data-queue-row-id");
      if (!id) return;
      const r = rowsRef.current.find((x) => x.id === id);
      if (!r || r.status === "processing") return;
      e.preventDefault();
      const field = e.currentTarget.getAttribute("data-queue-field");
      void handleEnterSaveNav(id, e.shiftKey, field);
    },
    [handleEnterSaveNav]
  );

  const runUploadForRow = React.useCallback(
    async (
      rowId: string,
      file: File,
      options?: { skipRefresh?: boolean }
    ): Promise<ProcessReceiptQueueResult | null> => {
      if (!supabase) return null;
      try {
        const r = await processReceiptQueueUpload(
          supabase,
          rowId,
          file,
          inferExpenseCategoryFromVendor
        );
        return r;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Processing failed";
        hotToast.error("Something went wrong");
        await patchQueueRowMutation.mutateAsync({
          id: rowId,
          patch: {
            status: "failed",
            error_message: msg,
          },
        });
        return { storageSaved: false };
      } finally {
        notifyReceiptQueueChanged();
        if (!options?.skipRefresh) await refreshAll();
      }
    },
    [supabase, refreshAll, patchQueueRowMutation]
  );

  const scrollQueueToNewest = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        queueBottomSentinelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    });
  }, []);

  /** Focus vendor after DOM has row refs (post-refresh). */
  const focusQueueRowVendor = React.useCallback(
    (rowId: string) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setActiveQueueRowId(rowId);
            focusRowField("vendor", rowId);
            fieldRefs.current.vendor[rowId]?.scrollIntoView({
              block: "nearest",
              behavior: "smooth",
            });
          });
        });
      });
    },
    [focusRowField]
  );

  const flashNewRowHighlights = React.useCallback((rowIds: string[]) => {
    if (!rowIds.length) return;
    setNewRowHighlightIds((prev) => [...new Set([...prev, ...rowIds])]);
    for (const id of rowIds) {
      window.setTimeout(() => {
        setNewRowHighlightIds((prev) => prev.filter((x) => x !== id));
      }, 600);
    }
  }, []);

  const enqueueFiles = React.useCallback(
    async (files: FileList | File[] | null) => {
      if (!files?.length || !supabase) {
        if (!supabase) toast({ title: "Storage unavailable", variant: "error" });
        return;
      }
      const fileList = Array.from(files).filter((f) => f.size > 0);
      if (!fileList.length) return;

      setCaptureUploading(true);
      setUploadBatchProgress({ done: 0, total: fileList.length });
      let ok = 0;
      let fail = 0;
      let firstFailDetail: string | undefined;

      try {
        const outcomes = await Promise.all(
          fileList.map(async (file) => {
            try {
              let qid: string;
              try {
                qid = await insertReceiptQueueProcessing(supabase, file);
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Enqueue failed";
                return { ok: false as const, detail: msg };
              }
              notifyReceiptQueueChanged();
              const r = await runUploadForRow(qid, file, { skipRefresh: true });
              if (r?.storageSaved) return { ok: true as const, rowId: qid };
              return {
                ok: false as const,
                detail: "Could not save file to storage.",
              };
            } finally {
              setUploadBatchProgress((p) =>
                p ? { ...p, done: Math.min(p.total, p.done + 1) } : p
              );
            }
          })
        );

        for (const o of outcomes) {
          if (o.ok) ok += 1;
          else {
            fail += 1;
            if (!firstFailDetail) firstFailDetail = o.detail;
          }
        }

        const queueList = await refreshAll();

        startTransition(() => {
          if (ok > 0) {
            const addedRowIds = outcomes
              .filter((o): o is { ok: true; rowId: string } => o.ok && "rowId" in o)
              .map((o) => o.rowId);
            const targetId = newestAddedQueueRowId(queueList, addedRowIds);
            setListFilter("all");
            scrollQueueToNewest();
            flashNewRowHighlights(addedRowIds);
            if (targetId) {
              focusQueueRowVendor(targetId);
            }
          }
        });
        if (ok > 0) {
          hotToast.success(ok === 1 ? "Uploaded" : `${ok} uploaded`);
        }
        if (fail > 0) {
          hotToast.error("Something went wrong");
        }
      } finally {
        setCaptureUploading(false);
      }
    },
    [
      supabase,
      toast,
      refreshAll,
      runUploadForRow,
      scrollQueueToNewest,
      flashNewRowHighlights,
      focusQueueRowVendor,
    ]
  );

  const replaceRowFile = React.useCallback(
    (rowId: string, file: File) => {
      if (!supabase) {
        toast({ title: "Storage unavailable", variant: "error" });
        return;
      }
      void (async () => {
        try {
          await patchQueueRowMutation.mutateAsync({
            id: rowId,
            patch: {
              status: "processing",
              error_message: null,
              storage_path: null,
              receipt_public_url: null,
            },
          });
          notifyReceiptQueueChanged();
          startTransition(() => {
            setRows((r) =>
              r.map((x) =>
                x.id === rowId
                  ? {
                      ...x,
                      status: "processing",
                      error_message: null,
                      storage_path: null,
                      receipt_public_url: null,
                    }
                  : x
              )
            );
          });
          const r = await runUploadForRow(rowId, file);
          if (r?.storageSaved) {
            focusQueueRowVendor(rowId);
            flashNewRowHighlights([rowId]);
            hotToast.success("Uploaded");
          } else {
            hotToast.error("Something went wrong");
          }
        } catch {
          hotToast.error("Something went wrong");
        }
      })();
      const isPdf = file.type === "application/pdf";
      const blobUrl = URL.createObjectURL(file);
      setReceiptPreview((p) =>
        p && p.rowId === rowId
          ? { ...p, src: blobUrl, isPdf, fileName: file.name || p.fileName }
          : p
      );
    },
    [supabase, runUploadForRow, focusQueueRowVendor, flashNewRowHighlights, patchQueueRowMutation]
  );

  React.useEffect(() => {
    if (!receiptPreview) {
      closePreview();
      return;
    }
    openPreview({
      url: receiptPreview.src,
      fileName: receiptPreview.fileName,
      fileType: receiptPreview.isPdf ? "pdf" : "image",
      showReplace: true,
      replaceInputRef: previewReplaceInputRef,
      replaceAccept: "image/*,application/pdf",
      onReplaceClick: () => previewReplaceInputRef.current?.click(),
      onReplaceInputChange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        const rp = receiptPreviewRef.current;
        if (!f?.size || !rp) return;
        replaceRowFile(rp.rowId, f);
      },
      onDownload: () => {
        const rp = receiptPreviewRef.current;
        if (rp) void downloadReceiptBlob(rp.src, rp.fileName);
      },
      onClosed: () => setReceiptPreview(null),
    });
  }, [receiptPreview, openPreview, closePreview, replaceRowFile]);

  const runRowExitAnimation = React.useCallback(
    (id: string, options: { flashGreen: boolean; onComplete: () => void }) => {
      const CHECK_MS = options.flashGreen ? 480 : 0;
      const FADE_MS = 240;
      const COLLAPSE_MS = 220;
      const startFade = () => {
        setRowMotion((s) => ({ ...s, [id]: "fade" }));
        window.setTimeout(() => {
          setRowMotion((s) => ({ ...s, [id]: "collapse" }));
          window.setTimeout(() => {
            setRowMotion((s) => {
              const { [id]: _, ...rest } = s;
              return rest;
            });
            options.onComplete();
          }, COLLAPSE_MS);
        }, FADE_MS);
      };
      if (options.flashGreen) {
        setRowMotion((s) => ({ ...s, [id]: "success_check" }));
        window.setTimeout(startFade, CHECK_MS);
      } else {
        startFade();
      }
    },
    []
  );

  const performRemoveRowCore = React.useCallback(
    (id: string) => {
      if (!supabase) return;
      if (removeInFlightRef.current.has(id)) return;
      const prev = rowsRef.current;
      const removed = prev.find((r) => r.id === id);
      if (!removed) return;
      const remaining = prev.filter((x) => x.id !== id);
      const nextRow = nextQueueRowForFocus(remaining, prev, id);
      let focusFollowDelete = false;
      removeInFlightRef.current.add(id);
      setReceiptPreview((p) => (p?.rowId === id ? null : p));
      setActiveQueueRowId((cur) => {
        if (cur === id) {
          focusFollowDelete = true;
          return nextRow?.id ?? null;
        }
        return cur;
      });
      const t0 = uiActionMark();
      setRows((r) => r.filter((x) => x.id !== id));
      uiActionLog("receipt-queue-delete-ui", t0, 100);
      afterLayout(() => {
        if (!focusFollowDelete) return;
        if (nextRow) {
          applyQueueFieldFocus(firstEditableFieldForRow(nextRow), nextRow.id);
        } else {
          emptyQueueRef.current?.focus({ preventScroll: true });
        }
      });
      void (async () => {
        try {
          await deleteReceiptQueueRow(supabase, id);
          notifyReceiptQueueChanged();
        } catch (e) {
          setRows(prev);
          const msg = e instanceof Error ? e.message : "Remove failed";
          toast({ title: "Receipt queue", description: msg, variant: "error" });
        } finally {
          removeInFlightRef.current.delete(id);
        }
      })();
    },
    [supabase, toast, applyQueueFieldFocus]
  );

  const removeRow = React.useCallback(
    (id: string) => {
      if (!supabase) return;
      if (removeInFlightRef.current.has(id)) return;
      if (rowMotion[id]) return;
      const removed = rowsRef.current.find((r) => r.id === id);
      if (!removed) return;
      runRowExitAnimation(id, {
        flashGreen: false,
        onComplete: () => performRemoveRowCore(id),
      });
    },
    [supabase, rowMotion, runRowExitAnimation, performRemoveRowCore]
  );

  const dupWarning = (row: ReceiptQueueRow): string | null => {
    const total = Number(row.amount);
    if (!Number.isFinite(total)) return null;
    const d = row.expense_date.slice(0, 10);
    const sameDay = expenses.filter((e) => (e.date ?? "").slice(0, 10) === d);
    const dup = sameDay.find((e) => {
      const v1 = (e.vendorName ?? "").trim().toLowerCase();
      const v2 = row.vendor_name.trim().toLowerCase();
      return v1 === v2 && Math.abs(getExpenseTotal(e) - total) < 0.01;
    });
    return dup ? `Possible duplicate of expense ${dup.id.slice(0, 8)}…` : null;
  };

  const confirmRow = (row: ReceiptQueueRow) => {
    const anchorRowId = activeQueueRowId;
    const live = rowsRef.current.find((r) => r.id === row.id) ?? row;
    const total = Number(live.amount);
    if (!Number.isFinite(total) || total <= 0) {
      flashConfirmInvalid(live.id, { amount: true });
      toast({ title: "Amount required", variant: "error" });
      return;
    }
    if (!live.vendor_name.trim()) {
      flashConfirmInvalid(live.id, { vendor: true });
      toast({ title: "Vendor required", variant: "error" });
      return;
    }
    if (live.status === "processing") return;
    if (!supabase) {
      toast({
        title: "Receipt queue",
        description: "Supabase is not configured.",
        variant: "error",
      });
      return;
    }
    if (rowMotion[live.id]) return;
    if (confirmingRowIdsRef.current.has(live.id)) return;
    confirmingRowIdsRef.current.add(live.id);
    runRowExitAnimation(live.id, {
      flashGreen: true,
      onComplete: () => {
        confirmingRowIdsRef.current.delete(live.id);
        const snapshot = rowsRef.current;
        const remainingAfter = snapshot.filter((x) => x.id !== live.id);
        const t0 = uiActionMark();
        setReceiptPreview((p) => (p?.rowId === live.id ? null : p));
        const next = nextQueueRowForFocus(remainingAfter, snapshot, live.id);
        setActiveQueueRowId((cur) => (cur === live.id ? (next?.id ?? null) : cur));
        setRows((r) => r.filter((x) => x.id !== live.id));
        uiActionLog("receipt-queue-confirm-ui", t0, 100);
        if (next && anchorRowId === live.id) {
          focusRowFieldAfterLayout(firstEditableFieldForRow(next), next.id);
        } else if (!next && anchorRowId === live.id) {
          afterLayout(() => {
            emptyQueueRef.current?.focus({ preventScroll: true });
          });
        }
        void (async () => {
          try {
            await finalizeConfirmMutation.mutateAsync(live);
            hotToast.success("Confirmed");
          } catch {
            setRows(snapshot);
            hotToast.error("Something went wrong");
          }
        })();
      },
    });
  };

  const addAllEligibleCount = React.useMemo(
    () => rows.filter((r) => r.status !== "processing").length,
    [rows]
  );

  const handleAddAll = React.useCallback(async () => {
    const targets = rows.filter((r) => r.status !== "processing");
    if (!targets.length || !supabase) return;
    setBulkAdding(true);
    let successCount = 0;
    let failCount = 0;
    const succeededIds = new Set<string>();
    for (const row of targets) {
      try {
        await finalizeReceiptQueueExpense(supabase, row, "bulk");
        successCount += 1;
        succeededIds.add(row.id);
        setRows((r) => r.filter((x) => x.id !== row.id));
        const prevUrl = previewUrls[row.id];
        if (prevUrl?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(prevUrl);
          } catch {
            /* ignore */
          }
        }
      } catch {
        failCount += 1;
      }
    }
    setReceiptPreview((p) => (p && succeededIds.has(p.rowId) ? null : p));
    if (successCount > 0 || failCount > 0) {
      await softRefreshQueueAndExpenses();
    }
    if (successCount > 0) {
      const navT = uiNavMark();
      router.push("/financial/expenses?view=unreviewed&focus_unreviewed=1&page=1");
      requestAnimationFrame(() => uiNavLog("receipt-queue-bulk->expenses", navT, 200));
    }
    if (failCount === 0 && successCount > 0) {
      toast({
        title: `All ${successCount} expense${successCount === 1 ? "" : "s"} added`,
        variant: "success",
      });
    } else if (failCount > 0) {
      toast({
        title: `${successCount} added, ${failCount} failed`,
        description:
          successCount === 0
            ? "Fix rows and try again, or confirm individually."
            : "Failed rows remain in the queue; fix and retry.",
        variant: successCount === 0 ? "error" : "default",
      });
    }
    setBulkAdding(false);
  }, [rows, supabase, toast, softRefreshQueueAndExpenses, router, previewUrls]);

  const onReplacePick = React.useCallback((rowId: string) => {
    setReplaceTargetId(rowId);
    requestAnimationFrame(() => {
      rowReuploadInputRef.current?.click();
    });
  }, []);

  const queueHandlersRef = React.useRef({
    confirmRow: ((_row: ReceiptQueueRow) => {}) as (row: ReceiptQueueRow) => void,
    removeRow: ((_id: string) => {}) as (id: string) => void,
    openPreview: ((_id: string) => {}) as (id: string) => void,
  });
  queueHandlersRef.current.confirmRow = confirmRow;
  queueHandlersRef.current.removeRow = removeRow;
  queueHandlersRef.current.openPreview = (id: string) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row) return;
    const src = previewUrlsRef.current[row.id];
    if (!src || row.status === "processing") return;
    const isPdf =
      row.mime_type === "application/pdf" || row.file_name.toLowerCase().endsWith(".pdf");
    setReceiptPreview({
      rowId: row.id,
      src,
      isPdf,
      fileName: row.file_name || "Receipt",
    });
  };

  const stableConfirmRow = React.useCallback((row: ReceiptQueueRow) => {
    queueHandlersRef.current.confirmRow(row);
  }, []);
  const stableRemoveRow = React.useCallback((id: string) => {
    queueHandlersRef.current.removeRow(id);
  }, []);
  const stableOpenPreview = React.useCallback((id: string) => {
    queueHandlersRef.current.openPreview(id);
  }, []);

  const registerVendorRef = React.useCallback((id: string, el: HTMLInputElement | null) => {
    fieldRefs.current.vendor[id] = el;
  }, []);
  const registerAmountRef = React.useCallback((id: string, el: HTMLInputElement | null) => {
    fieldRefs.current.amount[id] = el;
  }, []);
  const registerDateRef = React.useCallback((id: string, el: HTMLInputElement | null) => {
    fieldRefs.current.date[id] = el;
  }, []);

  const onVendorChange = React.useCallback(
    (id: string, v: string) => {
      queueAutoPaymentDoneRef.current.delete(id);
      setConfirmInvalid((cur) => {
        if (!cur || cur.rowId !== id) return cur;
        const next = { ...cur, vendor: false };
        return next.amount ? next : null;
      });
      setRows((r) => r.map((x) => (x.id === id ? { ...x, vendor_name: v } : x)));
      patchRowDebounced(id, { vendor_name: v });
      queueVendorPaymentSuggest(id, v);
    },
    [patchRowDebounced, queueVendorPaymentSuggest]
  );
  const onAmountChange = React.useCallback(
    (id: string, v: string) => {
      setConfirmInvalid((cur) => {
        if (!cur || cur.rowId !== id) return cur;
        const next = { ...cur, amount: false };
        return next.vendor ? next : null;
      });
      setRows((r) => r.map((x) => (x.id === id ? { ...x, amount: v } : x)));
      patchRowDebounced(id, { amount: v });
    },
    [patchRowDebounced]
  );
  const onDateChange = React.useCallback(
    (id: string, v: string) => {
      setRows((r) => r.map((x) => (x.id === id ? { ...x, expense_date: v } : x)));
      patchRowDebounced(id, { expense_date: v });
    },
    [patchRowDebounced]
  );
  const onProjectChange = React.useCallback(
    (id: string, v: string | null) => {
      void patchRowImmediate(id, { project_id: v });
    },
    [patchRowImmediate]
  );
  const onCategoryChange = React.useCallback(
    (id: string, v: string) => {
      void patchRowImmediate(id, { category: v });
    },
    [patchRowImmediate]
  );
  const onPaymentChange = React.useCallback(
    (id: string, v: string | null) => {
      if (!v) queueAutoPaymentDoneRef.current.delete(id);
      void patchRowImmediate(id, { payment_account_id: v });
    },
    [patchRowImmediate]
  );
  const onWorkerChange = React.useCallback(
    (id: string, v: string | null) => {
      void patchRowImmediate(id, { worker_id: v });
    },
    [patchRowImmediate]
  );

  return (
    <div className="rq-workspace w-full bg-[#f5f7fa] dark:bg-background">
      <div
        className={cn(
          "mx-auto flex max-w-6xl flex-col gap-6 px-0 py-6 sm:gap-8 sm:px-6 sm:py-8",
          mobileListPagePaddingClass,
          "max-md:!gap-3"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="items-start gap-1 border-0 pb-0 sm:items-start [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-[#111827] [&_p]:max-w-2xl [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-[#6b7280]"
            title="Receipt Queue"
            description="Uploads persist across sessions. Enter saves the row and moves to the next field, then the next row that needs attention. Shift+Enter saves this row and flushes all pending edits. Add all imports in bulk (needs review)."
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 rounded-md border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#111827] shadow-none",
                    RQ_BTN,
                    "hover:bg-[#f3f4f6]"
                  )}
                  asChild
                >
                  <Link href="/financial/expenses">Expenses</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 rounded-md border-2 border-[#111827] bg-white px-3 text-sm font-semibold text-[#111827] shadow-none",
                    RQ_BTN,
                    "hover:bg-[#f3f4f6]"
                  )}
                  disabled={bulkAdding || !supabase || addAllEligibleCount === 0}
                  onClick={() => void handleAddAll()}
                >
                  {bulkAdding ? (
                    <InlineLoading aria-label="Adding" />
                  ) : (
                    `Add all (${addAllEligibleCount})`
                  )}
                </Button>
              </div>
            }
          />
        </div>
        <MobileListHeader
          title="Receipt Queue"
          fab={
            <MobileFabButton
              ariaLabel="Upload files"
              onClick={() => uploadInputRef.current?.click()}
            />
          }
        />
        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder="Vendor…"
                className="h-10 border-[#e5e7eb] bg-white pl-8 text-sm dark:border-border dark:bg-background"
                aria-label="Filter queue by vendor"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">View</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={listFilter === "all" ? "default" : "outline"}
                className="rounded-sm"
                onClick={() => {
                  setListFilter("all");
                  setFiltersOpen(false);
                }}
              >
                All
              </Button>
              <Button
                type="button"
                size="sm"
                variant={listFilter === "needs_fix" ? "default" : "outline"}
                className="rounded-sm"
                onClick={() => {
                  setListFilter("needs_fix");
                  setFiltersOpen(false);
                }}
              >
                Needs fix ({needsFixCount})
              </Button>
            </div>
          </div>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        {supabase ? (
          <div className="flex flex-wrap gap-2 md:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-sm"
              disabled={captureUploading}
              onClick={() => cameraInputRef.current?.click()}
            >
              {captureUploading ? (
                <InlineLoading size="sm" aria-hidden />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              <span className="ml-1.5">Take photo</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-sm"
              disabled={captureUploading}
              onClick={() => uploadInputRef.current?.click()}
            >
              {captureUploading ? (
                <InlineLoading size="sm" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="ml-1.5">Upload</span>
            </Button>
          </div>
        ) : null}

        {rows.some((r) => r.status === "processing") ? (
          <p
            className="text-xs text-[#6b7280] dark:text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Receipt OCR is running in the background — you can keep working; rows update when ready.
          </p>
        ) : null}

        {!supabase ? (
          <p className="text-sm text-[#6b7280] dark:text-muted-foreground">
            Configure Supabase to upload.
          </p>
        ) : (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={captureUploading}
              onChange={(e) => {
                void enqueueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              disabled={captureUploading}
              onChange={(e) => {
                void enqueueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={rowReuploadInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                const tid = replaceTargetId;
                setReplaceTargetId(null);
                if (!f?.size || !tid) return;
                replaceRowFile(tid, f);
              }}
            />
            <div className="hidden flex-wrap gap-3 md:flex">
              <Button
                type="button"
                size="sm"
                className={cn(
                  "h-10 gap-2 rounded-lg border-0 bg-[#111827] px-4 text-sm font-medium text-white shadow-none",
                  RQ_BTN,
                  "hover:bg-[#1f2937]"
                )}
                disabled={captureUploading}
                onClick={() => cameraInputRef.current?.click()}
              >
                {captureUploading ? (
                  <InlineLoading size="md" aria-hidden />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Take photo
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn(
                  "h-10 gap-2 rounded-lg border-0 bg-[#2563eb] px-4 text-sm font-medium text-white shadow-none",
                  RQ_BTN,
                  "hover:bg-[#1d4ed8]"
                )}
                disabled={captureUploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                {captureUploading ? (
                  <InlineLoading size="md" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload files
              </Button>
            </div>
            {captureUploading ? (
              <p
                className="text-xs text-[#6b7280] dark:text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {uploadBatchProgress
                  ? `Upload progress: ${uploadBatchProgress.done} / ${uploadBatchProgress.total} (OCR continues in background)`
                  : "Uploading…"}
              </p>
            ) : null}
            <div
              className={cn(
                "hidden min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#e5e7eb] bg-white py-8 text-sm text-[#6b7280] transition-colors duration-[140ms] ease-out md:flex",
                dragOver && !captureUploading && "border-[#2563eb]/45 bg-[#2563eb]/[0.06]",
                captureUploading && "pointer-events-none opacity-60"
              )}
              onDragEnter={(e) => {
                e.preventDefault();
                if (!captureUploading) setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = captureUploading ? "none" : "copy";
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (captureUploading) return;
                void enqueueFiles(e.dataTransfer.files);
              }}
            >
              <Upload className="h-8 w-8 text-[#9ca3af]" aria-hidden />
              <span className="text-sm font-medium text-[#6b7280]">
                {captureUploading
                  ? uploadBatchProgress
                    ? `Uploading ${uploadBatchProgress.done} / ${uploadBatchProgress.total}…`
                    : "Uploading…"
                  : "Drop files here to add to the queue"}
              </span>
            </div>
          </>
        )}

        {showQueueSkeleton && rows.length === 0 ? (
          <div role="status" aria-live="polite" aria-label="Loading queue">
            <ReceiptQueueSkeleton rows={6} />
          </div>
        ) : null}

        {!queueBootstrapWaiting &&
        !showQueueSkeleton &&
        rows.length === 0 &&
        supabase &&
        !receiptQueueError ? (
          <>
            <MobileEmptyState
              icon={<Upload className="h-8 w-8 opacity-80" aria-hidden />}
              message="No items in the queue. Use the + button to upload."
            />
            <div
              ref={emptyQueueRef}
              tabIndex={-1}
              data-receipt-queue-empty
              className="hidden min-h-[min(40vh,280px)] flex-col justify-center transition-opacity duration-200 ease-out animate-in fade-in md:flex"
            >
              <p className="text-center text-sm text-[#6b7280] dark:text-muted-foreground">
                No items in the queue.
              </p>
            </div>
          </>
        ) : rows.length > 0 ? (
          <>
            <div className="overflow-hidden rounded-lg border border-[#f4d47c] bg-[#fff8e8] dark:border-amber-800/50 dark:bg-amber-950/30">
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:items-center">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#9a5b13] dark:text-amber-100">
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 text-[#9a5b13] dark:text-amber-400"
                    aria-hidden
                  />
                  <span>
                    {needsFixCount === 0 ? (
                      "All caught up."
                    ) : (
                      <>
                        {needsFixCount} item{needsFixCount === 1 ? "" : "s"} need attention
                      </>
                    )}
                  </span>
                </div>
                <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                  <p className="text-center text-[11px] text-[#9a5b13]/90 dark:text-amber-200/80 sm:text-right">
                    Enter: field → next row · Shift+Enter: save all pending
                  </p>
                  <div className="hidden justify-center gap-1 sm:justify-end md:flex">
                    <button
                      type="button"
                      onClick={() => setListFilter("all")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-[140ms] ease-out",
                        listFilter === "all"
                          ? "bg-white text-[#111827] shadow-sm ring-1 ring-[#e5e7eb] dark:bg-amber-900/40 dark:text-amber-50 dark:ring-amber-700/50"
                          : "text-[#9a5b13] hover:bg-white/70 dark:text-amber-200/90 dark:hover:bg-amber-900/30"
                      )}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setListFilter("needs_fix")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-[140ms] ease-out",
                        listFilter === "needs_fix"
                          ? "bg-white text-[#111827] shadow-sm ring-1 ring-[#e5e7eb] dark:bg-amber-900/40 dark:text-amber-50 dark:ring-amber-700/50"
                          : "text-[#9a5b13] hover:bg-white/70 dark:text-amber-200/90 dark:hover:bg-amber-900/30"
                      )}
                    >
                      Needs fix ({needsFixCount})
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 border-t border-[#f4d47c]/70 px-4 py-2 dark:border-amber-800/40">
                <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#f4d47c]/30 dark:bg-amber-900/40">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[#2563eb] transition-[width] duration-300"
                    style={{ width: `${queueProgress.pct}%` }}
                  />
                </div>
                <span className="shrink-0 tabular-nums text-xs font-medium text-[#9a5b13] dark:text-amber-100">
                  {queueProgress.done} / {queueProgress.total} ({queueProgress.pct}%)
                </span>
              </div>
            </div>

            {displayedRows.length === 0 ? (
              <>
                <MobileEmptyState
                  icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
                  message="No rows in this view."
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-sm"
                      onClick={() => {
                        setListFilter("all");
                        setVendorSearch("");
                      }}
                    >
                      Show all
                    </Button>
                  }
                />
                <p className="hidden py-8 text-center text-sm text-[#6b7280] dark:text-muted-foreground md:block">
                  No rows in this view.{" "}
                  <button
                    type="button"
                    className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                    onClick={() => setListFilter("all")}
                  >
                    Show all
                  </button>
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-4 md:gap-3">
                  {displayedRows.map((row) => {
                    const prev = previewUrls[row.id];
                    const st = queueStatusBadge(row.status);
                    const dup = dupWarning(row);
                    const needsHighlight = rowNeedsFix(row) && row.status !== "processing";
                    const vendorMissing =
                      row.status !== "processing" && row.vendor_name.trim() === "";
                    const showAmountHint = row.status !== "processing" && amountIsMissing(row);
                    const motion = rowMotion[row.id];
                    const rowLocked = !!motion;
                    const vendorShake = confirmInvalid?.rowId === row.id && confirmInvalid.vendor;
                    const amountShake = confirmInvalid?.rowId === row.id && confirmInvalid.amount;
                    return (
                      <ReceiptQueueRowCard
                        key={row.id}
                        layout={rqLayout}
                        row={row}
                        previewUrl={prev}
                        projects={projects}
                        workers={workers}
                        statusLabel={st.label}
                        statusVariant={st.variant}
                        motion={motion}
                        rowLocked={rowLocked}
                        activeQueueRowId={activeQueueRowId}
                        needsHighlight={needsHighlight}
                        newRowHighlight={newRowHighlightIds.includes(row.id)}
                        vendorMissing={vendorMissing}
                        showAmountHint={showAmountHint}
                        vendorShake={vendorShake}
                        amountShake={amountShake}
                        dup={dup}
                        bulkAdding={bulkAdding}
                        captureUploading={captureUploading}
                        registerVendorRef={registerVendorRef}
                        registerAmountRef={registerAmountRef}
                        registerDateRef={registerDateRef}
                        setActiveQueueRowId={setActiveQueueRowId}
                        onVendorChange={onVendorChange}
                        onAmountChange={onAmountChange}
                        onDateChange={onDateChange}
                        onProjectChange={onProjectChange}
                        onCategoryChange={onCategoryChange}
                        onPaymentChange={onPaymentChange}
                        onWorkerChange={onWorkerChange}
                        onPreview={stableOpenPreview}
                        onReplace={onReplacePick}
                        onConfirm={stableConfirmRow}
                        onRemove={stableRemoveRow}
                        onEditableKeyDown={onEditableKeyDown}
                      />
                    );
                  })}
                </div>
                <div ref={queueBottomSentinelRef} className="h-px w-full shrink-0" aria-hidden />
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

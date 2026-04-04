"use client";

import * as React from "react";
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
import { StatusBadge } from "@/components/base";
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
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { createBrowserClient } from "@/lib/supabase";
import { inferExpenseCategoryFromVendor } from "@/lib/receipt-infer-category";
import { processReceiptQueueUpload } from "@/lib/receipt-queue-process-upload";
import { finalizeReceiptQueueExpense } from "@/lib/receipt-queue-expense";
import {
  RECEIPT_QUEUE_CHANGED_EVENT,
  notifyReceiptQueueChanged,
  fetchReceiptQueueRows,
  insertReceiptQueueProcessing,
  updateReceiptQueueRow,
  deleteReceiptQueueRow,
  type ReceiptQueueRow,
} from "@/lib/receipt-queue";
import { AlertTriangle, Camera, Loader2, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";

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

function firstEditableFieldForRow(row: ReceiptQueueRow): "vendor" | "amount" | "date" {
  if (!row.vendor_name.trim()) return "vendor";
  if (amountIsMissing(row)) return "amount";
  return "vendor";
}

type FieldRefs = {
  vendor: Record<string, HTMLInputElement | null>;
  amount: Record<string, HTMLInputElement | null>;
  date: Record<string, HTMLInputElement | null>;
};

export function ReceiptQueueWorkspace() {
  const { toast } = useToast();
  const router = useRouter();
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const previewReplaceInputRef = React.useRef<HTMLInputElement>(null);
  const rowReuploadInputRef = React.useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ReceiptQueueRow[]>([]);
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [workers, setWorkers] = React.useState<WorkerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dragOver, setDragOver] = React.useState(false);
  const [bulkAdding, setBulkAdding] = React.useState(false);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = React.useState<Record<string, string>>({});
  const [receiptPreview, setReceiptPreview] = React.useState<{
    rowId: string;
    src: string;
    isPdf: boolean;
    fileName: string;
  } | null>(null);
  const receiptPreviewRef = React.useRef(receiptPreview);
  receiptPreviewRef.current = receiptPreview;
  const { openPreview, closePreview } = useAttachmentPreview();
  const debouncers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const fieldRefs = React.useRef<FieldRefs>({ vendor: {}, amount: {}, date: {} });
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const [paymentAccountRows, setPaymentAccountRows] = React.useState<PaymentAccountRow[]>([]);
  const queueAutoPaymentDoneRef = React.useRef<Set<string>>(new Set());
  const vendorPaymentSuggestTimers = React.useRef<Map<string, number>>(new Map());
  const [listFilter, setListFilter] = React.useState<"all" | "needs_fix">("all");
  const initialFocusAppliedRef = React.useRef(false);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const needsFixCount = React.useMemo(() => rows.filter(rowNeedsFix).length, [rows]);

  const displayedRows = React.useMemo(() => {
    if (listFilter === "needs_fix") return rows.filter(rowNeedsFix);
    return rows;
  }, [rows, listFilter]);

  const focusRowField = React.useCallback((field: "vendor" | "amount" | "date", rowId: string) => {
    const el = fieldRefs.current[field][rowId];
    el?.focus();
    el?.select();
  }, []);

  React.useEffect(() => {
    if (loading || rows.length === 0 || initialFocusAppliedRef.current) return;
    const fix = rows.filter((r) => rowNeedsFix(r) && r.status !== "processing");
    if (fix.length === 0) return;
    initialFocusAppliedRef.current = true;
    const row = fix[0];
    const field = firstEditableFieldForRow(row);
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        focusRowField(field, row.id);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [loading, rows, focusRowField]);

  const loadRows = React.useCallback(async () => {
    if (!supabase) {
      setRows([]);
      return;
    }
    try {
      const list = await fetchReceiptQueueRows(supabase);
      setRows(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load queue";
      toast({ title: "Receipt queue", description: msg, variant: "error" });
    }
  }, [supabase, toast]);

  const refreshAll = React.useCallback(async () => {
    let list: ReceiptQueueRow[] = [];
    let expList: Expense[] = [];
    let workerList: WorkerRow[] = [];
    const settled = await Promise.allSettled([
      supabase ? fetchReceiptQueueRows(supabase) : Promise.resolve([] as ReceiptQueueRow[]),
      getExpenses(),
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
    setRows(list);
    setExpenses(expList);
    setWorkers(workerList);
  }, [supabase, toast]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!supabase) {
          setProjects([]);
          return;
        }
        const { data: projectsData, error } = await supabase.from("projects").select("*");
        if (!cancelled) {
          if (error) setProjects([]);
          else setProjects(Array.isArray(projectsData) ? projectsData : []);
        }
        if (!cancelled) await refreshAll();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, refreshAll]);

  React.useEffect(() => {
    const onChange = () => void refreshAll();
    window.addEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RECEIPT_QUEUE_CHANGED_EVENT, onChange);
  }, [refreshAll]);

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
    (id: string, patch: Parameters<typeof updateReceiptQueueRow>[2]) => {
      if (!supabase) return;
      const prevT = debouncers.current.get(id);
      if (prevT) clearTimeout(prevT);
      debouncers.current.set(
        id,
        setTimeout(() => {
          debouncers.current.delete(id);
          void (async () => {
            try {
              await updateReceiptQueueRow(supabase, id, patch);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Save failed";
              toast({ title: "Queue row", description: msg, variant: "error" });
            }
          })();
        }, 450)
      );
    },
    [supabase, toast]
  );

  const patchRowImmediate = React.useCallback(
    async (id: string, patch: Parameters<typeof updateReceiptQueueRow>[2]) => {
      if (!supabase) return;
      try {
        await updateReceiptQueueRow(supabase, id, patch);
        setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        toast({ title: "Queue row", description: msg, variant: "error" });
      }
    },
    [supabase, toast]
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
      const t = debouncers.current.get(row.id);
      if (t) {
        clearTimeout(t);
        debouncers.current.delete(row.id);
      }
      try {
        await updateReceiptQueueRow(supabase, row.id, {
          vendor_name: row.vendor_name,
          amount: row.amount,
          expense_date: row.expense_date.slice(0, 10),
          payment_account_id: row.payment_account_id ?? null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        toast({ title: "Queue row", description: msg, variant: "error" });
      }
    },
    [supabase, toast]
  );

  const handleEnterSaveNav = React.useCallback(
    async (rowId: string, shiftKey: boolean) => {
      if (!supabase) return;
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row || row.status === "processing") return;
      await flushRowToDb(row);
      if (shiftKey) return;
      const all = rowsRef.current;
      const curIdx = all.findIndex((r) => r.id === rowId);
      if (curIdx === -1) return;
      let next: ReceiptQueueRow | undefined;
      for (let i = curIdx + 1; i < all.length; i++) {
        const r = all[i];
        if (rowNeedsFix(r) && r.status !== "processing") {
          next = r;
          break;
        }
      }
      if (next) {
        window.requestAnimationFrame(() => {
          focusRowField(firstEditableFieldForRow(next), next.id);
        });
      }
    },
    [supabase, flushRowToDb, focusRowField]
  );

  const onEditableKeyDown = React.useCallback(
    (row: ReceiptQueueRow) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key !== "Enter") return;
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      void handleEnterSaveNav(row.id, e.shiftKey);
    },
    [handleEnterSaveNav]
  );

  const runUploadForRow = React.useCallback(
    async (rowId: string, file: File) => {
      if (!supabase) return;
      try {
        await processReceiptQueueUpload(supabase, rowId, file, inferExpenseCategoryFromVendor);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Processing failed";
        await updateReceiptQueueRow(supabase, rowId, {
          status: "failed",
          error_message: msg,
        });
      }
      notifyReceiptQueueChanged();
      await refreshAll();
    },
    [supabase, refreshAll]
  );

  const enqueueFiles = React.useCallback(
    (files: FileList | File[] | null) => {
      if (!files?.length || !supabase) {
        if (!supabase) toast({ title: "Storage unavailable", variant: "error" });
        return;
      }
      const list = Array.from(files).filter((f) => f.size > 0);
      if (!list.length) return;
      for (const file of list) {
        void (async () => {
          let qid: string;
          try {
            qid = await insertReceiptQueueProcessing(supabase, file);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Enqueue failed";
            toast({ title: "Receipt queue", description: msg, variant: "error" });
            return;
          }
          notifyReceiptQueueChanged();
          await runUploadForRow(qid, file);
        })();
      }
      toast({
        title: `${list.length} file${list.length === 1 ? "" : "s"} queued`,
        description: "Processing in the background. You can leave this page.",
        variant: "success",
      });
    },
    [supabase, toast, refreshAll, runUploadForRow]
  );

  const replaceRowFile = React.useCallback(
    (rowId: string, file: File) => {
      if (!supabase) {
        toast({ title: "Storage unavailable", variant: "error" });
        return;
      }
      void (async () => {
        try {
          await updateReceiptQueueRow(supabase, rowId, {
            status: "processing",
            error_message: null,
            storage_path: null,
            receipt_public_url: null,
          });
          notifyReceiptQueueChanged();
          await refreshAll();
          await runUploadForRow(rowId, file);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Replace failed";
          toast({ title: "Receipt queue", description: msg, variant: "error" });
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
    [supabase, toast, refreshAll, runUploadForRow]
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

  const removeRow = React.useCallback(
    async (id: string) => {
      if (!supabase) return;
      setReceiptPreview((p) => (p?.rowId === id ? null : p));
      try {
        await deleteReceiptQueueRow(supabase, id);
        notifyReceiptQueueChanged();
        await refreshAll();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Remove failed";
        toast({ title: "Receipt queue", description: msg, variant: "error" });
      }
    },
    [supabase, toast, refreshAll]
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

  const confirmRow = async (row: ReceiptQueueRow) => {
    const total = Number(row.amount);
    if (!Number.isFinite(total) || total <= 0) {
      toast({ title: "Amount required", variant: "error" });
      return;
    }
    if (row.status === "processing" || !supabase) return;
    setConfirmingId(row.id);
    try {
      await finalizeReceiptQueueExpense(supabase, row, "confirm");
      toast({ title: "Expense created", variant: "success" });
      await refreshAll();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast({ title: "Create failed", description: msg, variant: "error" });
    } finally {
      setConfirmingId(null);
    }
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
      await refreshAll();
      router.refresh();
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
  }, [rows, supabase, toast, refreshAll, router, previewUrls]);

  const openRowPreview = (row: ReceiptQueueRow) => {
    const src = previewUrls[row.id];
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

  const onReplacePick = (rowId: string) => {
    setReplaceTargetId(rowId);
    requestAnimationFrame(() => {
      rowReuploadInputRef.current?.click();
    });
  };

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <PageHeader
          className="[&_h1]:text-[#111827] [&_p]:text-[#6B7280]"
          title="Receipt queue"
          description="Uploads persist across sessions. In vendor, amount, or date: Enter saves and jumps to the next row that needs attention; Shift+Enter saves only. Add all imports in bulk (needs review)."
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 rounded-sm" asChild>
                <Link href="/financial/expenses">Expenses</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                disabled={bulkAdding || !supabase || addAllEligibleCount === 0}
                onClick={() => void handleAddAll()}
              >
                {bulkAdding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Adding" />
                ) : (
                  `Add all (${addAllEligibleCount})`
                )}
              </Button>
            </div>
          }
        />

        {!supabase ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
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
              onChange={(e) => {
                enqueueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                enqueueFiles(e.target.files);
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                Take photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload files
              </Button>
            </div>
            <div
              className={cn(
                "flex min-h-[72px] flex-col items-center justify-center gap-1 border border-dashed border-border/60 py-6 text-xs text-muted-foreground transition-colors",
                dragOver && "border-foreground/50"
              )}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                enqueueFiles(e.dataTransfer.files);
              }}
            >
              <span>Drop files here to add to the queue</span>
            </div>
          </>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items in the queue.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/80 bg-[#FFFBEB] px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
              <div className="flex min-w-0 items-center gap-2 text-sm text-[#78350f] dark:text-amber-100">
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
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
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                <p className="text-[11px] text-amber-900/75 dark:text-amber-200/80">
                  Enter: save &amp; next · Shift+Enter: save
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant={listFilter === "all" ? "outline" : "ghost"}
                    size="sm"
                    className="h-8 rounded-sm"
                    onClick={() => setListFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    variant={listFilter === "needs_fix" ? "outline" : "ghost"}
                    size="sm"
                    className="h-8 rounded-sm"
                    onClick={() => setListFilter("needs_fix")}
                  >
                    Needs fix ({needsFixCount})
                  </Button>
                </div>
              </div>
            </div>

            {displayedRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No rows in this view.{" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                  onClick={() => setListFilter("all")}
                >
                  Show all
                </button>
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[52px] text-[10px] uppercase tracking-wide">
                      {" "}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide">File</TableHead>
                    <TableHead className="w-[100px] text-[10px] uppercase tracking-wide">
                      Status
                    </TableHead>
                    <TableHead className="min-w-[120px] text-[10px] uppercase tracking-wide">
                      Vendor
                    </TableHead>
                    <TableHead className="w-[100px] text-[10px] uppercase tracking-wide">
                      Amount
                    </TableHead>
                    <TableHead className="w-[130px] text-[10px] uppercase tracking-wide">
                      Date
                    </TableHead>
                    <TableHead className="min-w-[140px] text-[10px] uppercase tracking-wide">
                      Project
                    </TableHead>
                    <TableHead className="min-w-[120px] text-[10px] uppercase tracking-wide">
                      Category
                    </TableHead>
                    <TableHead className="min-w-[130px] text-[10px] uppercase tracking-wide">
                      Payment
                    </TableHead>
                    <TableHead className="w-[100px] text-[10px] uppercase tracking-wide">
                      {" "}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.map((row) => {
                    const prev = previewUrls[row.id];
                    const st = queueStatusBadge(row.status);
                    const busy = row.status === "processing";
                    const dup = dupWarning(row);
                    const needsHighlight = rowNeedsFix(row) && !busy;
                    const vendorMissing = !busy && row.vendor_name.trim() === "";
                    const showAmountHint = !busy && amountIsMissing(row);
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "table-row-compact",
                          needsHighlight &&
                            "bg-[#FFFBEB] hover:bg-[#FEF3C7] dark:bg-amber-950/35 dark:hover:bg-amber-950/50",
                          needsHighlight &&
                            "shadow-[inset_3px_0_0_0_#F59E0B] dark:shadow-[inset_3px_0_0_0_rgb(245,158,11)]"
                        )}
                      >
                        <TableCell className="p-2">
                          <button
                            type="button"
                            disabled={busy || !prev}
                            aria-label="Preview receipt"
                            className={cn(
                              "relative h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-border/60 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              busy || !prev
                                ? "cursor-not-allowed opacity-60"
                                : "cursor-pointer hover:opacity-95"
                            )}
                            onClick={() => openRowPreview(row)}
                          >
                            {row.mime_type === "application/pdf" ||
                            row.file_name.toLowerCase().endsWith(".pdf") ? (
                              <div className="flex h-full w-full items-center justify-center bg-background text-[9px] font-medium text-muted-foreground">
                                PDF
                              </div>
                            ) : prev ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={prev} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                                —
                              </div>
                            )}
                            {busy ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : null}
                          </button>
                        </TableCell>
                        <TableCell className="max-w-[180px] p-2">
                          <p className="truncate text-xs font-medium">{row.file_name || "—"}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            OCR: {row.ocr_source}
                          </p>
                          {row.error_message ? (
                            <p className="text-[11px] text-destructive">{row.error_message}</p>
                          ) : null}
                          {dup ? (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300">{dup}</p>
                          ) : null}
                          {row.status === "failed" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-7 px-2 text-xs"
                              onClick={() => onReplacePick(row.id)}
                            >
                              Re-upload
                            </Button>
                          ) : null}
                        </TableCell>
                        <TableCell className="p-2">
                          <StatusBadge label={st.label} variant={st.variant} />
                        </TableCell>
                        <TableCell className="p-1 align-top">
                          <div className="space-y-0.5">
                            <Input
                              ref={(el) => {
                                fieldRefs.current.vendor[row.id] = el;
                              }}
                              placeholder="Vendor"
                              value={row.vendor_name}
                              disabled={busy}
                              onChange={(e) => {
                                const v = e.target.value;
                                queueAutoPaymentDoneRef.current.delete(row.id);
                                setRows((r) =>
                                  r.map((x) => (x.id === row.id ? { ...x, vendor_name: v } : x))
                                );
                                patchRowDebounced(row.id, { vendor_name: v });
                                queueVendorPaymentSuggest(row.id, v);
                              }}
                              onKeyDown={onEditableKeyDown(row)}
                              className="h-8 text-xs"
                              autoComplete="off"
                            />
                            {vendorMissing ? (
                              <p
                                className="flex items-center gap-1 text-[11px] text-amber-800 dark:text-amber-200"
                                role="status"
                              >
                                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                Vendor missing
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="p-1 align-top">
                          <div className="space-y-0.5">
                            <Input
                              ref={(el) => {
                                fieldRefs.current.amount[row.id] = el;
                              }}
                              placeholder="Amount"
                              inputMode="decimal"
                              value={row.amount}
                              disabled={busy}
                              onChange={(e) => {
                                const v = e.target.value;
                                setRows((r) =>
                                  r.map((x) => (x.id === row.id ? { ...x, amount: v } : x))
                                );
                                patchRowDebounced(row.id, { amount: v });
                              }}
                              onKeyDown={onEditableKeyDown(row)}
                              className="h-8 tabular-nums text-xs"
                              autoComplete="off"
                            />
                            {showAmountHint ? (
                              <p
                                className="flex items-center gap-1 text-[11px] text-amber-800 dark:text-amber-200"
                                role="status"
                              >
                                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                $—
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="p-1 align-top">
                          <Input
                            ref={(el) => {
                              fieldRefs.current.date[row.id] = el;
                            }}
                            type="date"
                            value={row.expense_date.slice(0, 10)}
                            disabled={busy}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((r) =>
                                r.map((x) => (x.id === row.id ? { ...x, expense_date: v } : x))
                              );
                              patchRowDebounced(row.id, { expense_date: v });
                            }}
                            onKeyDown={onEditableKeyDown(row)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <select
                            className="h-8 w-full max-w-[200px] rounded border border-input bg-transparent px-2 text-xs"
                            value={row.project_id ?? ""}
                            disabled={busy}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              void patchRowImmediate(row.id, { project_id: v });
                            }}
                          >
                            <option value="">Project…</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name ?? p.id}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="p-1">
                          <ExpenseCategorySelect
                            value={row.category}
                            disabled={busy}
                            onValueChange={(v) => void patchRowImmediate(row.id, { category: v })}
                            className="h-8 w-full max-w-[180px] rounded border border-input bg-transparent px-2 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1 align-top">
                          <PaymentAccountSelect
                            value={row.payment_account_id ?? ""}
                            disabled={busy}
                            onValueChange={(id) => {
                              const next = id.trim() ? id : null;
                              if (!next) queueAutoPaymentDoneRef.current.delete(row.id);
                              void patchRowImmediate(row.id, { payment_account_id: next });
                            }}
                            className="h-8 w-full max-w-[180px] rounded border border-input bg-transparent px-2 text-xs"
                            onKeyDown={onEditableKeyDown(row)}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="flex flex-col gap-1">
                            {workers.length > 0 ? (
                              <select
                                className="h-8 w-full rounded border border-input bg-transparent px-2 text-[11px]"
                                value={row.worker_id ?? ""}
                                disabled={busy}
                                onChange={(e) => {
                                  const v = e.target.value || null;
                                  void patchRowImmediate(row.id, { worker_id: v });
                                }}
                              >
                                <option value="">Company</option>
                                {workers.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 flex-1 text-xs"
                                disabled={busy || bulkAdding || confirmingId === row.id}
                                onClick={() => void confirmRow(row)}
                              >
                                {confirmingId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  "Confirm"
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                disabled={busy}
                                onClick={() => void removeRow(row.id)}
                                aria-label="Remove"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

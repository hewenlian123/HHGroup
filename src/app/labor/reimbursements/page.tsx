"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import {
  getLaborWorkersList,
  getProjects,
  updateWorkerReimbursement,
  type WorkerReimbursement,
  type WorkerReimbursementStatus,
} from "@/lib/data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { createBrowserClient } from "@/lib/supabase";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  MoreHorizontal,
  Paperclip,
  Search,
  Wallet,
} from "lucide-react";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { DeleteRowAction } from "@/components/base";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const STATUS_OPTIONS: WorkerReimbursementStatus[] = ["pending", "paid"];

const rbShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const rbKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 md:h-8 md:w-8 dark:bg-muted dark:text-muted-foreground";

function hasReceiptUrl(r: WorkerReimbursement): boolean {
  return Boolean((r.receiptUrl ?? "").trim());
}

const receiptPillAttachedInteractive =
  "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border border-emerald-500/12 bg-emerald-500/[0.04] px-2 py-0.5 text-[10px] font-medium tabular-nums text-emerald-950 shadow-none transition-colors hover:bg-emerald-500/[0.08] dark:border-emerald-500/14 dark:bg-emerald-500/[0.06] dark:text-emerald-100/88";

const receiptPillMissing =
  "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border border-amber-500/10 bg-amber-500/[0.03] px-2 py-0.5 text-[10px] font-normal tabular-nums text-amber-900/65 dark:border-amber-500/10 dark:bg-amber-500/[0.04] dark:text-amber-100/60";

function ReimbursementStatusChip({
  status,
  hasReceipt,
}: {
  status: WorkerReimbursementStatus;
  hasReceipt?: boolean;
}) {
  const chipBase =
    "inline-flex w-fit min-h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums tracking-tight shadow-none";
  if (status === "paid") {
    return (
      <span
        className={cn(
          chipBase,
          "border-zinc-200/70 bg-zinc-50/70 text-zinc-600 dark:border-border/50 dark:bg-muted/20 dark:text-muted-foreground"
        )}
      >
        <span
          className="h-1 w-1 shrink-0 rounded-full bg-zinc-400/60 dark:bg-zinc-500/70"
          aria-hidden
        />
        Paid
      </span>
    );
  }
  if (hasReceipt) {
    return (
      <span
        className={cn(
          chipBase,
          "border-emerald-500/10 bg-emerald-500/[0.03] text-emerald-900/78 dark:border-emerald-500/12 dark:bg-emerald-500/[0.05] dark:text-emerald-100/82"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500/50" aria-hidden />
        Ready to pay
      </span>
    );
  }
  return (
    <span
      className={cn(
        chipBase,
        "border-amber-500/8 bg-amber-500/[0.025] text-amber-900/72 dark:border-amber-500/10 dark:bg-amber-500/[0.04] dark:text-amber-100/72"
      )}
    >
      <span
        className="h-1 w-1 shrink-0 rounded-full bg-amber-500/50 dark:bg-amber-400/50"
        aria-hidden
      />
      Pending
    </span>
  );
}

export default function WorkerReimbursementsPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getLaborWorkersList>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<WorkerReimbursement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const [sort, setSort] = React.useState<{
    key: "reimbursementDate" | "createdAt" | "amount" | "status";
    dir: "asc" | "desc";
  }>({
    key: "reimbursementDate",
    dir: "desc",
  });
  const [form, setForm] = React.useState({
    workerId: "",
    projectId: "",
    vendor: "",
    amount: "",
    receiptUrl: "",
    description: "",
    reimbursementDate: todayLocalISODate(),
    status: "pending" as WorkerReimbursementStatus,
  });
  const { openPreview } = useAttachmentPreview();
  const [payModal, setPayModal] = React.useState<{ id: string; amount: number } | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState("");
  const [payNote, setPayNote] = React.useState("");
  const [payError, setPayError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [schemaWarning, setSchemaWarning] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [batchPaymentModal, setBatchPaymentModal] = React.useState<{
    workerId: string;
    workerName: string;
    items: WorkerReimbursement[];
    totalAmount: number;
  } | null>(null);
  const [batchPayMethod, setBatchPayMethod] = React.useState("");
  const [batchPayNote, setBatchPayNote] = React.useState("");
  const [batchPaySubmitting, setBatchPaySubmitting] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setSchemaWarning(null);
    try {
      const [w, p, res] = await Promise.all([
        getLaborWorkersList(),
        getProjects(),
        fetch("/api/worker-reimbursements", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setWorkers(w);
      setProjects(p);
      if (res.schemaWarning) setSchemaWarning(res.schemaWarning);
      if (!res.reimbursements) throw new Error(res.message ?? "Failed to load reimbursements.");
      setRows(res.reimbursements);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const workerById = React.useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);
  const projectById = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => {
          const worker = r.workerName ?? workerById.get(r.workerId) ?? r.workerId ?? "";
          const project =
            r.projectName ??
            (r.projectId ? (projectById.get(r.projectId) ?? r.projectId) : "") ??
            "";
          const vendor = (r.vendor ?? "").toLowerCase();
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
            vendor.includes(q) ||
            String(r.amount ?? "")
              .toLowerCase()
              .includes(q) ||
            (r.description ?? "").toLowerCase().includes(q) ||
            (r.receiptUrl ?? "").toLowerCase().includes(q) ||
            (r.status ?? "").toLowerCase().includes(q)
          );
        })
      : rows;

    const dir = sort.dir === "asc" ? 1 : -1;
    const sorted = [...base].sort((a, b) => {
      if (sort.key === "amount") return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      if (sort.key === "status")
        return (String(a.status).localeCompare(String(b.status)) || 0) * dir;
      if (sort.key === "reimbursementDate") {
        const da = a.reimbursementDate || String(a.createdAt ?? "").slice(0, 10);
        const db = b.reimbursementDate || String(b.createdAt ?? "").slice(0, 10);
        return (da.localeCompare(db) || 0) * dir;
      }
      return (String(a.createdAt).localeCompare(String(b.createdAt)) || 0) * dir;
    });
    return sorted;
  }, [rows, query, workerById, projectById, sort]);

  const reimbursementStats = React.useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending");
    const paid = rows.filter((r) => r.status === "paid");
    const pendingTotal = pending.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const paidTotal = paid.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const missingReceipt = pending.filter((r) => !hasReceiptUrl(r)).length;
    const readyToPay = pending.filter((r) => hasReceiptUrl(r)).length;
    return {
      pendingCount: pending.length,
      missingReceipt,
      readyToPay,
      pendingTotal,
      paidCount: paid.length,
      paidTotal,
    };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const resetForm = () => {
    setForm({
      workerId: "",
      projectId: "",
      vendor: "",
      amount: "",
      receiptUrl: "",
      description: "",
      reimbursementDate: todayLocalISODate(),
      status: "pending",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const openNewReimbursementForm = () => {
    setEditingId(null);
    setForm({
      workerId: "",
      projectId: "",
      vendor: "",
      amount: "",
      receiptUrl: "",
      description: "",
      reimbursementDate: todayLocalISODate(),
      status: "pending",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workerId) {
      setMessage("Select a worker.");
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) {
      setMessage("Enter a valid amount.");
      return;
    }
    const reimbursementDate = form.reimbursementDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reimbursementDate)) {
      setMessage("Enter a valid date.");
      return;
    }
    setMessage(null);
    try {
      if (editingId) {
        await updateWorkerReimbursement(editingId, {
          workerId: form.workerId,
          projectId: form.projectId || null,
          vendor: form.vendor.trim() || null,
          amount,
          receiptUrl: form.receiptUrl.trim() || null,
          description: form.description.trim() || null,
          status: form.status,
          reimbursementDate,
        });
      } else {
        const res = await fetch("/api/worker-reimbursements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workerId: form.workerId,
            projectId: form.projectId || null,
            vendor: form.vendor.trim() || null,
            amount,
            receiptUrl: form.receiptUrl.trim() || null,
            description: form.description.trim() || null,
            status: form.status,
            reimbursementDate,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Failed to create reimbursement.");
        }
      }
      resetForm();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const handleDelete = async (id: string) => {
    setMessage(null);
    let snapshot: WorkerReimbursement[] | undefined;
    setRows((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });
    try {
      const res = await fetch(`/api/worker-reimbursements/${id}`, { method: "DELETE" });
      if (res.status === 404) {
        void load();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Delete failed.");
      }
      void load();
    } catch (e) {
      if (snapshot) setRows(snapshot);
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const openPayModal = (r: WorkerReimbursement) => {
    setPayModal({ id: r.id, amount: r.amount });
    setPayAmount(String(r.amount));
    setPayMethod("");
    setPayNote("");
    setPayError(null);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    setBusyId(payModal.id);
    setMessage(null);
    setPayError(null);
    try {
      const res = await fetch(`/api/worker-reimbursements/${payModal.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: payMethod.trim() || null, note: payNote.trim() || null }),
      });
      const data = await res.json();
      if (res.status === 404) {
        const msg = (data.message ?? "").toLowerCase();
        if (msg.includes("not found") || msg.includes("already deleted")) {
          setPayModal(null);
          await load();
          return;
        }
      }
      if (!res.ok) {
        setPayError(data.message ?? "Pay failed.");
        return;
      }
      setPayModal(null);
      await load();
      // Keep user on Reimbursements page; expense is created in background.
      setMessage(data.expenseWarning ? `已标记为已付款。${data.expenseWarning}` : "已标记为已付款");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Pay failed.";
      setPayError(errMsg);
      setMessage(errMsg);
    } finally {
      setBusyId(null);
    }
  };

  const projectIds = React.useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const handleEdit = (row: WorkerReimbursement) => {
    const projectId = row.projectId && projectIds.has(row.projectId) ? row.projectId : "";
    setForm({
      workerId: row.workerId,
      projectId,
      vendor: row.vendor ?? "",
      amount: String(row.amount ?? 0),
      receiptUrl: row.receiptUrl ?? "",
      description: row.description ?? "",
      reimbursementDate:
        row.reimbursementDate?.trim().slice(0, 10) ||
        String(row.createdAt ?? "").slice(0, 10) ||
        todayLocalISODate(),
      status: (row.status as WorkerReimbursementStatus) ?? "pending",
    });
    setEditingId(row.id);
    setShowForm(true);
  };

  const toggleSort = (key: "reimbursementDate" | "createdAt" | "amount" | "status") => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const pendingOnPage = React.useMemo(() => paged.filter((r) => r.status === "pending"), [paged]);
  const toggleSelection = (id: string, status: string) => {
    if (status !== "pending") return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllPendingOnPage = () => {
    const pendingIds = new Set(pendingOnPage.map((r) => r.id));
    setSelectedIds((prev) => {
      const allSelected = pendingIds.size > 0 && Array.from(pendingIds).every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        pendingIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...Array.from(prev), ...Array.from(pendingIds)]);
    });
  };
  const selectedRows = React.useMemo(
    () => (selectedIds.size === 0 ? [] : filtered.filter((r) => selectedIds.has(r.id))),
    [filtered, selectedIds]
  );
  const selectedSameWorker =
    selectedRows.length <= 1 || selectedRows.every((r) => r.workerId === selectedRows[0].workerId);
  const openCreateWorkerPayment = () => {
    if (selectedRows.length === 0 || !selectedSameWorker) return;
    const workerId = selectedRows[0].workerId;
    const workerNameStr = workerName(selectedRows[0]);
    const totalAmount = selectedRows.reduce((s, r) => s + (r.amount ?? 0), 0);
    setBatchPaymentModal({
      workerId,
      workerName: String(workerNameStr ?? "—"),
      items: selectedRows,
      totalAmount,
    });
    setBatchPayMethod("");
    setBatchPayNote("");
  };
  const handleBatchPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchPaymentModal) return;
    setBatchPaySubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/worker-reimbursements/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reimbursementIds: batchPaymentModal.items.map((r) => r.id),
          paymentMethod: batchPayMethod.trim() || null,
          note: batchPayNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create payment.");
      setBatchPaymentModal(null);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Create payment failed.");
    } finally {
      setBatchPaySubmitting(false);
    }
  };

  const workerName = (r: WorkerReimbursement) =>
    r.workerName ?? workerById.get(r.workerId) ?? r.workerId;
  const projectName = (r: WorkerReimbursement) =>
    r.projectName ?? (r.projectId ? (projectById.get(r.projectId) ?? r.projectId) : null) ?? "—";

  function ActionsDropdown({ r }: { r: WorkerReimbursement }) {
    const isBusy = busyId === r.id;
    return (
      <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity duration-200 md:gap-1 md:opacity-[0.28] md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <DeleteRowAction
          disabled={isBusy}
          className="h-11 w-11 text-muted-foreground/45 hover:bg-zinc-100/90 hover:text-red-600 dark:hover:bg-muted/45 md:h-8 md:w-8 md:text-muted-foreground/35 md:hover:text-red-600"
          onDelete={() => handleDelete(r.id)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-sm text-muted-foreground/55 touch-manipulation hover:bg-zinc-100/70 hover:text-foreground dark:hover:bg-muted/40 md:h-8 md:w-8 md:min-h-8 md:min-w-8 md:text-muted-foreground/35 md:hover:text-foreground"
              aria-label="Actions"
            >
              <MoreHorizontal className="h-4 w-4 opacity-55 md:opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            {r.status === "pending" && (
              <>
                <DropdownMenuItem disabled={isBusy} onSelect={() => openPayModal(r)}>
                  {isBusy ? "…" : "Mark as Paid"}
                </DropdownMenuItem>
                {r.receiptUrl && (
                  <DropdownMenuItem
                    onSelect={() => {
                      const u = r.receiptUrl;
                      if (!u) return;
                      void (async () => {
                        const signed = await resolvePreviewSignedUrl({
                          supabase,
                          rawUrlOrPath: u,
                          ttlSec: 3600,
                          bucketCandidates: ["worker-receipts", "receipts", "expense-attachments"],
                        });
                        openPreview({ url: signed || u, fileName: "Receipt" });
                      })();
                    }}
                  >
                    View Receipt
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => handleEdit(r)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => handleDelete(r.id)}
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const sortFilterActive = sort.key !== "reimbursementDate" || sort.dir !== "desc" ? 1 : 0;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[430px] flex-col gap-0.5 bg-zinc-50 px-4 py-1 pb-2.5 dark:bg-background sm:max-w-[460px] md:max-w-6xl md:gap-0.5 md:px-6 md:pb-3 md:pt-0.5",
        mobileListPagePaddingClass,
        "max-md:!gap-0.5"
      )}
    >
      <div className="hidden md:block">
        <PageHeader
          className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
          title="Worker Reimbursements"
          subtitle="Review pending reimbursements, receipts, and payouts before marking paid."
          actions={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <Link
                href="/financial/workers"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center sm:mr-2 md:text-[13px] md:text-muted-foreground/85 md:hover:text-foreground"
              >
                Worker Balances
              </Link>
              <Link
                href="/labor/receipts"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center sm:mr-2 md:text-[13px] md:text-muted-foreground/85 md:hover:text-foreground"
              >
                Receipt Uploads
              </Link>
              <Link
                href="/labor"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center sm:mr-2 md:text-[13px] md:text-muted-foreground/85 md:hover:text-foreground"
              >
                Labor
              </Link>
              <Button
                size="sm"
                variant="outline"
                className="w-full max-md:min-h-11 sm:w-auto md:shadow-none"
                onClick={openNewReimbursementForm}
              >
                + New Reimbursement
              </Button>
            </div>
          }
        />
      </div>
      <MobileListHeader
        title="Reimbursements"
        fab={
          <MobileFabButton
            ariaLabel="New reimbursement"
            onClick={openNewReimbursementForm}
            className="h-11 w-11 min-h-[44px] min-w-[44px]"
          />
        }
      />

      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-100/90 pb-0.5 dark:border-border/50 md:pb-0.5"
        aria-label="Reimbursement queue summary"
      >
        <span className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-200/85 bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-border/55 dark:bg-card md:min-h-9">
          <span className="font-semibold tabular-nums text-foreground">
            {reimbursementStats.pendingCount}
          </span>
          Pending
        </span>
        <span className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-amber-500/15 bg-amber-500/[0.05] px-2.5 py-1.5 text-[11px] text-amber-950/75 dark:border-amber-500/12 dark:bg-amber-500/[0.07] dark:text-amber-100/80 md:min-h-9">
          <span className="font-semibold tabular-nums text-amber-950 dark:text-amber-50">
            {reimbursementStats.missingReceipt}
          </span>
          Missing receipt
        </span>
        <span className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-emerald-500/18 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[11px] text-emerald-950/80 dark:border-emerald-500/22 dark:bg-emerald-500/10 dark:text-emerald-100/85 md:min-h-9">
          <span className="font-semibold tabular-nums text-emerald-950 dark:text-emerald-50">
            {reimbursementStats.readyToPay}
          </span>
          Ready to pay
        </span>
      </div>

      <div className="-mt-px grid grid-cols-2 gap-1.5 md:grid-cols-4 md:gap-1.5">
        <div
          className={cn(
            rbShell,
            "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
          )}
        >
          <span className={rbKpiIcon}>
            <AlertCircle className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
              In queue
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
              {reimbursementStats.pendingCount}
            </p>
          </div>
        </div>
        <div
          className={cn(
            rbShell,
            "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
          )}
        >
          <span className={rbKpiIcon}>
            <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
              Owed (pending)
            </p>
            <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
              ${fmtUsd(reimbursementStats.pendingTotal)}
            </p>
          </div>
        </div>
        <div
          className={cn(
            rbShell,
            "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
          )}
        >
          <span className={rbKpiIcon}>
            <CheckCircle2 className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
              Paid items
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
              {reimbursementStats.paidCount}
            </p>
          </div>
        </div>
        <div
          className={cn(
            rbShell,
            "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
          )}
        >
          <span className={rbKpiIcon}>
            <Wallet className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
              Paid out
            </p>
            <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
              ${fmtUsd(reimbursementStats.paidTotal)}
            </p>
          </div>
        </div>
      </div>

      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={sortFilterActive}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Worker, project, vendor…"
              className="h-11 min-h-[44px] pl-8 text-sm md:h-10 md:min-h-0"
              aria-label="Search reimbursements"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sort by</p>
          <Select
            value={sort.key}
            onChange={(e) =>
              setSort((s) => ({
                ...s,
                key: e.target.value as "reimbursementDate" | "createdAt" | "amount" | "status",
              }))
            }
            className="w-full"
          >
            <option value="reimbursementDate">Date</option>
            <option value="createdAt">Recorded</option>
            <option value="amount">Amount</option>
            <option value="status">Status</option>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Order</p>
          <Select
            value={sort.dir}
            onChange={(e) => setSort((s) => ({ ...s, dir: e.target.value as "asc" | "desc" }))}
            className="w-full"
          >
            <option value="desc">Newest / high first</option>
            <option value="asc">Oldest / low first</option>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-sm"
          disabled={selectedIds.size === 0 || !selectedSameWorker || selectedRows.length === 0}
          onClick={() => {
            openCreateWorkerPayment();
            setFiltersOpen(false);
          }}
        >
          Create Worker Payment
          {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
        </Button>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>
      {schemaWarning ? (
        <div className="rounded-lg border border-amber-200/80 bg-background px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:text-amber-500">
          {schemaWarning} Run Labor schema migration (e.g. ensure labor tables) or check Supabase
          Project Settings → API → Reload schema.
        </div>
      ) : null}
      <FilterBar className="hidden md:block md:pt-0 md:pb-0">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="space-y-1 min-w-[200px] flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Search
            </p>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Worker, project, vendor…"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full max-md:min-h-11 sm:w-auto"
            disabled={selectedIds.size === 0 || !selectedSameWorker || selectedRows.length === 0}
            onClick={openCreateWorkerPayment}
          >
            Create Worker Payment
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
        </div>
      </FilterBar>
      {message ? (
        <div className="rounded-lg border border-gray-100 bg-background px-3 py-2 text-sm text-muted-foreground dark:border-border">
          {message}
        </div>
      ) : null}

      {showForm && (
        <div className="border-b border-gray-100 pb-4 dark:border-border/60">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {editingId ? "Edit Reimbursement" : "New Reimbursement"}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em] block mb-1">
                Date
              </label>
              <Input
                type="date"
                value={form.reimbursementDate}
                onChange={(e) => setForm((f) => ({ ...f, reimbursementDate: e.target.value }))}
                className="h-9 w-[140px] rounded-sm"
                required
                aria-label="Reimbursement date"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em] block mb-1">
                Worker
              </label>
              <Select
                value={form.workerId}
                onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
                className="min-w-[140px]"
                required
              >
                <option value="">Select worker</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em] block mb-1">
                Project
              </label>
              <Select
                value={form.projectId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="min-w-[140px]"
                aria-label="Project"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name ?? p.id}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Vendor
              </label>
              <Input
                type="text"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="Vendor"
                className="h-9 min-w-[120px] rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Amount
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-9 w-24 rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Receipt URL
              </label>
              <Input
                type="text"
                value={form.receiptUrl}
                onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))}
                placeholder="Link"
                className="h-9 min-w-[160px] rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Description
              </label>
              <Input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                className="h-9 min-w-[120px] rounded-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em] block mb-1">
                Status
              </label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as WorkerReimbursementStatus }))
                }
                className="min-w-[100px]"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </form>
        </div>
      )}

      <div className="md:hidden">
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : paged.length === 0 ? (
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No reimbursements yet."
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {paged.map((r) => (
              <div
                key={r.id}
                className={cn(
                  rbShell,
                  "flex flex-col gap-2 px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.04),0_2px_12px_rgba(0,0,0,0.04)]",
                  r.status === "pending" &&
                    hasReceiptUrl(r) &&
                    "border-l-[3px] border-l-emerald-500/35 pl-[calc(0.75rem-3px)]",
                  r.status === "pending" &&
                    !hasReceiptUrl(r) &&
                    "border-l-[3px] border-l-amber-500/30 pl-[calc(0.75rem-3px)]"
                )}
              >
                <div className="flex items-start gap-2">
                  {r.status === "pending" ? (
                    <label className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-sm touch-manipulation">
                      <input
                        type="checkbox"
                        aria-label={`Select ${workerName(r)}`}
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelection(r.id, r.status)}
                        className="h-4 w-4 shrink-0 rounded border-input"
                      />
                    </label>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-[14px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                      {workerName(r)}
                    </p>
                    {r.paidAt ? (
                      <p className="text-[10px] tabular-nums text-muted-foreground/70">
                        Paid {String(r.paidAt).slice(0, 10)}
                      </p>
                    ) : null}
                    <p className="truncate text-[11px] leading-snug text-muted-foreground">
                      {r.projectId && projectName(r) !== "—" ? projectName(r) : "No project"}
                    </p>
                    <p className="truncate text-[12px] font-medium leading-snug text-zinc-800 dark:text-zinc-100">
                      {r.vendor?.trim() ? r.vendor : "No vendor"}
                    </p>
                    {r.description?.trim() ? (
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {r.description.trim()}
                      </p>
                    ) : null}
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {r.reimbursementDate || (r.createdAt ?? "").slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                      <span className="text-base font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-foreground">
                        ${fmtUsd(r.amount)}
                      </span>
                      <ReimbursementStatusChip status={r.status} hasReceipt={hasReceiptUrl(r)} />
                      {r.receiptUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            const u = r.receiptUrl;
                            if (!u) return;
                            void (async () => {
                              const signed = await resolvePreviewSignedUrl({
                                supabase,
                                rawUrlOrPath: u,
                                ttlSec: 3600,
                                bucketCandidates: [
                                  "worker-receipts",
                                  "receipts",
                                  "expense-attachments",
                                ],
                              });
                              openPreview({ url: signed || u, fileName: "Receipt" });
                            })();
                          }}
                          aria-label="Preview receipt"
                          className={cn(
                            receiptPillAttachedInteractive,
                            "min-h-[44px] touch-manipulation md:min-h-0"
                          )}
                        >
                          <Paperclip
                            className="h-3 w-3 shrink-0 opacity-90"
                            strokeWidth={2}
                            aria-hidden
                          />
                          Receipt
                        </button>
                      ) : (
                        <span
                          className={cn(receiptPillMissing, "min-h-[44px] md:min-h-0")}
                          aria-label="No receipt"
                        >
                          <span
                            className="h-1 w-1 shrink-0 rounded-full bg-amber-400/55 dark:bg-amber-400/45"
                            aria-hidden
                          />
                          No receipt
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end border-t border-zinc-100/80 pt-1.5 dark:border-border/45">
                  <ActionsDropdown r={r} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
        <div className={cn(rbShell, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/90 dark:border-border/60 dark:bg-muted/20">
                  <th className="w-12 px-2 py-1.5 text-center">
                    <div className="flex min-h-10 min-w-10 items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label="Select all pending on page"
                        checked={
                          pendingOnPage.length > 0 &&
                          pendingOnPage.every((r) => selectedIds.has(r.id))
                        }
                        onChange={selectAllPendingOnPage}
                        className="h-4 w-4 rounded border-input"
                      />
                    </div>
                  </th>
                  <th
                    className="w-[88px] whitespace-nowrap px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none tabular-nums"
                    onClick={() => toggleSort("reimbursementDate")}
                  >
                    Date
                  </th>
                  <th className="min-w-[128px] px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Worker
                  </th>
                  <th className="max-w-[140px] min-w-[100px] px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Project
                  </th>
                  <th className="min-w-[160px] px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Review item
                  </th>
                  <th
                    className="w-[92px] whitespace-nowrap px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none tabular-nums"
                    onClick={() => toggleSort("amount")}
                  >
                    Amount
                  </th>
                  <th
                    className="w-[108px] whitespace-nowrap px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none"
                    onClick={() => toggleSort("status")}
                  >
                    Status
                  </th>
                  <th className="w-[88px] whitespace-nowrap px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Receipt
                  </th>
                  <th className="w-24 px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="border-b border-border/40">
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      Loading…
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr className="border-b border-border/40">
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      No reimbursements yet.
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        listTableRowClassName,
                        "group border-b border-zinc-100/80 transition-colors hover:bg-zinc-50/70 dark:border-border/40 dark:hover:bg-muted/15",
                        r.status === "pending" &&
                          hasReceiptUrl(r) &&
                          "bg-emerald-500/[0.03] shadow-[inset_3px_0_0_0_rgba(16,185,129,0.28)] hover:bg-emerald-500/[0.05] dark:bg-emerald-500/[0.04] dark:hover:bg-emerald-500/[0.06] dark:shadow-[inset_3px_0_0_0_rgba(52,211,153,0.22)]",
                        r.status === "pending" &&
                          !hasReceiptUrl(r) &&
                          "bg-amber-500/[0.03] shadow-[inset_3px_0_0_0_rgba(245,158,11,0.26)] hover:bg-amber-500/[0.045] dark:bg-amber-500/[0.05] dark:hover:bg-amber-500/[0.07] dark:shadow-[inset_3px_0_0_0_rgba(251,191,36,0.2)]"
                      )}
                      onClick={() => handleEdit(r)}
                    >
                      <td
                        className="w-12 px-2 py-2 text-center align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.status === "pending" ? (
                          <div className="flex min-h-10 min-w-10 items-center justify-center">
                            <input
                              type="checkbox"
                              aria-label={`Select ${workerName(r)} $${fmtUsd(r.amount)}`}
                              checked={selectedIds.has(r.id)}
                              onChange={() => toggleSelection(r.id, r.status)}
                              className="h-4 w-4 rounded border-input"
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-[11px] text-muted-foreground tabular-nums leading-snug">
                        {r.reimbursementDate || (r.createdAt ?? "").slice(0, 10)}
                      </td>
                      <td
                        className={cn(
                          "min-w-0 px-3 py-2 align-middle leading-snug",
                          listTablePrimaryCellClassName,
                          "text-zinc-900 dark:text-foreground"
                        )}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <span className="line-clamp-2 text-[13px] font-semibold tracking-tight">
                            {workerName(r)}
                          </span>
                          {r.paidAt ? (
                            <span className="block text-[10px] tabular-nums leading-none text-muted-foreground/70">
                              Paid {String(r.paidAt).slice(0, 10)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[160px] px-3 py-2 align-middle">
                        {r.projectId && projectName(r) !== "—" ? (
                          <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                            {projectName(r)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground/45">No project</span>
                        )}
                      </td>
                      <td className="min-w-0 px-3 py-2 align-middle leading-snug">
                        <div className="min-w-0 space-y-0.5">
                          <span className="line-clamp-2 text-[12px] font-medium leading-snug text-zinc-800 dark:text-zinc-100">
                            {r.vendor?.trim() ? r.vendor : "No vendor"}
                          </span>
                          {r.description?.trim() ? (
                            <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                              {r.description.trim()}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-right align-middle text-base font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-foreground",
                          listTableAmountCellClassName
                        )}
                      >
                        ${fmtUsd(r.amount)}
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap">
                        <ReimbursementStatusChip status={r.status} hasReceipt={hasReceiptUrl(r)} />
                      </td>
                      <td
                        className="px-3 py-2 align-middle whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.receiptUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              const u = r.receiptUrl;
                              if (!u) return;
                              void (async () => {
                                const signed = await resolvePreviewSignedUrl({
                                  supabase,
                                  rawUrlOrPath: u,
                                  ttlSec: 3600,
                                  bucketCandidates: [
                                    "worker-receipts",
                                    "receipts",
                                    "expense-attachments",
                                  ],
                                });
                                openPreview({ url: signed || u, fileName: "Receipt" });
                              })();
                            }}
                            aria-label="Preview receipt"
                            className={receiptPillAttachedInteractive}
                          >
                            <Paperclip
                              className="h-3 w-3 shrink-0 opacity-90"
                              strokeWidth={2}
                              aria-hidden
                            />
                            Receipt
                          </button>
                        ) : (
                          <span className={receiptPillMissing}>
                            <span
                              className="h-1 w-1 shrink-0 rounded-full bg-amber-400/55 dark:bg-amber-400/45"
                              aria-hidden
                            />
                            No receipt
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ActionsDropdown r={r} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {filtered.length === 0
            ? "0"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-11 min-h-[44px] rounded-sm px-4 md:h-8 md:min-h-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-11 min-h-[44px] rounded-sm px-4 md:h-8 md:min-h-8"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Create Worker Payment (batch) modal */}
      <Dialog
        open={!!batchPaymentModal}
        onOpenChange={(open) => !open && setBatchPaymentModal(null)}
      >
        <DialogContent className="max-w-md gap-3">
          <DialogHeader>
            <DialogTitle>Create Worker Payment</DialogTitle>
          </DialogHeader>
          {batchPaymentModal && (
            <form onSubmit={handleBatchPayment} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Worker
                </label>
                <p className="text-sm font-medium">{batchPaymentModal.workerName}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Reimbursements
                </label>
                <ul className="text-sm border border-border/60 rounded-sm divide-y divide-border/60 max-h-40 overflow-auto">
                  {batchPaymentModal.items.map((r) => (
                    <li key={r.id} className="py-2 px-3 flex justify-between gap-2">
                      <span className="truncate">
                        {projectName(r)} · {r.vendor ?? "—"}
                      </span>
                      <span className="tabular-nums shrink-0">${fmtUsd(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Total
                </label>
                <p className="text-sm font-semibold tabular-nums">
                  ${fmtUsd(batchPaymentModal.totalAmount)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Payment Method
                </label>
                <Input
                  type="text"
                  value={batchPayMethod}
                  onChange={(e) => setBatchPayMethod(e.target.value)}
                  placeholder="e.g. Check, ACH"
                  className="h-9 rounded-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Note
                </label>
                <Input
                  type="text"
                  value={batchPayNote}
                  onChange={(e) => setBatchPayNote(e.target.value)}
                  placeholder="Optional"
                  className="h-9 rounded-sm"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-sm"
                  onClick={() => setBatchPaymentModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 rounded-sm"
                  disabled={batchPaySubmitting}
                >
                  {batchPaySubmitting ? "…" : "Confirm Payment"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark as Paid modal */}
      <Dialog open={!!payModal} onOpenChange={(open) => !open && setPayModal(null)}>
        <DialogContent className="max-w-sm gap-3">
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal mt-1">
              This will mark the reimbursement as paid and add it to Project Expenses (category:
              Worker Reimbursement).
            </p>
          </DialogHeader>
          <form onSubmit={handlePay} className="flex flex-col gap-3">
            {payError && <p className="text-sm text-destructive">{payError}</p>}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Amount
              </label>
              <p className="text-sm font-medium tabular-nums">${payAmount}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Payment Method
              </label>
              <Input
                type="text"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                placeholder="e.g. Check, ACH"
                className="h-9 rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Note
              </label>
              <Input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Optional"
                className="h-9 rounded-sm"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-sm"
                onClick={() => setPayModal(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-9 rounded-sm">
                Mark as Paid
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

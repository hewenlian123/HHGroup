"use client";

import "../../financial/expenses/expenses-ui-theme.css";
import "./reimbursements-ui.css";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
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
  Check,
  CheckCircle2,
  DollarSign,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import {
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { NeoAmount, NeoMobileCard, NeoStatus, NeoTable, NeoToolbar } from "@/components/base";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { ExpenseOperationsWorkspaceNav } from "@/components/financial/expense-operations-workspace-nav";
import {
  safeWorkerReturnPath,
  workerDetailPathWithReturnTo,
  workerDetailReturnPath,
  workforceReportsReturnPath,
} from "@/lib/worker-return-path";

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const STATUS_OPTIONS: WorkerReimbursementStatus[] = ["pending", "approved", "paid", "settled"];

const rbShell =
  "border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[color:var(--hh-text-primary)] transition-colors duration-120";

const rbKpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--hh-l3-hover)] text-[color:var(--hh-text-tertiary)] md:h-9 md:w-9";

const rbKpiCardClass =
  "flex min-h-[72px] items-center gap-2.5 px-3 py-3 md:h-[86px] md:gap-3 md:px-4 md:py-3";

const rbKpiLabelClass =
  "text-hh-status font-semibold uppercase leading-none tracking-normal text-[color:var(--hh-text-tertiary)]";

const rbKpiValueClass = "hh-fin mt-1 text-hh-financial-total tracking-normal text-foreground";

const rbKpiMetaClass = "mt-1 text-hh-status leading-none text-[color:var(--hh-text-tertiary)]";

const rbSegmentedNav =
  "inline-flex min-h-9 items-center rounded-lg border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-1";

const rbSegmentedNavLink =
  "inline-flex h-7 items-center rounded-md px-3 text-hh-metadata font-medium text-[color:var(--hh-text-secondary)] transition-colors duration-120 hover:bg-[var(--hh-l3-hover)] hover:text-[color:var(--hh-text-primary)]";

const rbHeaderActionButton =
  "h-9 rounded-md border-transparent bg-[var(--hh-action-primary)] px-3 text-hh-table-cell font-semibold text-[var(--hh-action-primary-foreground)] shadow-none transition-colors duration-120 hover:bg-[var(--hh-action-primary-hover)] hover:text-[var(--hh-action-primary-foreground)]";

const rbStatusChip =
  "inline-flex h-6 items-center gap-1.5 rounded-full border bg-[var(--hh-l2-operational-surface)] px-2.5 text-hh-status font-semibold leading-none tracking-normal";

const rbChipBase =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-[var(--hh-l2-operational-surface)] px-3 py-1.5 text-hh-status font-medium transition-colors duration-120";

const rbFormLabelClass =
  "mb-1.5 block text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]";

const rbFormControlClass =
  "h-10 rounded-md border-[color:var(--hh-border)] bg-[var(--hh-l3-hover)] text-[color:var(--hh-text-primary)] shadow-none focus-visible:border-[color:var(--hh-focus-ring)] focus-visible:ring-[var(--hh-focus-ring)]";

function hasReceiptUrl(r: WorkerReimbursement): boolean {
  return Boolean((r.receiptUrl ?? "").trim());
}

const receiptPillAttachedInteractive =
  "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 py-1 text-hh-status font-semibold tabular-nums text-[color:var(--hh-text-secondary)] transition-colors duration-120 hover:border-[color:var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] hover:text-[color:var(--hh-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";

const receiptPillMissing =
  "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-md bg-[var(--hh-warning-soft-fill)] px-2.5 py-1 text-hh-status font-medium tabular-nums text-[color:var(--hh-warning)]";

function ReimbursementCheckbox({
  ariaLabel,
  checked,
  onChange,
  disabled,
  className,
}: {
  ariaLabel: string;
  checked: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group/reimbursement-checkbox flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-full touch-manipulation",
        disabled && "cursor-not-allowed opacity-45",
        className
      )}
    >
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-hh-compact border border-[color:var(--hh-border-strong)] bg-[var(--hh-l3-hover)]",
          "transition-[background-color,border-color,box-shadow] duration-120",
          "group-hover/reimbursement-checkbox:border-[color:var(--hh-text-tertiary)] group-hover/reimbursement-checkbox:bg-[var(--hh-l3-hover)]",
          "peer-focus-visible:border-[color:var(--hh-focus-ring)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--hh-focus-ring)]",
          "peer-checked:border-[color:var(--hh-action-primary)] peer-checked:bg-[var(--hh-action-primary)]",
          "peer-disabled:border-[color:var(--hh-border)] peer-disabled:bg-[var(--hh-l3-hover)]"
        )}
      >
        {checked ? (
          <Check className="h-3 w-3 text-[var(--hh-action-primary-foreground)]" strokeWidth={3} />
        ) : null}
      </span>
    </label>
  );
}

function ReimbursementStatusChip({ status }: { status: WorkerReimbursementStatus }) {
  if (status === "paid") {
    return <NeoStatus label="Paid" variant="success" />;
  }
  if (status === "settled") {
    return <NeoStatus label="Settled" variant="success" />;
  }
  if (status === "approved") {
    return <NeoStatus label="Approved" variant="success" />;
  }
  return (
    <span
      className={cn(
        rbStatusChip,
        "border-[color:var(--hh-warning-border)] text-[color:var(--hh-warning)]"
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hh-warning)]" aria-hidden />
      Pending
    </span>
  );
}

export default function WorkerReimbursementsPage() {
  return (
    <React.Suspense fallback={<WorkerReimbursementsPageFallback />}>
      <WorkerReimbursementsPageContent />
    </React.Suspense>
  );
}

function WorkerReimbursementsPageFallback() {
  return (
    <div
      data-reimbursements-workspace
      aria-busy="true"
      className={cn(
        "expenses-ui reimbursements-ui page-shell-wide mx-auto flex min-h-[calc(100dvh-1rem)] w-full !max-w-none flex-col gap-1 bg-[var(--hh-l0-canvas)] px-4 py-1 pb-2.5 text-[color:var(--hh-text-secondary)] md:gap-2 md:px-6 md:pb-3 md:pt-0.5",
        mobileListPagePaddingClass,
        "max-md:!gap-1"
      )}
    >
      <div className="flex min-h-[260px] items-center justify-center text-sm text-[color:var(--hh-text-tertiary)]">
        Loading reimbursements…
      </div>
    </div>
  );
}

function WorkerReimbursementsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const suppressNewQueryAutoOpenRef = React.useRef(false);

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

  const clearNewQueryParam = React.useCallback(() => {
    if (searchParams.get("new") !== "1") return;
    suppressNewQueryAutoOpenRef.current = true;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("new");
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

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
  const sourceWorkerId = searchParams.get("workerId")?.trim() ?? "";
  const returnHref = safeWorkerReturnPath(
    searchParams.get("returnTo"),
    sourceWorkerId ? workerDetailReturnPath(sourceWorkerId, "receipts") : "/workers"
  );
  const returnLabel = sourceWorkerId ? "Back to Worker" : "Back to Worker Center";
  const workerDetailHref = React.useCallback(
    (workerId: string) =>
      pathname.startsWith("/reports/workforce")
        ? workerDetailPathWithReturnTo(workerId, workforceReportsReturnPath("reimbursements"))
        : `/workers/${encodeURIComponent(workerId)}`,
    [pathname]
  );
  const sourceWorkerName = sourceWorkerId ? workerById.get(sourceWorkerId) : null;

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
    const pending = rows.filter((r) => r.status === "pending" || r.status === "approved");
    const paid = rows.filter((r) => r.status === "paid" || r.status === "settled");
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

  const handleCancelForm = () => {
    if (!editingId && (searchParams.get("returnTo") || sourceWorkerId)) {
      router.push(returnHref);
      return;
    }
    resetForm();
    clearNewQueryParam();
  };

  const openNewReimbursementForm = React.useCallback((initialWorkerId = "") => {
    setEditingId(null);
    setForm({
      workerId: initialWorkerId,
      projectId: "",
      vendor: "",
      amount: "",
      receiptUrl: "",
      description: "",
      reimbursementDate: todayLocalISODate(),
      status: "pending",
    });
    setShowForm(true);
  }, []);

  React.useEffect(() => {
    const initialWorkerId = searchParams.get("workerId")?.trim();
    if (searchParams.get("new") !== "1") {
      suppressNewQueryAutoOpenRef.current = false;
    }
    if (!initialWorkerId || workers.length === 0) return;
    if (!workers.some((worker) => worker.id === initialWorkerId)) return;
    setQuery((current) => current || (workerById.get(initialWorkerId) ?? ""));
    if (
      searchParams.get("new") === "1" &&
      !suppressNewQueryAutoOpenRef.current &&
      !showForm &&
      !editingId
    ) {
      openNewReimbursementForm(initialWorkerId);
    }
  }, [editingId, openNewReimbursementForm, searchParams, showForm, workerById, workers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const creating = !editingId;
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
        const res = await fetch(`/api/worker-reimbursements/${editingId}`, {
          method: "PATCH",
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
          throw new Error(data.message ?? "Failed to update reimbursement.");
        }
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
      clearNewQueryParam();
      await load();
      if (creating && (searchParams.get("returnTo") || sourceWorkerId)) {
        router.push(returnHref);
      }
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
      <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity duration-120 motion-reduce:transition-none md:opacity-[0.48] md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-md border border-transparent text-[color:var(--hh-text-tertiary)] touch-manipulation transition-colors duration-120 hover:border-[color:var(--hh-border)] hover:bg-[var(--hh-l3-hover)] hover:text-[color:var(--hh-text-primary)] data-[state=open]:border-[color:var(--hh-border-strong)] data-[state=open]:bg-[var(--hh-l3-hover)] md:h-8 md:w-8 md:min-h-8 md:min-w-8"
              aria-label="Actions"
            >
              <MoreHorizontal className="h-4 w-4 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="expenses-ui reimbursement-floating-surface min-w-[10rem] rounded-lg"
          >
            <DropdownMenuItem onSelect={() => router.push(workerDetailHref(r.workerId))}>
              Open Worker
            </DropdownMenuItem>
            {r.status === "pending" && (
              <>
                <DropdownMenuSeparator />
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
      data-reimbursements-workspace
      className={cn(
        "expenses-ui reimbursements-ui page-shell-wide mx-auto flex min-h-[calc(100dvh-1rem)] w-full !max-w-none flex-col gap-1 bg-[var(--hh-l0-canvas)] px-4 py-1 pb-2.5 text-[color:var(--hh-text-secondary)] md:gap-2 md:px-6 md:pb-3 md:pt-0.5",
        mobileListPagePaddingClass,
        "max-md:!gap-1"
      )}
    >
      <ExpenseOperationsWorkspaceNav className="mb-1" />
      <div className="flex flex-col gap-2 border-b border-[color:var(--hh-border)] pb-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="min-h-11 rounded-md border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-hh-table-cell font-semibold text-[color:var(--hh-text-primary)] shadow-none hover:border-[color:var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] md:min-h-9"
          >
            <Link href={returnHref}>{returnLabel}</Link>
          </Button>
          <span className="text-xs text-[color:var(--hh-text-tertiary)]">
            Worker Center{sourceWorkerName ? ` › ${sourceWorkerName}` : ""} › Reimbursements
          </span>
        </div>
      </div>
      <div className="hidden md:block">
        <PageHeader
          className="gap-2 border-b border-[color:var(--hh-border)] pb-4 lg:items-end lg:gap-x-5 [&_h1]:!text-hh-page-title [&_h1]:!tracking-normal [&_p]:!mt-1 [&_p]:!max-w-xl [&_p]:!text-hh-body"
          title="Worker Reimbursements"
          subtitle="Review pending reimbursements, receipts, and payouts before marking paid."
          actions={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <nav className={rbSegmentedNav} aria-label="Labor navigation">
                <Link href="/financial/workers" className={rbSegmentedNavLink}>
                  Worker Balances
                </Link>
                <Link href="/labor" className={rbSegmentedNavLink}>
                  Labor
                </Link>
              </nav>
              <Button
                size="sm"
                variant="outline"
                className={cn("w-full max-md:min-h-11 sm:w-auto", rbHeaderActionButton)}
                onClick={() => openNewReimbursementForm()}
                aria-label="+ New Reimbursement"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                New Reimbursement
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
            onClick={() => openNewReimbursementForm()}
            className="h-11 w-11 min-h-[44px] min-w-[44px]"
          />
        }
      />

      <div
        className="flex flex-wrap items-center gap-2 border-b border-[color:var(--hh-border)] pb-2 pt-1"
        aria-label="Reimbursement queue summary"
      >
        <span
          className={cn(
            rbChipBase,
            "border-[color:var(--hh-border)] text-[color:var(--hh-text-secondary)]"
          )}
        >
          <span className="font-semibold tabular-nums text-[color:var(--hh-text-primary)]">
            {reimbursementStats.pendingCount}
          </span>
          Pending
        </span>
        <span
          className={cn(
            rbChipBase,
            "border-[color:var(--hh-warning-border)] text-[color:var(--hh-warning)]"
          )}
        >
          <span className="font-semibold tabular-nums text-[color:var(--hh-warning)]">
            {reimbursementStats.missingReceipt}
          </span>
          Missing receipt
        </span>
        <span
          className={cn(
            rbChipBase,
            "border-[color:var(--hh-border)] text-[color:var(--hh-text-secondary)]"
          )}
        >
          <span className="font-semibold tabular-nums text-[color:var(--hh-text-primary)]">
            {reimbursementStats.readyToPay}
          </span>
          With receipt
        </span>
      </div>

      <div
        data-reimbursements-kpis
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] md:grid-cols-4"
      >
        <div className={cn(rbShell, rbKpiCardClass)}>
          <span className={rbKpiIcon}>
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={rbKpiLabelClass}>In queue</p>
            <p className={rbKpiValueClass}>{reimbursementStats.pendingCount}</p>
            <p className={rbKpiMetaClass}>Pending review</p>
          </div>
        </div>
        <div className={cn(rbShell, rbKpiCardClass)}>
          <span className={rbKpiIcon}>
            <DollarSign className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={rbKpiLabelClass}>Owed pending</p>
            <p className={cn(rbKpiValueClass, "truncate")}>
              {formatCurrency(reimbursementStats.pendingTotal)}
            </p>
            <p className={rbKpiMetaClass}>Before payout</p>
          </div>
        </div>
        <div className={cn(rbShell, rbKpiCardClass)}>
          <span className={rbKpiIcon}>
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={rbKpiLabelClass}>Paid items</p>
            <p className={rbKpiValueClass}>{reimbursementStats.paidCount}</p>
            <p className={rbKpiMetaClass}>Settled records</p>
          </div>
        </div>
        <div className={cn(rbShell, rbKpiCardClass)}>
          <span className={rbKpiIcon}>
            <Wallet className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={rbKpiLabelClass}>Paid out</p>
            <p className={cn(rbKpiValueClass, "truncate")}>
              {formatCurrency(reimbursementStats.paidTotal)}
            </p>
            <p className={rbKpiMetaClass}>Cash settled</p>
          </div>
        </div>
      </div>

      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={sortFilterActive}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--hh-text-tertiary)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Worker, project, vendor…"
              className="h-11 min-h-[44px] rounded-md border-[color:var(--hh-border)] bg-[var(--hh-l3-hover)] pl-9 text-sm text-[color:var(--hh-text-primary)] placeholder:text-[color:var(--hh-text-tertiary)] focus-visible:border-[color:var(--hh-focus-ring)] focus-visible:ring-[var(--hh-focus-ring)] md:h-10 md:min-h-0"
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
          className="w-full rounded-md"
          disabled={selectedIds.size === 0 || !selectedSameWorker || selectedRows.length === 0}
          onClick={() => {
            openCreateWorkerPayment();
            setFiltersOpen(false);
          }}
        >
          Create Worker Payment
          {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
        </Button>
        <Button type="button" className="w-full rounded-md" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>
      {schemaWarning ? (
        <div className="rounded-lg border border-[color:var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-sm text-[color:var(--hh-warning)]">
          {schemaWarning} Run Labor schema migration (e.g. ensure labor tables) or check Supabase
          Project Settings → API → Reload schema.
        </div>
      ) : null}
      <NeoToolbar className="hidden border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] shadow-operational md:block md:p-2.5">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-[260px] flex-1 space-y-1.5">
            <p className="text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
              Search
            </p>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--hh-text-tertiary)]"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Worker, project, vendor…"
                className="h-10 rounded-md border-[color:var(--hh-border)] bg-[var(--hh-l3-hover)] pl-9 text-[color:var(--hh-text-primary)] placeholder:text-[color:var(--hh-text-tertiary)] focus-visible:border-[color:var(--hh-focus-ring)] focus-visible:ring-[var(--hh-focus-ring)]"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-10 w-full rounded-md border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 text-hh-table-cell font-semibold text-[color:var(--hh-text-primary)] shadow-none transition-colors duration-120 hover:border-[color:var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] disabled:border-[color:var(--hh-border)] disabled:bg-[var(--hh-l3-hover)] disabled:text-[color:var(--hh-text-tertiary)] sm:w-[210px]"
            disabled={selectedIds.size === 0 || !selectedSameWorker || selectedRows.length === 0}
            onClick={openCreateWorkerPayment}
          >
            Create Worker Payment
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
        </div>
      </NeoToolbar>
      {message ? (
        <div className="rounded-lg border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-sm text-[color:var(--hh-text-secondary)]">
          {message}
        </div>
      ) : null}

      {showForm && (
        <section
          data-reimbursement-form
          className="reimbursement-task-surface rounded-lg border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-4 shadow-task"
        >
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--hh-text-primary)]">
            {editingId ? "Edit Reimbursement" : "New Reimbursement"}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className={rbFormLabelClass}>Date</label>
              <Input
                type="date"
                value={form.reimbursementDate}
                onChange={(e) => setForm((f) => ({ ...f, reimbursementDate: e.target.value }))}
                className={cn(rbFormControlClass, "w-[140px]")}
                required
                aria-label="Reimbursement date"
              />
            </div>
            <div>
              <label className={rbFormLabelClass}>Worker</label>
              <Select
                value={form.workerId}
                onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
                className={cn(rbFormControlClass, "min-w-[140px]")}
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
              <label className={rbFormLabelClass}>Project</label>
              <Select
                value={form.projectId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className={cn(rbFormControlClass, "min-w-[140px]")}
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
              <label className={rbFormLabelClass}>Vendor</label>
              <Input
                type="text"
                aria-label="Vendor"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="Vendor"
                className={cn(rbFormControlClass, "min-w-[120px]")}
              />
            </div>
            <div>
              <label className={rbFormLabelClass}>Amount</label>
              <Input
                type="number"
                aria-label="Amount"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className={cn(rbFormControlClass, "w-24")}
              />
            </div>
            <div>
              <label className={rbFormLabelClass}>Receipt URL</label>
              <Input
                type="text"
                aria-label="Receipt URL"
                value={form.receiptUrl}
                onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))}
                placeholder="Link"
                className={cn(rbFormControlClass, "min-w-[160px]")}
              />
            </div>
            <div>
              <label className={rbFormLabelClass}>Description</label>
              <Input
                type="text"
                aria-label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                className={cn(rbFormControlClass, "min-w-[120px]")}
              />
            </div>
            <div>
              <label className={rbFormLabelClass}>Status</label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as WorkerReimbursementStatus }))
                }
                className={cn(rbFormControlClass, "min-w-[100px]")}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm" className="min-h-11 md:min-h-9">
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 md:min-h-9"
              onClick={handleCancelForm}
            >
              Cancel
            </Button>
          </form>
        </section>
      )}

      <div data-reimbursements-queue className="md:hidden">
        {loading ? (
          <div className="rounded-lg border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-8 text-center text-xs text-[color:var(--hh-text-tertiary)]">
            Loading…
          </div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-10 text-center md:hidden">
            <Search className="h-8 w-8 text-[color:var(--hh-text-tertiary)]" aria-hidden />
            <p className="mt-3 text-sm font-medium text-[color:var(--hh-text-secondary)]">
              No reimbursements yet.
            </p>
            <p className="mt-1 max-w-[240px] text-xs leading-snug text-[color:var(--hh-text-tertiary)]">
              New worker reimbursements will appear here for review and payout.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {paged.map((r) => (
              <NeoMobileCard
                key={r.id}
                data-reimbursement-id={r.id}
                data-selected={selectedIds.has(r.id) ? "true" : undefined}
                className={cn(
                  "flex flex-col gap-2.5 rounded-lg border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 shadow-none",
                  selectedIds.has(r.id) &&
                    "border-[color:var(--hh-border-strong)] bg-[var(--hh-l3-selected)]"
                )}
              >
                <div className="flex items-start gap-2">
                  {r.status === "pending" ? (
                    <ReimbursementCheckbox
                      ariaLabel={`Select ${workerName(r)}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelection(r.id, r.status)}
                      className="min-h-[44px] min-w-[44px]"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-hh-body-strong font-semibold leading-snug tracking-normal text-[color:var(--hh-text-primary)]">
                      {workerName(r)}
                    </p>
                    {r.paidAt ? (
                      <p className="text-hh-status text-[color:var(--hh-text-tertiary)] tabular-nums">
                        Paid {formatDate(r.paidAt)}
                      </p>
                    ) : null}
                    <p className="truncate text-hh-metadata leading-snug text-[color:var(--hh-text-secondary)]">
                      {r.projectId && projectName(r) !== "—" ? projectName(r) : "No project"}
                    </p>
                    <p className="truncate text-hh-table-cell font-semibold leading-snug text-[color:var(--hh-text-primary)]">
                      {r.vendor?.trim() ? r.vendor : "No vendor"}
                    </p>
                    {r.description?.trim() ? (
                      <p className="line-clamp-2 text-hh-metadata leading-snug text-[color:var(--hh-text-secondary)]">
                        {r.description.trim()}
                      </p>
                    ) : null}
                    <p className="text-hh-status text-[color:var(--hh-text-tertiary)] tabular-nums">
                      {formatDate(r.reimbursementDate || r.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                      <NeoAmount className="text-base tracking-normal">
                        {formatCurrency(r.amount)}
                      </NeoAmount>
                      <ReimbursementStatusChip status={r.status} />
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
                          aria-label="Missing receipt"
                        >
                          <span
                            className="h-1 w-1 shrink-0 rounded-full bg-[var(--hh-warning)]"
                            aria-hidden
                          />
                          Missing
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end border-t border-[color:var(--hh-border)] pt-2">
                  <ActionsDropdown r={r} />
                </div>
              </NeoMobileCard>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div data-reimbursements-queue className="hidden md:-mt-1 md:block">
        <NeoTable
          className="border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] shadow-operational"
          tableClassName="min-w-[900px] lg:min-w-0"
        >
          <thead>
            <tr className="border-b border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
              <th className="w-12 px-2 py-1.5 text-center">
                <div className="flex min-h-10 min-w-10 items-center justify-center">
                  <ReimbursementCheckbox
                    ariaLabel="Select all pending on page"
                    checked={
                      pendingOnPage.length > 0 && pendingOnPage.every((r) => selectedIds.has(r.id))
                    }
                    onChange={selectAllPendingOnPage}
                  />
                </div>
              </th>
              <th
                className="w-[88px] cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)] tabular-nums transition-colors hover:text-[color:var(--hh-text-primary)]"
                onClick={() => toggleSort("reimbursementDate")}
              >
                Date
              </th>
              <th className="min-w-[128px] px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Worker
              </th>
              <th className="max-w-[140px] min-w-[100px] px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Project
              </th>
              <th className="min-w-[160px] px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Review item
              </th>
              <th
                className="w-[92px] cursor-pointer select-none whitespace-nowrap px-3 py-2 text-right text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)] tabular-nums transition-colors hover:text-[color:var(--hh-text-primary)]"
                onClick={() => toggleSort("amount")}
              >
                Amount
              </th>
              <th
                className="w-[108px] cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)] transition-colors hover:text-[color:var(--hh-text-primary)]"
                onClick={() => toggleSort("status")}
              >
                Status
              </th>
              <th className="w-[88px] whitespace-nowrap px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Receipt
              </th>
              <th className="w-24 px-3 py-2 text-right text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-[color:var(--hh-border)] bg-[var(--hh-l3-hover)]">
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-xs text-[color:var(--hh-text-tertiary)]"
                >
                  Loading…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr className="border-b border-[color:var(--hh-border)] bg-[var(--hh-l3-hover)]">
                <td colSpan={9} className="px-3 py-9 text-center">
                  <div className="mx-auto flex max-w-[360px] flex-col items-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--hh-l3-hover)] text-[color:var(--hh-text-tertiary)]">
                      <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </div>
                    <p className="mt-3 text-hh-table-cell font-medium text-[color:var(--hh-text-secondary)]">
                      No reimbursements yet.
                    </p>
                    <p className="mt-1 text-hh-metadata leading-snug text-[color:var(--hh-text-tertiary)]">
                      New worker reimbursements will appear here for review and payout.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr
                  key={r.id}
                  data-reimbursement-id={r.id}
                  data-selected={selectedIds.has(r.id) ? "true" : undefined}
                  className={cn(
                    listTableRowClassName,
                    "group border-b border-[color:var(--hh-border)] bg-[var(--hh-l1-workspace)] transition-[background-color,box-shadow] duration-120 hover:bg-[var(--hh-l3-hover)]",
                    selectedIds.has(r.id) &&
                      "bg-[var(--hh-l3-selected)] shadow-[inset_2px_0_0_0_var(--hh-text-tertiary)]"
                  )}
                  onClick={() => handleEdit(r)}
                >
                  <td
                    className="w-12 px-2 py-2 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.status === "pending" ? (
                      <div className="flex min-h-10 min-w-10 items-center justify-center">
                        <ReimbursementCheckbox
                          ariaLabel={`Select ${workerName(r)} ${formatCurrency(r.amount)}`}
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelection(r.id, r.status)}
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-hh-metadata leading-snug text-[color:var(--hh-text-secondary)] tabular-nums">
                    {formatDate(r.reimbursementDate || r.createdAt)}
                  </td>
                  <td
                    className={cn(
                      "min-w-0 px-3 py-2.5 align-middle leading-snug",
                      listTablePrimaryCellClassName,
                      "text-[color:var(--hh-text-primary)]"
                    )}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <span className="line-clamp-2 text-hh-body font-semibold tracking-normal text-[color:var(--hh-text-primary)]">
                        {workerName(r)}
                      </span>
                      {r.paidAt ? (
                        <span className="block text-hh-status leading-none text-[color:var(--hh-text-tertiary)] tabular-nums">
                          Paid {formatDate(r.paidAt)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-[160px] px-3 py-2.5 align-middle">
                    {r.projectId && projectName(r) !== "—" ? (
                      <span className="line-clamp-2 text-hh-table-cell leading-snug text-[color:var(--hh-text-secondary)]">
                        {projectName(r)}
                      </span>
                    ) : (
                      <span className="text-hh-table-cell text-[color:var(--hh-text-tertiary)]">
                        No project
                      </span>
                    )}
                  </td>
                  <td className="min-w-0 px-3 py-2.5 align-middle leading-snug">
                    <div className="min-w-0 space-y-0.5">
                      <span className="line-clamp-2 text-hh-table-cell font-semibold leading-snug text-[color:var(--hh-text-primary)]">
                        {r.vendor?.trim() ? r.vendor : "No vendor"}
                      </span>
                      {r.description?.trim() ? (
                        <span className="line-clamp-2 text-hh-metadata leading-snug text-[color:var(--hh-text-secondary)]">
                          {r.description.trim()}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5 text-right align-middle",
                      listTableAmountCellClassName
                    )}
                  >
                    <NeoAmount className="text-hh-body-strong">
                      {formatCurrency(r.amount)}
                    </NeoAmount>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                    <ReimbursementStatusChip status={r.status} />
                  </td>
                  <td
                    className="whitespace-nowrap px-3 py-2.5 align-middle"
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
                          className="h-1 w-1 shrink-0 rounded-full bg-[var(--hh-warning)]"
                          aria-hidden
                        />
                        Missing
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
        </NeoTable>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-sm text-[color:var(--hh-text-secondary)] shadow-none md:-mt-1">
        <span className="text-hh-table-cell font-medium tabular-nums">
          {filtered.length === 0
            ? "0"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-11 min-h-[44px] rounded-md border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 text-hh-table-cell font-semibold text-[color:var(--hh-text-primary)] hover:border-[color:var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] disabled:bg-[var(--hh-l3-hover)] disabled:text-[color:var(--hh-text-tertiary)] md:h-8 md:min-h-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-11 min-h-[44px] rounded-md border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 text-hh-table-cell font-semibold text-[color:var(--hh-text-primary)] hover:border-[color:var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] disabled:bg-[var(--hh-l3-hover)] disabled:text-[color:var(--hh-text-tertiary)] md:h-8 md:min-h-8"
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
        <DialogContent className="expenses-ui reimbursement-task-dialog max-w-md gap-3">
          <DialogHeader>
            <DialogTitle>Create Worker Payment</DialogTitle>
          </DialogHeader>
          {batchPaymentModal && (
            <form onSubmit={handleBatchPayment} className="flex flex-col gap-3">
              <div>
                <label className={rbFormLabelClass}>Worker</label>
                <p className="text-sm font-medium">{batchPaymentModal.workerName}</p>
              </div>
              <div>
                <label className={rbFormLabelClass}>Reimbursements</label>
                <ul className="max-h-40 overflow-auto rounded-md border border-[color:var(--hh-border)] text-sm divide-y divide-[color:var(--hh-border)]">
                  {batchPaymentModal.items.map((r) => (
                    <li key={r.id} className="py-2 px-3 flex justify-between gap-2">
                      <span className="truncate">
                        {projectName(r)} · {r.vendor ?? "—"}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatCurrency(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label className={rbFormLabelClass}>Total</label>
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrency(batchPaymentModal.totalAmount)}
                </p>
              </div>
              <div>
                <label className={rbFormLabelClass}>Payment Method</label>
                <Input
                  type="text"
                  value={batchPayMethod}
                  onChange={(e) => setBatchPayMethod(e.target.value)}
                  placeholder="e.g. Check, ACH"
                  className={rbFormControlClass}
                />
              </div>
              <div>
                <label className={rbFormLabelClass}>Note</label>
                <Input
                  type="text"
                  value={batchPayNote}
                  onChange={(e) => setBatchPayNote(e.target.value)}
                  placeholder="Optional"
                  className={rbFormControlClass}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-md"
                  onClick={() => setBatchPaymentModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 rounded-md"
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
        <DialogContent className="expenses-ui reimbursement-task-dialog max-w-sm gap-3">
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
              <label className={rbFormLabelClass}>Amount</label>
              <p className="text-sm font-medium tabular-nums">${payAmount}</p>
            </div>
            <div>
              <label className={rbFormLabelClass}>Payment Method</label>
              <Input
                type="text"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                placeholder="e.g. Check, ACH"
                className={rbFormControlClass}
              />
            </div>
            <div>
              <label className={rbFormLabelClass}>Note</label>
              <Input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Optional"
                className={rbFormControlClass}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-md"
                onClick={() => setPayModal(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-9 rounded-md">
                Mark as Paid
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

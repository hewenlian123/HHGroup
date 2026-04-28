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
import { MoreHorizontal, Search } from "lucide-react";
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
      <div className="flex items-center justify-end gap-2">
        <DeleteRowAction disabled={isBusy} onDelete={() => handleDelete(r.id)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="btn-outline-ghost h-8 w-8 min-h-[44px] min-w-[44px] rounded-sm touch-manipulation"
              aria-label="Actions"
            >
              <MoreHorizontal className="h-4 w-4" />
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
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
        <PageHeader
          title="Worker Reimbursements"
          subtitle="Construction finance: approve, pay, and track worker reimbursements."
          actions={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/financial/workers"
                className="text-sm text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center sm:mr-2"
              >
                Worker Balances
              </Link>
              <Link
                href="/labor/receipts"
                className="text-sm text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center sm:mr-2"
              >
                Receipt Uploads
              </Link>
              <Link
                href="/labor"
                className="text-sm text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center sm:mr-2"
              >
                Labor
              </Link>
              <Button
                size="sm"
                className="w-full max-md:min-h-11 sm:w-auto"
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
        fab={<MobileFabButton ariaLabel="New reimbursement" onClick={openNewReimbursementForm} />}
      />
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
              className="h-10 pl-8 text-sm"
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
      <FilterBar className="hidden md:block">
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
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
          <div className="divide-y divide-gray-100 dark:divide-border/60">
            {paged.map((r) => (
              <div key={r.id} className="flex min-h-[48px] flex-col gap-2 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {r.status === "pending" ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${workerName(r)}`}
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelection(r.id, r.status)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {workerName(r)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {projectName(r)} · {r.vendor ?? "—"}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {r.reimbursementDate || (r.createdAt ?? "").slice(0, 10)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-medium tabular-nums">${fmtUsd(r.amount)}</span>
                    <span className="text-xs capitalize text-muted-foreground">{r.status}</span>
                  </div>
                </div>
                <div className="flex justify-end pl-6">
                  <ActionsDropdown r={r} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="table-responsive hidden overflow-x-auto border-b border-gray-100 md:block dark:border-border/60">
        <table className="w-full min-w-[640px] border-collapse text-sm table-row-compact lg:min-w-0">
          <thead>
            <tr className="border-b border-gray-100 bg-white dark:border-border/60 dark:bg-muted/30">
              <th className="w-10 py-2 px-2 text-center">
                <input
                  type="checkbox"
                  aria-label="Select all pending on page"
                  checked={
                    pendingOnPage.length > 0 && pendingOnPage.every((r) => selectedIds.has(r.id))
                  }
                  onChange={selectAllPendingOnPage}
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <th
                className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none tabular-nums"
                onClick={() => toggleSort("reimbursementDate")}
              >
                Date
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Worker
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Vendor
              </th>
              <th
                className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums cursor-pointer select-none"
                onClick={() => toggleSort("amount")}
              >
                Amount
              </th>
              <th
                className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none"
                onClick={() => toggleSort("status")}
              >
                Status
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Receipt
              </th>
              <th className="w-44 text-right py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40">
                <td colSpan={9} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  Loading…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={9} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No reimbursements yet.
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    listTableRowClassName,
                    "group border-b border-gray-100/80 dark:border-border/40"
                  )}
                  onClick={() => handleEdit(r)}
                >
                  <td className="w-10 py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {r.status === "pending" ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${workerName(r)} $${fmtUsd(r.amount)}`}
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelection(r.id, r.status)}
                        className="h-4 w-4 rounded border-input"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground tabular-nums">
                    {r.reimbursementDate || (r.createdAt ?? "").slice(0, 10)}
                  </td>
                  <td
                    className={cn(
                      "py-2 px-3 font-medium",
                      listTablePrimaryCellClassName,
                      "hover:underline"
                    )}
                  >
                    {workerName(r)}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{projectName(r)}</td>
                  <td
                    className="py-2 px-3 text-muted-foreground max-w-[120px] truncate"
                    title={r.vendor ?? undefined}
                  >
                    {r.vendor ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "py-2 px-3 text-right tabular-nums font-medium",
                      listTableAmountCellClassName
                    )}
                  >
                    ${fmtUsd(r.amount)}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{r.status}</td>
                  <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
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
                        className="cursor-pointer text-xs text-primary transition-transform hover:scale-105 hover:underline"
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown r={r} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
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

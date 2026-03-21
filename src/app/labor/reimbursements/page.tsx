"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWorkers,
  getProjects,
  updateWorkerReimbursement,
  type WorkerReimbursement,
  type WorkerReimbursementStatus,
} from "@/lib/data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { DeleteRowAction } from "@/components/base";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_OPTIONS: WorkerReimbursementStatus[] = ["pending", "paid"];

export default function WorkerReimbursementsPage() {
  const router = useRouter();
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<WorkerReimbursement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const [sort, setSort] = React.useState<{ key: "createdAt" | "amount" | "status"; dir: "asc" | "desc" }>({
    key: "createdAt",
    dir: "desc",
  });
  const [form, setForm] = React.useState({
    workerId: "",
    projectId: "",
    vendor: "",
    amount: "",
    receiptUrl: "",
    description: "",
    status: "pending" as WorkerReimbursementStatus,
  });
  const [viewReceiptUrl, setViewReceiptUrl] = React.useState<string | null>(null);
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

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setSchemaWarning(null);
    try {
      const [w, p, res] = await Promise.all([
        getWorkers(),
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
          const worker = (r.workerName ?? workerById.get(r.workerId) ?? r.workerId) ?? "";
          const project = r.projectName ?? (r.projectId ? projectById.get(r.projectId) ?? r.projectId : "") ?? "";
          const vendor = (r.vendor ?? "").toLowerCase();
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
            vendor.includes(q) ||
            String(r.amount ?? "").toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q) ||
            (r.receiptUrl ?? "").toLowerCase().includes(q) ||
            (r.status ?? "").toLowerCase().includes(q)
          );
        })
      : rows;

    const dir = sort.dir === "asc" ? 1 : -1;
    const sorted = [...base].sort((a, b) => {
      if (sort.key === "amount") return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      if (sort.key === "status") return (String(a.status).localeCompare(String(b.status)) || 0) * dir;
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
      status: "pending",
    });
    setEditingId(null);
    setShowForm(false);
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
      status: (row.status as WorkerReimbursementStatus) ?? "pending",
    });
    setEditingId(row.id);
    setShowForm(true);
  };

  const toggleSort = (key: "createdAt" | "amount" | "status") => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
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
    selectedRows.length <= 1 ||
    selectedRows.every((r) => r.workerId === selectedRows[0].workerId);
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

  const isPdfReceipt = viewReceiptUrl != null && viewReceiptUrl.toLowerCase().endsWith(".pdf");

  const workerName = (r: WorkerReimbursement) => r.workerName ?? workerById.get(r.workerId) ?? r.workerId;
  const projectName = (r: WorkerReimbursement) =>
    r.projectName ?? (r.projectId ? projectById.get(r.projectId) ?? r.projectId : null) ?? "—";

  function ActionsDropdown({ r }: { r: WorkerReimbursement }) {
    const isBusy = busyId === r.id;
    return (
      <div className="flex items-center justify-end gap-2">
        <DeleteRowAction disabled={isBusy} onDelete={() => handleDelete(r.id)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-h-[44px] min-w-[44px] rounded-sm touch-manipulation" aria-label="Actions">
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
                  <DropdownMenuItem onSelect={() => setViewReceiptUrl(r.receiptUrl)}>
                    View Receipt
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => handleEdit(r)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => handleDelete(r.id)}>
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Worker Reimbursements"
        subtitle="Construction finance: approve, pay, and track worker reimbursements."
        actions={
          <>
            <Link href="/financial/workers" className="inline-flex min-h-[44px] sm:min-h-0 items-center text-sm text-muted-foreground hover:text-foreground mr-2">
              Worker Balances
            </Link>
            <Link href="/labor/receipts" className="inline-flex min-h-[44px] sm:min-h-0 items-center text-sm text-muted-foreground hover:text-foreground mr-2">
              Receipt Uploads
            </Link>
            <Link href="/labor" className="inline-flex min-h-[44px] sm:min-h-0 items-center text-sm text-muted-foreground hover:text-foreground mr-2">
              Labor
            </Link>
            <Button size="sm" className="min-h-[44px] sm:min-h-9 w-full sm:w-auto rounded-sm" onClick={() => { setEditingId(null); setShowForm(true); }}>
              + New Reimbursement
            </Button>
          </>
        }
      />
      {schemaWarning && (
        <p className="text-sm text-amber-600 dark:text-amber-500 border-b border-border/60 pb-3">
          {schemaWarning} Run Labor schema migration (e.g. ensure labor tables) or check Supabase Project Settings → API → Reload schema.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 min-w-[200px] rounded-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-sm"
            disabled={selectedIds.size === 0 || !selectedSameWorker || selectedRows.length === 0}
            onClick={openCreateWorkerPayment}
          >
            Create Worker Payment
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
        </div>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
      </div>

      {showForm && (
        <div className="border-b border-border/60 pb-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {editingId ? "Edit Reimbursement" : "New Reimbursement"}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Worker</label>
              <select
                value={form.workerId}
                onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
                className="h-9 rounded-sm border border-input bg-transparent px-3 text-sm min-w-[140px]"
                required
              >
                <option value="">Select worker</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Project</label>
              <select
                value={form.projectId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="h-9 rounded-sm border border-input bg-transparent px-3 text-sm min-w-[140px]"
                aria-label="Project"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name ?? p.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Vendor</label>
              <Input
                type="text"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="Vendor"
                className="h-9 min-w-[120px] rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Amount</label>
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
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Receipt URL</label>
              <Input
                type="text"
                value={form.receiptUrl}
                onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))}
                placeholder="Link"
                className="h-9 min-w-[160px] rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
              <Input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                className="h-9 min-w-[120px] rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as WorkerReimbursementStatus }))}
                className="h-9 rounded-sm border border-input bg-transparent px-3 text-sm min-w-[100px]"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" className="h-9 rounded-sm">Save</Button>
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-sm" onClick={resetForm}>Cancel</Button>
          </form>
        </div>
      )}

      {/* Mobile: card layout */}
      <div className="flex flex-col gap-3 md:hidden">
        {loading ? (
          <p className="py-6 text-center text-muted-foreground text-xs">Loading…</p>
        ) : paged.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-xs">No reimbursements yet.</p>
        ) : (
          paged.map((r) => (
            <div key={r.id} className="rounded-sm border border-border/60 p-3 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.status === "pending" ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${workerName(r)}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelection(r.id, r.status)}
                      className="h-4 w-4 shrink-0 rounded border-input"
                    />
                  ) : null}
                  <span className="font-medium truncate">{workerName(r)}</span>
                </div>
                <span className="text-muted-foreground text-xs shrink-0">{(r.createdAt ?? "").slice(0, 10)}</span>
              </div>
              <p className="text-sm text-muted-foreground">{projectName(r)} · {(r.vendor ?? "—")}</p>
              <p className="text-sm font-medium">${fmtUsd(r.amount)} · {r.status}</p>
              <div className="flex justify-end pt-2">
                <ActionsDropdown r={r} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="table-responsive hidden border-b border-border/60 md:block">
        <table className="w-full min-w-[640px] text-sm border-collapse table-row-compact md:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="w-10 py-2 px-2 text-center">
                <input
                  type="checkbox"
                  aria-label="Select all pending on page"
                  checked={pendingOnPage.length > 0 && pendingOnPage.every((r) => selectedIds.has(r.id))}
                  onChange={selectAllPendingOnPage}
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Worker</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendor</th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums cursor-pointer select-none" onClick={() => toggleSort("amount")}>Amount</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("status")}>Status</th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Receipt</th>
              <th className="w-44 text-right py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40"><td colSpan={8} className="py-6 px-3 text-center text-muted-foreground text-xs">Loading…</td></tr>
            ) : paged.length === 0 ? (
              <tr className="border-b border-border/40"><td colSpan={8} className="py-6 px-3 text-center text-muted-foreground text-xs">No reimbursements yet.</td></tr>
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="group border-b border-border/40 hover:bg-muted/10">
                  <td className="w-10 py-2 px-2 text-center">
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
                  <td className="py-2 px-3 font-medium">{workerName(r)}</td>
                  <td className="py-2 px-3 text-muted-foreground">{projectName(r)}</td>
                  <td className="py-2 px-3 text-muted-foreground max-w-[120px] truncate" title={r.vendor ?? undefined}>{r.vendor ?? "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium">${fmtUsd(r.amount)}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.status}</td>
                  <td className="py-2 px-3">
                    {r.receiptUrl ? (
                      <button type="button" onClick={() => setViewReceiptUrl(r.receiptUrl)} className="text-primary hover:underline text-xs">View</button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
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
          {filtered.length === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
        </div>
      </div>

      {/* Receipt preview modal */}
      <Dialog open={!!viewReceiptUrl} onOpenChange={(open) => !open && setViewReceiptUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] border-border/60 rounded-sm p-2 flex flex-col">
          <DialogHeader className="sr-only"><DialogTitle>Receipt</DialogTitle></DialogHeader>
          {viewReceiptUrl && (
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-muted/30 rounded-sm">
              {isPdfReceipt ? (
                <iframe src={viewReceiptUrl} title="Receipt" className="w-full min-h-[70vh] border-0 rounded-sm" />
              ) : (
                <img src={viewReceiptUrl} alt="Receipt" className="max-w-full max-h-[85vh] object-contain" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Worker Payment (batch) modal */}
      <Dialog open={!!batchPaymentModal} onOpenChange={(open) => !open && setBatchPaymentModal(null)}>
        <DialogContent className="max-w-md border-border/60 rounded-sm gap-3">
          <DialogHeader>
            <DialogTitle>Create Worker Payment</DialogTitle>
          </DialogHeader>
          {batchPaymentModal && (
            <form onSubmit={handleBatchPayment} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Worker</label>
                <p className="text-sm font-medium">{batchPaymentModal.workerName}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Reimbursements</label>
                <ul className="text-sm border border-border/60 rounded-sm divide-y divide-border/60 max-h-40 overflow-auto">
                  {batchPaymentModal.items.map((r) => (
                    <li key={r.id} className="py-2 px-3 flex justify-between gap-2">
                      <span className="truncate">{projectName(r)} · {(r.vendor ?? "—")}</span>
                      <span className="tabular-nums shrink-0">${fmtUsd(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Total</label>
                <p className="text-sm font-semibold tabular-nums">${fmtUsd(batchPaymentModal.totalAmount)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Payment Method</label>
                <Input
                  type="text"
                  value={batchPayMethod}
                  onChange={(e) => setBatchPayMethod(e.target.value)}
                  placeholder="e.g. Check, ACH"
                  className="h-9 rounded-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Note</label>
                <Input
                  type="text"
                  value={batchPayNote}
                  onChange={(e) => setBatchPayNote(e.target.value)}
                  placeholder="Optional"
                  className="h-9 rounded-sm"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-sm" onClick={() => setBatchPaymentModal(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="h-9 rounded-sm" disabled={batchPaySubmitting}>
                  {batchPaySubmitting ? "…" : "Confirm Payment"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark as Paid modal */}
      <Dialog open={!!payModal} onOpenChange={(open) => !open && setPayModal(null)}>
        <DialogContent className="max-w-sm border-border/60 rounded-sm gap-3">
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal mt-1">
              This will mark the reimbursement as paid and add it to Project Expenses (category: Worker Reimbursement).
            </p>
          </DialogHeader>
          <form onSubmit={handlePay} className="flex flex-col gap-3">
            {payError && <p className="text-sm text-destructive">{payError}</p>}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Amount</label>
              <p className="text-sm font-medium tabular-nums">${payAmount}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Payment Method</label>
              <Input type="text" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="e.g. Check, ACH" className="h-9 rounded-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Note</label>
              <Input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Optional" className="h-9 rounded-sm" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" size="sm" className="h-9 rounded-sm" onClick={() => setPayModal(null)}>Cancel</Button>
              <Button type="submit" size="sm" className="h-9 rounded-sm">Mark as Paid</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

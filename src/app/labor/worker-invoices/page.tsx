"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import {
  getWorkers,
  getProjects,
  getWorkerInvoices,
  insertWorkerInvoice,
  updateWorkerInvoice,
  deleteWorkerInvoice,
  type WorkerInvoice,
  type WorkerInvoiceStatus,
} from "@/lib/data";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WorkerInvoicesPage() {
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<WorkerInvoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const [sort, setSort] = React.useState<{
    key: "createdAt" | "amount" | "status";
    dir: "asc" | "desc";
  }>({
    key: "createdAt",
    dir: "desc",
  });
  const [form, setForm] = React.useState({
    workerId: "",
    projectId: "",
    amount: "",
    status: "unpaid" as WorkerInvoiceStatus,
    invoiceFile: "",
  });
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [w, p, list] = await Promise.all([getWorkers(), getProjects(), getWorkerInvoices()]);
      setWorkers(w);
      setProjects(p);
      setRows(list);
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
          const worker = workerById.get(r.workerId) ?? r.workerId;
          const project = r.projectId ? (projectById.get(r.projectId) ?? r.projectId) : "";
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
            String(r.amount ?? "")
              .toLowerCase()
              .includes(q) ||
            (r.invoiceFile ?? "").toLowerCase().includes(q) ||
            (r.status ?? "").toLowerCase().includes(q)
          );
        })
      : rows;

    const dir = sort.dir === "asc" ? 1 : -1;
    const sorted = [...base].sort((a, b) => {
      if (sort.key === "amount") return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      if (sort.key === "status")
        return (String(a.status).localeCompare(String(b.status)) || 0) * dir;
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
      amount: "",
      status: "unpaid",
      invoiceFile: "",
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
        await updateWorkerInvoice(editingId, {
          workerId: form.workerId,
          projectId: form.projectId || null,
          amount,
          status: form.status,
          invoiceFile: form.invoiceFile.trim() || null,
        });
      } else {
        await insertWorkerInvoice({
          workerId: form.workerId,
          projectId: form.projectId || null,
          amount,
          status: form.status,
          invoiceFile: form.invoiceFile.trim() || null,
        });
      }
      resetForm();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const handleEdit = (row: WorkerInvoice) => {
    setForm({
      workerId: row.workerId,
      projectId: row.projectId ?? "",
      amount: String(row.amount),
      status: row.status,
      invoiceFile: row.invoiceFile ?? "",
    });
    setEditingId(row.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this invoice?")) return;
    try {
      await deleteWorkerInvoice(id);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const toggleStatus = async (row: WorkerInvoice) => {
    const next: WorkerInvoiceStatus = row.status === "paid" ? "unpaid" : "paid";
    try {
      await updateWorkerInvoice(row.id, { status: next });
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed.");
    }
  };

  const toggleSort = (key: "createdAt" | "amount" | "status") => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const sortFilterActive = sort.key !== "createdAt" || sort.dir !== "desc" ? 1 : 0;

  const openNewInvoice = () => {
    resetForm();
    setShowForm(true);
  };

  return (
    <div
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
        <PageHeader
          title="Worker Invoices"
          subtitle="Track invoices from 1099 workers or small subcontractors."
          actions={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/labor"
                className="text-sm text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center"
              >
                Labor
              </Link>
              <Button
                size="sm"
                className="w-full rounded-md max-md:min-h-11 sm:w-auto"
                onClick={openNewInvoice}
              >
                + New Invoice
              </Button>
            </div>
          }
        />
      </div>
      <MobileListHeader
        title="Worker Invoices"
        fab={<MobileFabButton ariaLabel="New invoice" onClick={openNewInvoice} />}
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
              placeholder="Search worker invoices…"
              className="h-10 pl-8 text-sm"
              aria-label="Search invoices"
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
                key: e.target.value as "createdAt" | "amount" | "status",
              }))
            }
            className="w-full"
          >
            <option value="createdAt">Date</option>
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
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>
      <div className="hidden flex-col gap-3 border-b border-border/60 pb-3 md:flex md:flex-row md:flex-wrap md:items-center md:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search worker invoices…"
          className="h-9 w-full min-w-0 md:min-w-[220px] md:max-w-md"
        />
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
      {message ? <p className="text-sm text-muted-foreground md:hidden">{message}</p> : null}

      {showForm && (
        <div className="border-b border-border/60 pb-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {editingId ? "Edit Invoice" : "New Worker Invoice"}
          </h2>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 items-stretch max-md:[&_button]:min-h-11 md:flex-row md:flex-wrap md:items-end"
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Worker
              </label>
              <select
                value={form.workerId}
                onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[160px]"
                required
              >
                <option value="">Select worker</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Project
              </label>
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[160px]"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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
                className="h-9 w-28 rounded-md"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as WorkerInvoiceStatus }))
                }
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[100px]"
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Invoice file (URL)
              </label>
              <Input
                type="text"
                value={form.invoiceFile}
                onChange={(e) => setForm((f) => ({ ...f, invoiceFile: e.target.value }))}
                placeholder="Link to invoice file"
                className="h-9 min-w-[160px] rounded-md"
              />
            </div>
            <Button type="submit" size="sm" className="h-9">
              Save
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={resetForm}>
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
            message="No worker invoices yet."
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-border/60">
            {paged.map((r) => (
              <div key={r.id} className="flex min-h-[56px] flex-col gap-2 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {r.createdAt.slice(0, 10)}
                    </p>
                    <p className="truncate text-sm font-medium text-foreground">
                      {workerById.get(r.workerId) ?? r.workerId}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.projectId ? (projectById.get(r.projectId) ?? r.projectId) : "—"}
                    </p>
                    <p className="mt-1 text-sm font-medium tabular-nums">${fmtUsd(r.amount)}</p>
                    {r.invoiceFile ? (
                      <a
                        href={r.invoiceFile}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-primary hover:underline"
                      >
                        View invoice file
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">No file</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="btn-outline-ghost h-8 shrink-0 rounded-sm"
                    onClick={() => toggleStatus(r)}
                  >
                    {r.status}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-outline-ghost h-8 flex-1 rounded-sm"
                    onClick={() => handleEdit(r)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-outline-ghost h-8 flex-1 rounded-sm text-red-600"
                    onClick={() => handleDelete(r.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hidden border-b border-border/60 md:block">
        <div className="table-responsive overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm lg:min-w-0">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Worker
                </th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Project
                </th>
                <th
                  className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                </th>
                <th
                  className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => toggleSort("status")}
                >
                  Status
                </th>
                <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Invoice file
                </th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="border-b border-border/40">
                  <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground text-xs">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr className="border-b border-border/40">
                  <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground text-xs">
                    No worker invoices yet.
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10">
                    <td className="py-2 px-4 tabular-nums text-muted-foreground">
                      {r.createdAt.slice(0, 10)}
                    </td>
                    <td className="py-2 px-4">{workerById.get(r.workerId) ?? r.workerId}</td>
                    <td className="py-2 px-4 text-muted-foreground">
                      {r.projectId ? (projectById.get(r.projectId) ?? r.projectId) : "—"}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums font-medium">
                      ${fmtUsd(r.amount)}
                    </td>
                    <td className="py-2 px-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="btn-outline-ghost h-8"
                        onClick={() => toggleStatus(r)}
                      >
                        {r.status}
                      </Button>
                    </td>
                    <td className="py-2 px-4">
                      {r.invoiceFile ? (
                        <a
                          href={r.invoiceFile}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="btn-outline-ghost h-8"
                          onClick={() => handleEdit(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="btn-outline-ghost h-8 text-red-600"
                          onClick={() => handleDelete(r.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 text-sm text-muted-foreground max-md:[&_button]:min-h-11 sm:flex-row sm:items-center sm:justify-between">
        <span className="tabular-nums">
          {filtered.length === 0
            ? "0"
            : Math.min(filtered.length, (page - 1) * pageSize + 1).toString()}
          –{Math.min(filtered.length, page * pageSize)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 sm:flex-none"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 sm:flex-none"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWorkers,
  getProjects,
  getWorkerReimbursements,
  insertWorkerReimbursement,
  updateWorkerReimbursement,
  deleteWorkerReimbursement,
  type WorkerReimbursement,
} from "@/lib/data";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WorkerReimbursementsPage() {
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
    amount: "",
    receiptUrl: "",
    description: "",
    status: "pending",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [w, p, list] = await Promise.all([
        getWorkers(),
        getProjects(),
        getWorkerReimbursements(),
      ]);
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

  const workerById = React.useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);
  const projectById = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => {
          const worker = workerById.get(r.workerId) ?? r.workerId;
          const project = r.projectId ? projectById.get(r.projectId) ?? r.projectId : "";
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
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
      // createdAt
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
          amount,
          receiptUrl: form.receiptUrl.trim() || null,
          description: form.description.trim() || null,
          status: form.status,
        });
      } else {
        await insertWorkerReimbursement({
          workerId: form.workerId,
          projectId: form.projectId || null,
          amount,
          receiptUrl: form.receiptUrl.trim() || null,
          description: form.description.trim() || null,
          status: form.status,
        });
      }
      resetForm();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this reimbursement?")) return;
    try {
      await deleteWorkerReimbursement(id);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleEdit = (row: WorkerReimbursement) => {
    setForm({
      workerId: row.workerId,
      projectId: row.projectId ?? "",
      amount: String(row.amount ?? 0),
      receiptUrl: row.receiptUrl ?? "",
      description: row.description ?? "",
      status: row.status ?? "pending",
    });
    setEditingId(row.id);
    setShowForm(true);
  };

  const toggleSort = (key: "createdAt" | "amount" | "status") => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Worker Reimbursements"
        subtitle="Workers submit receipts for materials or purchases."
        actions={
          <>
            <Link href="/labor" className="text-sm text-muted-foreground hover:text-foreground mr-2">
              Labor
            </Link>
            <Button
              size="sm"
              className="rounded-md"
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
            >
              + New Reimbursement
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reimbursements…"
          className="h-9 min-w-[220px]"
        />
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>

      {showForm && (
        <div className="border-b border-border/60 pb-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">New Reimbursement</h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Worker</label>
              <select
                value={form.workerId}
                onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[160px]"
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
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[160px]"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Amount</label>
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
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Receipt (URL)</label>
              <Input
                type="text"
                value={form.receiptUrl}
                onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))}
                placeholder="Paste link or leave blank"
                className="h-9 min-w-[180px] rounded-md"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
              <Input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                className="h-9 min-w-[140px] rounded-md"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-[100px]"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <Button type="submit" size="sm" className="h-9">Save</Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={resetForm}>
              Cancel
            </Button>
          </form>
        </div>
      )}

      <div className="overflow-x-auto border-b border-border/60">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
              <th
                className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums cursor-pointer select-none"
                onClick={() => toggleSort("amount")}
              >
                Amount
              </th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
              <th
                className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
                onClick={() => toggleSort("status")}
              >
                Status
              </th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Receipt</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40">
                <td colSpan={8} className="py-6 px-4 text-center text-muted-foreground text-xs">Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={8} className="py-6 px-4 text-center text-muted-foreground text-xs">No reimbursements yet.</td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-4 tabular-nums text-muted-foreground">{r.createdAt.slice(0, 10)}</td>
                  <td className="py-2 px-4">{workerById.get(r.workerId) ?? r.workerId}</td>
                  <td className="py-2 px-4 text-muted-foreground">{r.projectId ? projectById.get(r.projectId) ?? r.projectId : "—"}</td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">${fmtUsd(r.amount)}</td>
                  <td className="py-2 px-4 text-muted-foreground max-w-[200px] truncate" title={r.description ?? undefined}>{r.description ?? "—"}</td>
                  <td className="py-2 px-4">{r.status}</td>
                  <td className="py-2 px-4">
                    {r.receiptUrl ? (
                      <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => handleEdit(r)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => handleDelete(r.id)}>
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

      <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {filtered.length === 0 ? "0" : (Math.min(filtered.length, (page - 1) * pageSize + 1)).toString()}–{Math.min(filtered.length, page * pageSize)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <Button size="sm" variant="outline" className="h-8" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

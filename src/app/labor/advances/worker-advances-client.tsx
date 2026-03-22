"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { syncRouterAndClients } from "@/lib/sync-router-client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { WorkerAdvanceFormDialog } from "./worker-advance-form-dialog";
import { WorkerAdvanceActionsMenu } from "./worker-advance-actions-menu";

type WorkerOption = { id: string; name: string };
type ProjectOption = { id: string; name: string };

export type AdvanceRow = {
  id: string;
  workerId: string;
  workerName: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  advanceDate: string;
  status: "pending" | "deducted" | "cancelled";
  notes: string | null;
};

type Props = {
  workers: WorkerOption[];
  projects: ProjectOption[];
};

export function WorkerAdvancesClient({ workers, projects }: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState<AdvanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | AdvanceRow["status"]>("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [editing, setEditing] = React.useState<AdvanceRow | null>(null);

  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const url = new URL("/api/labor/advances", window.location.origin);
      url.searchParams.set("status", "active");
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed to load advances (${res.status})`);
      }
      const data = await res.json();
      const advances = (data.advances ?? []) as any[];
      setRows(
        advances.map((r) => ({
          id: r.id as string,
          workerId: r.workerId as string,
          workerName: (r.workerName as string) ?? "",
          projectId: (r.projectId as string | null) ?? null,
          projectName: (r.projectName as string | null) ?? null,
          amount: Number(r.amount) || 0,
          advanceDate: String(r.advanceDate ?? "").slice(0, 10),
          status: (r.status as AdvanceRow["status"]) ?? "pending",
          notes: (r.notes as string | null) ?? null,
        }))
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load advances.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void syncRouterAndClients(router);
      void load();
    }, [router, load]),
    [router, load]
  );

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (workerFilter && r.workerId !== workerFilter) return false;
      if (projectFilter && r.projectId !== projectFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (dateFrom && r.advanceDate < dateFrom) return false;
      if (dateTo && r.advanceDate > dateTo) return false;
      if (query) {
        const haystack = `${r.workerName} ${r.projectName ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, workerFilter, projectFilter, statusFilter, dateFrom, dateTo, query]);

  const openCreate = () => {
    setEditorMode("create");
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (row: AdvanceRow) => {
    setEditorMode("edit");
    setEditing(row);
    setEditorOpen(true);
  };

  const handleSaved = (saved: AdvanceRow) => {
    setRows((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      if (exists) {
        return prev.map((r) => (r.id === saved.id ? saved : r));
      }
      return [...prev, saved].sort((a, b) => a.advanceDate.localeCompare(b.advanceDate));
    });
  };

  const handleCreateOrUpdate = async (payload: {
    id?: string;
    workerId: string;
    projectId: string | null;
    amount: number;
    advanceDate: string;
    notes: string;
  }) => {
    setBusyId(payload.id ?? "new");
    try {
      if (!payload.id) {
        const res = await fetch("/api/labor/advances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workerId: payload.workerId,
            projectId: payload.projectId,
            amount: payload.amount,
            advanceDate: payload.advanceDate,
            notes: payload.notes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Failed to create advance.");
        }
        const r = await res.json();
        handleSaved({
          id: r.id,
          workerId: r.workerId,
          workerName: r.workerName,
          projectId: r.projectId,
          projectName: r.projectName,
          amount: r.amount,
          advanceDate: r.advanceDate,
          status: r.status,
          notes: r.notes,
        });
      } else {
        const res = await fetch(`/api/labor/advances/${payload.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: payload.projectId,
            amount: payload.amount,
            advanceDate: payload.advanceDate,
            notes: payload.notes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Failed to update advance.");
        }
        const r = await res.json();
        handleSaved({
          id: r.id,
          workerId: r.workerId,
          workerName: r.workerName,
          projectId: r.projectId,
          projectName: r.projectName,
          amount: r.amount,
          advanceDate: r.advanceDate,
          status: r.status,
          notes: r.notes,
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkDeducted = async (row: AdvanceRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/labor/advances/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deducted" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to mark as deducted.");
      }
      const r = await res.json();
      handleSaved({
        id: r.id,
        workerId: r.workerId,
        workerName: r.workerName,
        projectId: r.projectId,
        projectName: r.projectName,
        amount: r.amount,
        advanceDate: r.advanceDate,
        status: r.status,
        notes: r.notes,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: AdvanceRow) => {
    if (!window.confirm(`Delete advance for ${row.workerName}?`)) return;
    setBusyId(row.id);
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== row.id));
    try {
      const res = await fetch(`/api/labor/advances/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to delete advance.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to delete advance.");
      setRows(prev);
    } finally {
      setBusyId(null);
    }
  };

  const handleDialogSave = async (draft: {
    id?: string;
    workerId: string;
    projectId: string | null;
    amount: string;
    advanceDate: string;
    notes: string;
  }) => {
    const amountNum = Number(draft.amount);
    await handleCreateOrUpdate({
      id: draft.id,
      workerId: draft.workerId,
      projectId: draft.projectId,
      amount: amountNum,
      advanceDate: draft.advanceDate,
      notes: draft.notes,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Worker Advances"
        subtitle="Track salary advances and deductions for workers."
        actions={
          <Button onClick={openCreate} className="h-9 rounded-lg px-3 text-sm">
            + Create Advance
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All workers</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="deducted">Deducted</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 w-[140px] text-sm"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 w-[140px] text-sm"
        />
        <Input
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 max-w-[220px] text-sm"
        />
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={loading}
          onClick={() => load()}
        >
          Refresh
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <Card className="overflow-hidden">
        <div className="table-responsive">
          <table className="w-full min-w-[720px] border-collapse text-sm md:min-w-0">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Worker
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Project
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
                  Amount
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Notes
                </th>
                <th className="w-10 px-2 py-2 text-right text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-6 px-3 text-center text-xs text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 px-3 text-center text-xs text-muted-foreground">
                    No advances yet.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 font-medium">{row.workerName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.projectName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${row.amount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {row.advanceDate}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px] truncate">
                      {row.notes ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <WorkerAdvanceActionsMenu
                        advance={row}
                        onEdit={() => openEdit(row)}
                        onMarkDeducted={() => handleMarkDeducted(row)}
                        onDelete={() => handleDelete(row)}
                        disabled={busyId === row.id}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <WorkerAdvanceFormDialog
        open={editorOpen}
        mode={editorMode}
        workers={workers}
        projects={projects}
        initialValues={
          editing
            ? {
                id: editing.id,
                workerId: editing.workerId,
                projectId: editing.projectId,
                amount: editing.amount.toString(),
                advanceDate: editing.advanceDate,
                notes: editing.notes ?? "",
              }
            : undefined
        }
        onClose={() => setEditorOpen(false)}
        onSave={handleDialogSave}
      />
    </div>
  );
}

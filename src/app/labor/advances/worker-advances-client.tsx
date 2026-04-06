"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
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
  const [filtersOpen, setFiltersOpen] = React.useState(false);

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
      syncRouterNonBlocking(router);
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

  const activeDrawerFilterCount =
    (workerFilter ? 1 : 0) +
    (projectFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

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
    setMessage(null);
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
        workerName: (r.workerName as string)?.trim() || row.workerName,
        projectId: r.projectId,
        projectName: r.projectName,
        amount: r.amount,
        advanceDate: r.advanceDate,
        status: (r.status as AdvanceRow["status"]) ?? "deducted",
        notes: r.notes,
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to mark as deducted.");
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
    <div className={cn("space-y-4", mobileListPagePaddingClass, "max-md:!gap-3 max-md:!space-y-3")}>
      <div className="hidden md:block">
        <PageHeader
          title="Worker Advances"
          subtitle="Track salary advances and deductions for workers."
          actions={
            <Button
              onClick={openCreate}
              className="h-9 max-md:min-h-11 max-md:w-full rounded-lg px-3 text-sm sm:w-auto"
            >
              + Create Advance
            </Button>
          }
        />
      </div>
      <MobileListHeader
        title="Worker Advances"
        fab={<MobileFabButton ariaLabel="Create advance" onClick={openCreate} />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 pl-8 text-sm"
              aria-label="Search advances"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Worker</p>
          <Select
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            className="w-full"
          >
            <option value="">All workers</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Project</p>
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | AdvanceRow["status"])}
            className="w-full"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="deducted">Deducted</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">From</p>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">To</p>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-sm"
          disabled={loading}
          onClick={() => {
            void load();
            setFiltersOpen(false);
          }}
        >
          Refresh
        </Button>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      <div className="hidden grid-cols-1 gap-2 border-b border-border/60 pb-3 sm:grid-cols-2 md:grid lg:flex lg:flex-wrap lg:items-center">
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="h-9 max-md:min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm lg:w-auto"
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
          className="h-9 max-md:min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm lg:w-auto"
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
          className="h-9 max-md:min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm lg:w-auto"
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
          className="h-9 max-md:min-h-11 w-full text-sm sm:w-[140px]"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 max-md:min-h-11 w-full text-sm sm:w-[140px]"
        />
        <Input
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 max-md:min-h-11 w-full max-w-none text-sm sm:max-w-[220px] lg:max-w-[220px]"
        />
        <div className="hidden flex-1 lg:block" />
        <Button
          variant="outline"
          size="sm"
          className="h-9 max-md:min-h-11 w-full lg:w-auto"
          disabled={loading}
          onClick={() => load()}
        >
          Refresh
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="md:hidden">
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No advances yet."
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-border/60">
            {filtered.map((row) => (
              <div key={row.id} className="flex min-h-[56px] flex-col gap-2 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{row.workerName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.projectName ?? "—"} · {row.advanceDate}
                    </p>
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      ${row.amount.toFixed(2)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {row.notes ?? "—"}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="flex justify-end">
                  <WorkerAdvanceActionsMenu
                    advance={row}
                    onEdit={() => openEdit(row)}
                    onMarkDeducted={() => handleMarkDeducted(row)}
                    onDelete={() => handleDelete(row)}
                    disabled={busyId === row.id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="table-responsive overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm lg:min-w-0">
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

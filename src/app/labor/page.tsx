"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProjects,
  getWorkers,
  getDailyWorkEntriesByDate,
  insertDailyWorkEntry,
  updateDailyWorkEntry,
  deleteDailyWorkEntry,
  dayPayForEntry,
  totalPayForEntry,
  type DailyWorkEntry,
  type DailyWorkEntryDraft,
  type DayType,
} from "@/lib/data";

const DAY_TYPES: { value: DayType; label: string }[] = [
  { value: "full_day", label: "Full Day" },
  { value: "half_day", label: "Half Day" },
  { value: "absent", label: "Absent" },
];

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

type DraftRow = (DailyWorkEntry | (DailyWorkEntryDraft & { id?: string; workDate: string; createdAt?: string })) & { localId: string };

function toDraft(entry: DailyWorkEntry): DraftRow {
  return {
    ...entry,
    localId: entry.id,
    workDate: entry.workDate,
  };
}

function emptyDraft(workDate: string): DraftRow {
  return {
    localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    workDate,
    workerId: "",
    projectId: null,
    dayType: "full_day",
    dailyRate: 0,
    otAmount: 0,
    notes: null,
  };
}

export default function LaborPage() {
  const [workDate, setWorkDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [ensureSchemaLoading, setEnsureSchemaLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [w, p, entries] = await Promise.all([
        getWorkers(),
        getProjects(),
        getDailyWorkEntriesByDate(workDate),
      ]);
      setWorkers(w);
      setProjects(p);
      let list = entries.map(toDraft);
      if (projectFilter) {
        list = list.filter((r) => r.projectId === projectFilter);
      }
      if (list.length === 0) list = [emptyDraft(workDate)];
      setRows(list);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([emptyDraft(workDate)]);
    } finally {
      setLoading(false);
    }
  }, [workDate, projectFilter]);

  const isTableMissingError = React.useMemo(
    () =>
      message !== null &&
      (message.includes("daily_work_entries") || message.includes("未找到") || message.includes("schema cache")),
    [message]
  );

  const runEnsureSchema = React.useCallback(async () => {
    setEnsureSchemaLoading(true);
    try {
      const res = await fetch("/api/ensure-schema", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; message: string };
      setMessage(data.message);
      if (data.ok) setTimeout(() => load(), 1500);
    } finally {
      setEnsureSchemaLoading(false);
    }
  }, [load]);

  React.useEffect(() => {
    load();
  }, [load]);

  const updateRow = (localId: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const addWorker = () => {
    setRows((prev) => [...prev, emptyDraft(workDate)]);
  };

  const handleSave = async (row: DraftRow) => {
    if (!row.workerId) {
      setMessage("Select a worker.");
      return;
    }
    setMessage(null);
    try {
      if ("id" in row && row.id && !row.localId.startsWith("draft-")) {
        await updateDailyWorkEntry(row.id, {
          workerId: row.workerId,
          projectId: row.projectId,
          dayType: row.dayType,
          dailyRate: row.dailyRate,
          otAmount: row.otAmount,
          notes: row.notes,
        });
      } else {
        await insertDailyWorkEntry(workDate, {
          workerId: row.workerId,
          projectId: row.projectId,
          dayType: row.dayType,
          dailyRate: row.dailyRate,
          otAmount: row.otAmount,
          notes: row.notes,
        });
      }
      setMessage("Saved.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const handleDelete = async (row: DraftRow) => {
    if ("id" in row && row.id && !row.localId.startsWith("draft-")) {
      if (!window.confirm("Delete this entry?")) return;
      try {
        await deleteDailyWorkEntry(row.id);
        setMessage("Deleted.");
        await load();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Delete failed.");
      }
    } else {
      setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.localId !== row.localId)));
    }
  };

  const workerById = React.useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  const displayRows = projectFilter ? rows : rows;
  const totalLabor = displayRows.reduce((sum, r) => {
    const dayPay = dayPayForEntry(r.dayType, r.dailyRate);
    return sum + dayPay + r.otAmount;
  }, 0);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Labor"
        subtitle="Daily work for construction workers. Full / Half day or Absent; add OT as needed."
      />
      <div className="form-mobile-friendly flex flex-wrap items-center gap-3 border-b border-border/60 pb-3 space-y-4 md:space-y-0">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
        <Input
          type="date"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          className="h-11 w-full rounded-lg md:h-9 md:w-[152px]"
        />
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</label>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm md:h-9 md:min-w-[180px]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" className="h-11 w-full rounded-lg md:h-9 md:w-auto" onClick={addWorker}>
          + Add Worker
        </Button>
      </div>
      {message ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{message}</p>
          {isTableMissingError ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={ensureSchemaLoading}
              onClick={runEnsureSchema}
            >
              {ensureSchemaLoading ? "处理中…" : "创建表"}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto border-b border-border/60 hidden md:block">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Day Type</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Daily Rate</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">OT</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Total Pay</th>
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40">
                <td colSpan={8} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  Loading…
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const entryForPay: DailyWorkEntry = {
                  id: "id" in row && row.id ? row.id : "",
                  workDate: row.workDate,
                  workerId: row.workerId,
                  projectId: row.projectId,
                  dayType: row.dayType,
                  dailyRate: row.dailyRate,
                  otAmount: row.otAmount,
                  notes: row.notes ?? null,
                  createdAt: "createdAt" in row ? (row.createdAt ?? "") : "",
                };
                const totalPay = totalPayForEntry(entryForPay);
                return (
                  <tr key={row.localId} className="border-b border-border/40 hover:bg-muted/10">
                    <td className="py-2 px-4">
                      <select
                        value={row.workerId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const w = workerById.get(id);
                          updateRow(row.localId, {
                            workerId: id,
                            dailyRate: w && "dailyRate" in w ? Number(w.dailyRate) : row.dailyRate,
                          });
                        }}
                        className="h-9 w-full min-w-[160px] rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">Select worker</option>
                        {workers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-4">
                      <select
                        value={row.projectId ?? ""}
                        onChange={(e) => updateRow(row.localId, { projectId: e.target.value || null })}
                        className="h-9 min-w-[140px] rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-4">
                      <select
                        value={row.dayType}
                        onChange={(e) => updateRow(row.localId, { dayType: e.target.value as DayType })}
                        className="h-9 min-w-[120px] rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        {DAY_TYPES.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-4 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.dailyRate || ""}
                        onChange={(e) => updateRow(row.localId, { dailyRate: parseFloat(e.target.value) || 0 })}
                        className="h-9 w-24 text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.otAmount || ""}
                        onChange={(e) => updateRow(row.localId, { otAmount: parseFloat(e.target.value) || 0 })}
                        className="h-9 w-24 text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums font-medium">
                      {fmtUsd(totalPay)}
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        type="text"
                        value={row.notes ?? ""}
                        onChange={(e) => updateRow(row.localId, { notes: e.target.value || null })}
                        placeholder="Notes"
                        className="h-9 min-w-[120px] text-sm"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => handleSave(row)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => handleDelete(row)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border/60 bg-muted/10 font-medium">
              <td colSpan={5} className="py-3 px-4 text-right text-muted-foreground">
                Total labor cost (this day)
              </td>
              <td className="py-3 px-4 text-right tabular-nums">
                {fmtUsd(totalLabor)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile: worker cards */}
      <div className="grid gap-4 md:hidden">
        {loading ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          displayRows.map((row) => {
            const entryForPay: DailyWorkEntry = {
              id: "id" in row && row.id ? row.id : "",
              workDate: row.workDate,
              workerId: row.workerId,
              projectId: row.projectId,
              dayType: row.dayType,
              dailyRate: row.dailyRate,
              otAmount: row.otAmount,
              notes: row.notes ?? null,
              createdAt: "createdAt" in row ? (row.createdAt ?? "") : "",
            };
            const totalPay = totalPayForEntry(entryForPay);
            return (
              <div
                key={row.localId}
                className="rounded-lg border border-border/60 bg-background p-4 shadow-[var(--shadow-1)] space-y-4"
              >
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</label>
                  <select
                    value={row.workerId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const w = workerById.get(id);
                      updateRow(row.localId, {
                        workerId: id,
                        dailyRate: w && "dailyRate" in w ? Number(w.dailyRate) : row.dailyRate,
                      });
                    }}
                    className="mt-1 h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm font-medium"
                  >
                    <option value="">Select worker</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</label>
                    <select
                      value={row.projectId ?? ""}
                      onChange={(e) => updateRow(row.localId, { projectId: e.target.value || null })}
                      className="mt-1 h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
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
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Day Type</label>
                    <select
                      value={row.dayType}
                      onChange={(e) => updateRow(row.localId, { dayType: e.target.value as DayType })}
                      className="mt-1 h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                    >
                      {DAY_TYPES.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daily Rate</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.dailyRate || ""}
                        onChange={(e) => updateRow(row.localId, { dailyRate: parseFloat(e.target.value) || 0 })}
                        className="mt-1 h-11 w-full rounded-lg text-right tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">OT</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.otAmount || ""}
                        onChange={(e) => updateRow(row.localId, { otAmount: parseFloat(e.target.value) || 0 })}
                        className="mt-1 h-11 w-full rounded-lg text-right tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="text-sm font-medium tabular-nums">Total: {fmtUsd(totalPay)}</div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
                    <Input
                      type="text"
                      value={row.notes ?? ""}
                      onChange={(e) => updateRow(row.localId, { notes: e.target.value || null })}
                      placeholder="Notes"
                      className="mt-1 h-11 w-full rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="h-11 flex-1 rounded-lg" onClick={() => handleSave(row)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-11 flex-1 rounded-lg text-red-600" onClick={() => handleDelete(row)}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          })
        )}
        {!loading && displayRows.length > 0 && (
          <div className="rounded-lg border-t-2 border-border/60 bg-muted/10 px-4 py-3 font-medium text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total labor cost (this day)</span>
              <span className="tabular-nums">{fmtUsd(totalLabor)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

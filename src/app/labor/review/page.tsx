"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearLaborEntry,
  confirmLaborEntry,
  getLaborEntries,
  getProjects,
  getWorkers,
  upsertLaborEntry,
  type LaborEntry,
} from "@/lib/data";

export default function LaborReviewPage() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = React.useState<"draft" | "confirmed">("draft");
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [rows, setRows] = React.useState<LaborEntry[]>(() => getLaborEntries("draft"));
  const [selected, setSelected] = React.useState<LaborEntry | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const workerOptions = React.useMemo(() => getWorkers(), []);
  const projectOptions = React.useMemo(() => getProjects(), []);
  const workers = React.useMemo(() => new Map(workerOptions.map((w) => [w.id, w.name])), [workerOptions]);
  const projects = React.useMemo(() => new Map(projectOptions.map((p) => [p.id, p.name])), [projectOptions]);

  const refresh = React.useCallback(() => setRows(getLaborEntries(status)), [status]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (row.date !== date) return false;
      if (workerFilter && row.workerId !== workerFilter) return false;
      if (projectFilter && row.amProjectId !== projectFilter && row.pmProjectId !== projectFilter && row.otProjectId !== projectFilter) return false;
      return true;
    });
  }, [rows, date, workerFilter, projectFilter]);

  const getHalfDayRate = (workerId: string): number => {
    return workerOptions.find((w) => w.id === workerId)?.halfDayRate ?? 0;
  };

  const computeTotal = (row: LaborEntry): number => {
    const halfDayRate = getHalfDayRate(row.workerId);
    const am = row.amWorked ? halfDayRate : 0;
    const pm = row.pmWorked ? halfDayRate : 0;
    const ot = Number.isFinite(row.otAmount) ? Math.max(0, row.otAmount) : 0;
    return am + pm + ot;
  };

  const canConfirm = (row: LaborEntry): boolean => {
    if (!row.workerId) return false;
    if (row.amWorked && !row.amProjectId) return false;
    if (row.pmWorked && !row.pmProjectId) return false;
    if (row.otAmount > 0 && !row.otProjectId) return false;
    return row.checklist.verifiedWorker && row.checklist.verifiedProjects && row.checklist.verifiedAmount;
  };

  const handleQuickConfirm = (row: LaborEntry) => {
    if (!canConfirm(row)) return setMessage("Checklist or required allocation is incomplete.");
    const updated = confirmLaborEntry(row.id);
    if (!updated) return setMessage("Unable to confirm entry.");
    setMessage("Entry confirmed.");
    refresh();
  };

  const handleDelete = (row: LaborEntry) => {
    clearLaborEntry(row.id);
    if (selected?.id === row.id) setSelected(null);
    setMessage("Entry deleted.");
    refresh();
  };

  const handleSaveSelected = () => {
    if (!selected) return;
    const saved = upsertLaborEntry({
      id: selected.id,
      date: selected.date,
      workerId: selected.workerId,
      amWorked: selected.amWorked,
      amProjectId: selected.amProjectId,
      pmWorked: selected.pmWorked,
      pmProjectId: selected.pmProjectId,
      otAmount: selected.otAmount,
      otProjectId: selected.otProjectId,
      checklist: selected.checklist,
      status: "draft",
    });
    setSelected(saved);
    setMessage("Draft changes saved.");
    refresh();
  };

  const handleConfirmSelected = () => {
    if (!selected) return;
    if (!canConfirm(selected)) return setMessage("Complete checklist and required project allocation first.");
    const updated = confirmLaborEntry(selected.id);
    if (!updated) return setMessage("Unable to confirm entry.");
    setSelected(updated);
    setMessage("Entry confirmed.");
    refresh();
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Labor Review" description="Review labor drafts and confirm entries for project actual labor." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg" />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "confirmed")}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
        </select>
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All workers</option>
          {workerOptions.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All projects</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {message ? (
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Worker</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">AM Project</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">PM Project</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">OT Project</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Total</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 tabular-nums">{row.date}</td>
                    <td className="py-3 px-4">{workers.get(row.workerId) ?? "Unknown worker"}</td>
                    <td className="py-3 px-4">{row.amProjectId ? projects.get(row.amProjectId) ?? row.amProjectId : "—"}</td>
                    <td className="py-3 px-4">{row.pmProjectId ? projects.get(row.pmProjectId) ?? row.pmProjectId : "—"}</td>
                    <td className="py-3 px-4">{row.otProjectId ? projects.get(row.otProjectId) ?? row.otProjectId : "—"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.total)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          row.status === "confirmed"
                            ? "inline-flex rounded-full px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "inline-flex rounded-full px-2 py-0.5 text-xs bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }
                      >
                        {row.status === "confirmed" ? "Confirmed" : "Draft"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => setSelected({ ...row })}>
                          Review
                        </Button>
                        {row.status === "draft" ? (
                          <Button size="sm" className="rounded-lg h-8" disabled={!canConfirm(row)} onClick={() => handleQuickConfirm(row)}>
                            Confirm
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => handleDelete(row)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="py-8 px-4 text-center text-muted-foreground" colSpan={8}>
                      No entries for current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-5">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select an entry and click Review.</p>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Review Drawer</h3>
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.amWorked} onChange={(e) => setSelected((prev) => (prev ? { ...prev, amWorked: e.target.checked } : prev))} />
                  AM worked
                </label>
                <select
                  value={selected.amProjectId ?? ""}
                  onChange={(e) => setSelected((prev) => (prev ? { ...prev, amProjectId: e.target.value || undefined } : prev))}
                  className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">AM project</option>
                  {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.pmWorked} onChange={(e) => setSelected((prev) => (prev ? { ...prev, pmWorked: e.target.checked } : prev))} />
                  PM worked
                </label>
                <select
                  value={selected.pmProjectId ?? ""}
                  onChange={(e) => setSelected((prev) => (prev ? { ...prev, pmProjectId: e.target.value || undefined } : prev))}
                  className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">PM project</option>
                  {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select
                  value={selected.otProjectId ?? ""}
                  onChange={(e) => setSelected((prev) => (prev ? { ...prev, otProjectId: e.target.value || undefined } : prev))}
                  className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">OT project</option>
                  {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={selected.otAmount}
                  onChange={(e) => setSelected((prev) => (prev ? { ...prev, otAmount: Number(e.target.value) || 0 } : prev))}
                  className="rounded-lg text-right tabular-nums"
                />
                <p className="text-sm">
                  Total:{" "}
                  <span className="font-semibold tabular-nums">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(computeTotal(selected))}
                  </span>
                </p>
              </div>
              <div className="space-y-2 border-t border-zinc-200/60 dark:border-border pt-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Checklist</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.checklist.verifiedWorker}
                    onChange={(e) => setSelected((prev) => (prev ? { ...prev, checklist: { ...prev.checklist, verifiedWorker: e.target.checked } } : prev))}
                  />
                  Verified Worker
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.checklist.verifiedProjects}
                    onChange={(e) => setSelected((prev) => (prev ? { ...prev, checklist: { ...prev.checklist, verifiedProjects: e.target.checked } } : prev))}
                  />
                  Verified Projects
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.checklist.verifiedAmount}
                    onChange={(e) => setSelected((prev) => (prev ? { ...prev, checklist: { ...prev.checklist, verifiedAmount: e.target.checked } } : prev))}
                  />
                  Verified Amount
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-lg" onClick={() => setSelected(null)}>Close</Button>
                <Button variant="outline" className="rounded-lg" onClick={handleSaveSelected}>Save changes</Button>
                <Button className="rounded-lg" disabled={!canConfirm(selected)} onClick={handleConfirmSelected}>Confirm</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

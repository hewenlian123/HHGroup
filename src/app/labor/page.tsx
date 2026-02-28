"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProjects,
  getLaborWorkers,
  getLaborEntriesByDate,
  upsertLaborEntry,
  clearLaborEntry,
  confirmLaborEntry,
  unconfirmLaborEntry,
  type LaborEntry,
  type LaborWorker,
} from "@/lib/data";

type DraftRow = {
  localId: string;
  id?: string;
  date: string;
  workerId: string;
  amWorked: boolean;
  amProjectId?: string;
  pmWorked: boolean;
  pmProjectId?: string;
  otAmount: number;
  otProjectId?: string;
  status: "draft" | "confirmed";
  reviewedAt?: string;
};

function makeEmptyDraft(date: string): DraftRow {
  return {
    localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date,
    workerId: "",
    amWorked: false,
    amProjectId: undefined,
    pmWorked: false,
    pmProjectId: undefined,
    otAmount: 0,
    otProjectId: undefined,
    status: "draft",
    reviewedAt: undefined,
  };
}

function getDraftFromEntry(row: LaborEntry): DraftRow {
  return {
    localId: row.id,
    id: row.id,
    date: row.date,
    workerId: row.workerId,
    amWorked: row.amWorked,
    amProjectId: row.amProjectId,
    pmWorked: row.pmWorked,
    pmProjectId: row.pmProjectId,
    otAmount: row.otAmount,
    otProjectId: row.otProjectId,
    status: row.status,
    reviewedAt: row.reviewedAt,
  };
}

export default function LaborPage() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [workers] = React.useState<LaborWorker[]>(() => getLaborWorkers());
  const projects = getProjects();
  const workerById = React.useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const [drafts, setDrafts] = React.useState<DraftRow[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [highlightedRowId, setHighlightedRowId] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    const rows = getLaborEntriesByDate(date);
    setDrafts(rows.length ? [...rows.map(getDraftFromEntry), makeEmptyDraft(date)] : [makeEmptyDraft(date)]);
  }, [date]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextDate = params.get("date");
    const nextRow = params.get("row");
    if (nextDate) setDate(nextDate);
    setHighlightedRowId(nextRow);
  }, []);

  const updateDraft = (localId: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  const validate = (row: DraftRow): string | null => {
    if (!row.workerId) return "Worker is required.";
    if (row.amWorked && !row.amProjectId) return "AM Project is required when AM Worked is checked.";
    if (row.pmWorked && !row.pmProjectId) return "PM Project is required when PM Worked is checked.";
    if (row.otAmount > 0 && !row.otProjectId) return "OT Project is required when OT Amount is greater than 0.";
    return null;
  };

  const handleSave = (row: DraftRow) => {
    const error = validate(row);
    if (error) {
      setMessage(error);
      return;
    }
    if (!row.workerId && !row.amWorked && !row.pmWorked && row.otAmount <= 0) {
      setMessage("Nothing to save.");
      return;
    }
    upsertLaborEntry({
      id: row.id ?? "",
      date: row.date,
      workerId: row.workerId,
      amWorked: row.amWorked,
      amProjectId: row.amProjectId,
      pmWorked: row.pmWorked,
      pmProjectId: row.pmProjectId,
      otAmount: Number.isFinite(row.otAmount) ? Math.max(0, row.otAmount) : 0,
      otProjectId: row.otProjectId,
      status: row.status ?? "draft",
    });
    setMessage("Entry saved as draft.");
    refresh();
  };

  const handleClear = (row: DraftRow) => {
    if (row.id) clearLaborEntry(row.id);
    setMessage("Row cleared.");
    setDrafts((prev) => prev.map((r) => (r.localId === row.localId ? makeEmptyDraft(date) : r)));
  };

  const handleConfirmToggle = (row: DraftRow) => {
    if (!row.id) {
      setMessage("Save the row before confirming.");
      return;
    }
    if (row.status === "confirmed") {
      const updated = unconfirmLaborEntry(row.id);
      if (!updated) {
        setMessage("Unable to unconfirm row.");
        return;
      }
      setMessage("Row set back to draft.");
    } else {
      const error = validate(row);
      if (error) {
        setMessage(error);
        return;
      }
      const updated = confirmLaborEntry(row.id);
      if (!updated) {
        setMessage("Unable to confirm row. Complete checklist in Labor Review.");
        return;
      }
      setMessage("Row confirmed.");
    }
    refresh();
  };

  const handleAddRow = () => {
    setDrafts((prev) => [...prev, makeEmptyDraft(date)]);
  };

  const handleLoadAcceptanceExample = () => {
    const worker = workers[0];
    const pA = projects[0];
    const pB = projects[1];
    const pC = projects[2];
    if (!worker || !pA || !pB || !pC) {
      setMessage("Need at least 1 worker and 3 projects for acceptance example.");
      return;
    }
    setDrafts((prev) => {
      const idx = prev.findIndex((r) => !r.id);
      const next = [...prev];
      const target = idx >= 0 ? next[idx] : makeEmptyDraft(date);
      const filled: DraftRow = {
        ...target,
        workerId: worker.id,
        amWorked: true,
        amProjectId: pA.id,
        pmWorked: true,
        pmProjectId: pB.id,
        otAmount: 300,
        otProjectId: pC.id,
        status: "draft",
      };
      if (idx >= 0) next[idx] = filled;
      else next.push(filled);
      return next;
    });
    setMessage(`Acceptance example loaded (${worker.name}: ${pA.name} + ${pB.name} + ${pC.name}).`);
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Labor" description="Shift-based labor entry. AM/PM fixed half-day rate, OT manual amount." />

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[180px] rounded-lg" />
        <Button variant="outline" className="rounded-lg h-9" onClick={handleAddRow}>
          + Add Row
        </Button>
        <Button variant="outline" className="rounded-lg h-9" onClick={handleLoadAcceptanceExample}>
          Load Acceptance Example
        </Button>
      </div>
      {message ? (
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Worker</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">AM Project</th>
                <th className="text-center py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">AM ✔</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">PM Project</th>
                <th className="text-center py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">PM ✔</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">OT Project</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">OT Amount</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Total</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => {
                const worker = d.workerId ? workerById.get(d.workerId) : undefined;
                const halfDayRate = worker?.halfDayRate ?? 0;
                const amAmount = d.amWorked ? halfDayRate : 0;
                const pmAmount = d.pmWorked ? halfDayRate : 0;
                const otAmount = Number.isFinite(d.otAmount) ? Math.max(0, d.otAmount) : 0;
                const totalAmount = amAmount + pmAmount + otAmount;
                return (
                  <tr
                    key={d.localId}
                    className={
                      d.id && highlightedRowId === d.id
                        ? "border-b border-zinc-100/50 dark:border-border/30 bg-amber-50/70 dark:bg-amber-900/10"
                        : "border-b border-zinc-100/50 dark:border-border/30"
                    }
                  >
                    <td className="py-3 px-4">
                      <select
                        value={d.workerId}
                        onChange={(e) => updateDraft(d.localId, { workerId: e.target.value })}
                        className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm min-w-[170px]"
                      >
                        <option value="">Select worker</option>
                        {workers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Half-day: {worker ? `$${worker.halfDayRate.toLocaleString()}` : "—"}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={d.amProjectId ?? ""}
                        onChange={(e) => updateDraft(d.localId, { amProjectId: e.target.value || undefined })}
                        className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm min-w-[160px]"
                      >
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input type="checkbox" checked={d.amWorked} onChange={(e) => updateDraft(d.localId, { amWorked: e.target.checked })} />
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={d.pmProjectId ?? ""}
                        onChange={(e) => updateDraft(d.localId, { pmProjectId: e.target.value || undefined })}
                        className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm min-w-[160px]"
                      >
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input type="checkbox" checked={d.pmWorked} onChange={(e) => updateDraft(d.localId, { pmWorked: e.target.checked })} />
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={d.otProjectId ?? ""}
                        onChange={(e) => updateDraft(d.localId, { otProjectId: e.target.value || undefined })}
                        className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm min-w-[160px]"
                      >
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={d.otAmount}
                        onChange={(e) => updateDraft(d.localId, { otAmount: Number(e.target.value) || 0 })}
                        className="rounded-lg tabular-nums text-right max-w-[120px] ml-auto"
                      />
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-foreground">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          d.status === "confirmed"
                            ? "inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }
                      >
                        {d.status === "confirmed" ? "Confirmed" : "Draft"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" className="rounded-lg h-8" onClick={() => handleSave(d)}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => handleConfirmToggle(d)}>
                          {d.status === "confirmed" ? "Unconfirm" : "Confirm"}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => handleClear(d)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

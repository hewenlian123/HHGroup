"use client";

import * as React from "react";
import Link from "next/link";
import {
  PageLayout,
  PageHeader,
  Divider,
  SectionHeader,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProjects,
  getWorkers,
  getDailyLaborEntriesByDate,
  insertDailyLaborEntries,
  updateDailyLaborEntry,
  deleteDailyLaborEntry,
  type DailyLaborEntryDraft,
  type DailyLaborEntryOldForReallocate,
} from "@/lib/data";

type DraftRow = DailyLaborEntryDraft & { localId: string };

const COST_CODES = [
  { value: "", label: "—" },
  { value: "01", label: "01 - Labor" },
  { value: "02", label: "02 - Material" },
  { value: "03", label: "03 - Subcontract" },
];

function isSavedEntryId(localId: string): boolean {
  return !localId.startsWith("draft-");
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DailyLaborLogPage() {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [workDate, setWorkDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [initialValuesByEntryId, setInitialValuesByEntryId] = React.useState<Record<string, DailyLaborEntryOldForReallocate>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const hourlyRateByWorkerId = React.useMemo(
    () => new Map(workers.map((w) => [w.id, (w.halfDayRate ?? 0) / 4])),
    [workers]
  );

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [w, p, entries] = await Promise.all([
        getWorkers(),
        getProjects(),
        getDailyLaborEntriesByDate(workDate),
      ]);
      setWorkers(w);
      setProjects(p);
      if (entries.length > 0) {
        const initial: Record<string, DailyLaborEntryOldForReallocate> = {};
        entries.forEach((e) => {
          initial[e.id] = {
            project_id: e.project_id,
            hours: e.hours,
            cost_code: e.cost_code,
            notes: e.notes,
          };
        });
        setInitialValuesByEntryId(initial);
        setRows(
          entries.map((e) => ({
            localId: e.id,
            worker_id: e.worker_id,
            project_id: e.project_id,
            hours: e.hours,
            cost_code: e.cost_code,
            notes: e.notes,
          }))
        );
      } else {
        setInitialValuesByEntryId({});
        setRows([makeEmptyRow()]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
      setRows([makeEmptyRow()]);
    }
  }, [workDate]);

  React.useEffect(() => {
    load();
  }, [load]);

  function makeEmptyRow(): DraftRow {
    return {
      localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      worker_id: "",
      project_id: null,
      hours: 0,
      cost_code: "",
      notes: "",
    };
  }

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow()]);

  const updateRow = (localId: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const removeRow = (localId: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.localId !== localId)));
  };

  const handleRemoveRow = async (localId: string) => {
    if (rows.length <= 1) return;
    if (!isSavedEntryId(localId)) {
      removeRow(localId);
      return;
    }
    if (!window.confirm("Delete this entry?")) return;
    setError(null);
    try {
      await deleteDailyLaborEntry(localId);
      setInitialValuesByEntryId((prev) => {
        const next = { ...prev };
        delete next[localId];
        return next;
      });
      removeRow(localId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete entry.");
    }
  };

  const toDrafts = (): DailyLaborEntryDraft[] => {
    return rows
      .filter((r) => r.worker_id)
      .map((r) => ({
        worker_id: r.worker_id,
        project_id: r.project_id,
        hours: Number(r.hours) || 0,
        cost_code: r.cost_code?.trim() || null,
        notes: r.notes?.trim() || null,
      }));
  };

  const handleSave = async () => {
    const withWorker = rows.filter((r) => r.worker_id);
    if (withWorker.length === 0) {
      setMessage("Select at least one worker.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const toUpdate = withWorker.filter((r) => isSavedEntryId(r.localId));
      const toInsert = withWorker.filter((r) => !isSavedEntryId(r.localId));
      const defaultOld: DailyLaborEntryOldForReallocate = { project_id: null, hours: 0, cost_code: null, notes: null };
      for (const row of toUpdate) {
        await updateDailyLaborEntry(row.localId, initialValuesByEntryId[row.localId] ?? defaultOld, {
          worker_id: row.worker_id,
          project_id: row.project_id,
          hours: Number(row.hours) || 0,
          cost_code: row.cost_code?.trim() || null,
          notes: row.notes?.trim() || null,
        });
      }
      if (toInsert.length > 0) {
        await insertDailyLaborEntries(workDate, toInsert.map((r) => ({
          worker_id: r.worker_id,
          project_id: r.project_id,
          hours: Number(r.hours) || 0,
          cost_code: r.cost_code?.trim() || null,
          notes: r.notes?.trim() || null,
        })));
      }
      setMessage(`Saved ${toUpdate.length + toInsert.length} entr${toUpdate.length + toInsert.length === 1 ? "y" : "ies"}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout
      header={
        <PageHeader
          title="Daily Labor Log"
          description="Record worker attendance and cost allocation by date."
          actions={
            <Link href="/labor/entries">
              <Button variant="outline" size="sm">
                Daily Entries
              </Button>
            </Link>
          }
        />
      }
    >
      <SectionHeader
        label="Date"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              max={today}
              className="h-9 w-[152px] text-sm tabular-nums"
            />
            <Button variant="outline" size="sm" className="h-9 px-3" onClick={addRow}>
              Add row
            </Button>
            <Button
              size="sm"
              className="h-9 px-3"
              onClick={handleSave}
              disabled={saving || toDrafts().length === 0}
            >
              {saving ? "Saving…" : "Save batch"}
            </Button>
          </div>
        }
      />
      <Divider />
      {error ? (
        <p className="py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {message ? (
        <p className="py-3 text-sm text-muted-foreground">{message}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worker
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cost Code
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Hours
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Notes
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Total
              </th>
              <th className="w-12 px-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Delete
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hours = Number(r.hours) || 0;
              const hourlyRate = hourlyRateByWorkerId.get(r.worker_id) ?? 0;
              const total = hours * hourlyRate;
              return (
                <tr key={r.localId} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="py-2.5 px-4">
                    <select
                      value={r.worker_id}
                      onChange={(e) => updateRow(r.localId, { worker_id: e.target.value })}
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
                  <td className="py-2.5 px-4">
                    <select
                      value={r.cost_code ?? ""}
                      onChange={(e) => updateRow(r.localId, { cost_code: e.target.value })}
                      className="h-9 w-full min-w-[130px] rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      {COST_CODES.map((c) => (
                        <option key={c.value || "empty"} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <select
                      value={r.project_id ?? ""}
                      onChange={(e) =>
                        updateRow(r.localId, { project_id: e.target.value || null })
                      }
                      className="h-9 w-full min-w-[140px] rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">—</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">
                    <Input
                      type="number"
                      min="0"
                      step="0.25"
                      value={r.hours || ""}
                      onChange={(e) =>
                        updateRow(r.localId, { hours: parseFloat(e.target.value) || 0 })
                      }
                      className="h-9 w-28 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <Input
                      type="text"
                      value={r.notes || ""}
                      onChange={(e) =>
                        updateRow(r.localId, { notes: e.target.value })
                      }
                      className="h-9 w-full min-w-[180px] text-sm"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-medium">
                    ${fmtUsd(total)}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      onClick={() => handleRemoveRow(r.localId)}
                      disabled={rows.length <= 1}
                      aria-label="Delete row"
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border/60 bg-muted/10 font-medium">
              <td colSpan={5} className="py-3 px-4 text-right text-muted-foreground">
                Total Labor Today:
              </td>
              <td className="py-3 px-4 text-right tabular-nums">
                ${fmtUsd(
                  rows.reduce((sum, r) => {
                    const hourlyRate = hourlyRateByWorkerId.get(r.worker_id) ?? 0;
                    return sum + (Number(r.hours) || 0) * hourlyRate;
                  }, 0)
                )}
              </td>
              <td className="w-12 px-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </PageLayout>
  );
}

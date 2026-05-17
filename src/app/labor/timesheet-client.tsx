"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, DollarSign, FileEdit, Copy, Check } from "lucide-react";
import { ENSURE_LABOR_TABLES_SQL } from "./ensure-labor-tables-sql";
import { formatCurrency } from "@/lib/formatters";
import { amountClass, OS, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

type LaborEntryRow = {
  id: string;
  worker_id: string;
  project_id: string;
  work_date: string;
  hours: number | null;
  cost_code: string | null;
  notes: string | null;
};

type WorkerOption = { id: string; name: string; halfDayRate: number };
type ProjectOption = { id: string; name: string };

type DraftRow = {
  localId: string;
  id?: string;
  date: string;
  workerId: string;
  projectId: string;
  hours: number;
  costCode: string;
  notes: string;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToDraft(r: LaborEntryRow): DraftRow {
  return {
    localId: r.id,
    id: r.id,
    date: r.work_date,
    workerId: r.worker_id,
    projectId: r.project_id ?? "",
    hours: safeNumber(r.hours),
    costCode: (r.cost_code ?? "") || "",
    notes: (r.notes ?? "") || "",
  };
}

function makeEmptyDraft(date: string): DraftRow {
  return {
    localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date,
    workerId: "",
    projectId: "",
    hours: 0,
    costCode: "",
    notes: "",
  };
}

function computeTotal(row: DraftRow, halfDayRate: number): number {
  const hourlyRate = halfDayRate / 4;
  return (Number(row.hours) || 0) * hourlyRate;
}

const workerOptionsToSelect = (workers: WorkerOption[]): SearchableSelectOption[] =>
  workers.map((w) => ({ id: w.id, label: w.name }));
const projectOptionsToSelect = (projects: ProjectOption[]): SearchableSelectOption[] =>
  projects.map((p) => ({ id: p.id, label: p.name }));

export default function TimesheetClient() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [workerOptions, setWorkerOptions] = React.useState<WorkerOption[]>([]);
  const [projectOptions, setProjectOptions] = React.useState<ProjectOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [missingLaborTable, setMissingLaborTable] = React.useState(false);
  const [copySqlFeedback, setCopySqlFeedback] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const halfDayRates = React.useMemo(
    () => new Map(workerOptions.map((w) => [w.id, w.halfDayRate])),
    [workerOptions]
  );
  const workerSelectOptions = React.useMemo(
    () => workerOptionsToSelect(workerOptions),
    [workerOptions]
  );
  const projectSelectOptions = React.useMemo(
    () => projectOptionsToSelect(projectOptions),
    [projectOptions]
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissingLaborTable(false);
    try {
      const response = await fetch(`/api/labor/entries?date=${encodeURIComponent(date)}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        missingLaborTable?: boolean;
        entries?: LaborEntryRow[];
        workers?: WorkerOption[];
        projects?: ProjectOption[];
      };
      if (!response.ok) throw new Error(body.message ?? "Failed to load labor entries.");
      setMissingLaborTable(Boolean(body.missingLaborTable));
      setWorkerOptions(body.workers ?? []);
      setProjectOptions(body.projects ?? []);
      const list = body.entries ?? [];
      setRows(list.length > 0 ? list.map(rowToDraft) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load labor entries.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const updateRow = (localId: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const totalWorkers = React.useMemo(
    () => new Set(rows.filter((r) => r.workerId).map((r) => r.workerId)).size,
    [rows]
  );
  const totalLaborCost = React.useMemo(
    () =>
      rows.reduce((sum, r) => {
        const rate = halfDayRates.get(r.workerId) ?? 0;
        return sum + computeTotal(r, rate);
      }, 0),
    [rows, halfDayRates]
  );
  const entryCount = React.useMemo(
    () => rows.filter((r) => r.workerId && r.projectId && r.hours > 0).length,
    [rows]
  );

  const validateRow = (row: DraftRow): string | null => {
    if (!row.workerId) return "Worker is required.";
    if (!row.projectId) return "Project is required.";
    if (Number(row.hours) <= 0) return "Hours must be greater than 0.";
    return null;
  };

  const saveEntryRequest = async (row: DraftRow): Promise<string | null> => {
    const hourlyRate = (halfDayRates.get(row.workerId) ?? 0) / 4;
    const payload = {
      id: row.id,
      workerId: row.workerId,
      projectId: row.projectId,
      workDate: row.date,
      hours: Number(row.hours) || 0,
      costCode: row.costCode,
      notes: row.notes,
      costAmount: (Number(row.hours) || 0) * hourlyRate,
    };
    const response = await fetch("/api/labor/entries", {
      method: row.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) throw new Error(body.message ?? "Failed to save labor entry.");
    return body.id ?? null;
  };

  const saveRow = async (row: DraftRow) => {
    const err = validateRow(row);
    if (err) {
      setMessage(err);
      return;
    }
    if (!row.workerId || !row.projectId || (Number(row.hours) || 0) <= 0) {
      setMessage("Worker, project, and positive hours are required.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const insertedId = await saveEntryRequest(row);
      setMessage("Entry saved.");
      if (insertedId) {
        setRows((prev) =>
          prev.map((r) =>
            r.localId === row.localId ? { ...r, id: insertedId, localId: insertedId } : r
          )
        );
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save labor entry.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRow = async (row: DraftRow) => {
    if (busy) return;
    if (row.id && !window.confirm("Delete this entry?")) return;
    if (row.id) {
      setBusy(true);
      setMessage(null);
      const prevRows = rows;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      const response = await fetch(`/api/labor/entries?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "Failed to delete labor entry.");
        setRows(prevRows);
      } else setMessage("Row deleted.");
      setBusy(false);
    } else {
      setRows((prev) => prev.filter((r) => r.localId !== row.localId));
      setMessage("Row removed.");
    }
  };

  const saveAll = async () => {
    const toSave = rows.filter((r) => r.workerId && r.projectId && (Number(r.hours) || 0) > 0);
    for (const row of toSave) {
      const err = validateRow(row);
      if (err) {
        setMessage(err);
        return;
      }
    }
    setBusy(true);
    setMessage(null);
    try {
      for (const row of toSave) {
        const insertedId = await saveEntryRequest(row);
        if (insertedId) {
          setRows((prev) =>
            prev.map((r) =>
              r.localId === row.localId ? { ...r, id: insertedId, localId: insertedId } : r
            )
          );
        }
      }
      setMessage("All entries saved.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save labor entries.");
    } finally {
      setBusy(false);
    }
  };

  const addWorkerRow = () => {
    setRows((prev) => [...prev, makeEmptyDraft(date)]);
  };

  return (
    <div className={cn("min-h-screen", OS.workspace)}>
      <div className="page-container page-stack py-6">
        <PageHeader
          title="Timesheet Entry"
          description="Manage daily labor entries by worker and project."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="h-10 w-[160px] rounded-xl border-slate-900/[0.06] bg-white/[0.92]"
              />
              <Button
                variant="outline"
                className="h-10 rounded-xl"
                onClick={addWorkerRow}
                disabled={busy}
              >
                + Add Worker Row
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl"
                onClick={saveAll}
                disabled={busy}
              >
                Save All
              </Button>
            </div>
          }
        />

        {error ? (
          <Card className="p-4">
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          </Card>
        ) : null}

        {missingLaborTable ? (
          <Card className="rounded-xl border-2 border-amber-200 border-gray-100 bg-amber-50/50 p-6">
            <h3 className="text-base font-semibold text-amber-900">
              Table{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-sm">
                public.labor_entries
              </code>{" "}
              not found
            </h3>
            <p className="mt-2 text-sm text-amber-800">
              Create the labor tables in your Supabase project, then refresh this page.
            </p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-amber-900">
              <li>
                Open <strong>Supabase Dashboard</strong> → your project
              </li>
              <li>
                Go to <strong>SQL Editor</strong> → New query
              </li>
              <li>
                Click <strong>Copy SQL</strong> below, paste into the editor, then click{" "}
                <strong>Run</strong>
              </li>
              <li>Refresh this page</li>
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                onClick={() => {
                  void navigator.clipboard.writeText(ENSURE_LABOR_TABLES_SQL).then(() => {
                    setCopySqlFeedback(true);
                    setTimeout(() => setCopySqlFeedback(false), 2000);
                  });
                }}
              >
                {copySqlFeedback ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copySqlFeedback ? "Copied!" : "Copy SQL"}
              </Button>
            </div>
            <p className="mt-4 text-xs text-amber-700">
              The script creates <code className="rounded bg-amber-100 px-1">workers</code>,{" "}
              <code className="rounded bg-amber-100 px-1">labor_entries</code>, and{" "}
              <code className="rounded bg-amber-100 px-1">labor_payments</code> with RLS. Safe to
              run more than once.
            </p>
          </Card>
        ) : null}

        {message ? (
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-2 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Total Workers" value={String(totalWorkers)} icon={Users} />
          <KpiCard
            label="Total Labor Cost"
            value={formatCurrency(totalLaborCost)}
            icon={DollarSign}
            emphasis
          />
          <KpiCard label="Entries" value={String(entryCount)} icon={FileEdit} />
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p className="text-sm font-medium">No labor entries yet</p>
              <p className="mt-1 text-xs">Use &quot;+ Add Worker Row&quot; to create an entry.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50/90 shadow-[0_1px_0_0_rgba(15,23,42,0.06)]">
                    <tr>
                      <th className={cn("px-4 py-3 text-left", TYPO.tableHeader)}>Worker</th>
                      <th className={cn("px-4 py-3 text-left", TYPO.tableHeader)}>Project</th>
                      <th className={cn("px-4 py-3 text-right", TYPO.tableHeader)}>Hours</th>
                      <th className={cn("px-4 py-3 text-left", TYPO.tableHeader)}>Cost Code</th>
                      <th className={cn("px-4 py-3 text-left", TYPO.tableHeader)}>Notes</th>
                      <th className={cn("px-4 py-3 text-right", TYPO.tableHeader)}>
                        Half-Day Rate
                      </th>
                      <th className={cn("px-4 py-3 text-right", TYPO.tableHeader)}>Total</th>
                      <th className={cn("px-4 py-3 text-right", TYPO.tableHeader)}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const rate = halfDayRates.get(row.workerId) ?? 0;
                      const total = computeTotal(row, rate);
                      return (
                        <tr
                          key={row.localId}
                          className="border-t border-slate-900/[0.06] transition-colors hover:bg-slate-50/80 dark:border-border/60 dark:hover:bg-muted/20"
                        >
                          <td className="py-3 px-4 align-top">
                            <SearchableSelect
                              value={row.workerId}
                              options={workerSelectOptions}
                              onChange={(id) => updateRow(row.localId, { workerId: id })}
                              placeholder="Select worker"
                              aria-label="Worker"
                            />
                          </td>
                          <td className="py-3 px-4 align-top">
                            <SearchableSelect
                              value={row.projectId}
                              options={projectSelectOptions}
                              onChange={(id) => updateRow(row.localId, { projectId: id })}
                              placeholder="Select project"
                              aria-label="Project"
                            />
                          </td>
                          <td className="py-3 px-4 align-top text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.25}
                              value={row.hours || ""}
                              onChange={(e) =>
                                updateRow(row.localId, { hours: Number(e.target.value) || 0 })
                              }
                              className="h-9 w-24 rounded-lg text-right tabular-nums"
                            />
                          </td>
                          <td className="py-3 px-4 align-top">
                            <Input
                              type="text"
                              value={row.costCode || ""}
                              onChange={(e) => updateRow(row.localId, { costCode: e.target.value })}
                              placeholder="Cost code"
                              className="h-9 max-w-[100px] rounded-lg"
                            />
                          </td>
                          <td className="py-3 px-4 align-top">
                            <Input
                              type="text"
                              value={row.notes || ""}
                              onChange={(e) => updateRow(row.localId, { notes: e.target.value })}
                              placeholder="Notes"
                              className="h-9 min-w-[120px] rounded-lg"
                            />
                          </td>
                          <td className={cn("px-4 py-3 text-right align-top", TYPO.amount)}>
                            {row.workerId ? formatCurrency(rate) : "—"}
                          </td>
                          <td className={cn("px-4 py-3 text-right align-top", amountClass())}>
                            {formatCurrency(total)}
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg"
                                onClick={() => saveRow(row)}
                                disabled={busy}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                onClick={() => deleteRow(row)}
                                disabled={busy}
                              >
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

              <div className="md:hidden border-t border-gray-100 p-4">
                <p className="text-xs text-muted-foreground">
                  Scroll horizontally to see all columns, or use desktop for full table.
                </p>
              </div>
            </>
          )}
        </Card>

        <div className="md:hidden space-y-4">
          <p className="text-sm font-medium text-foreground">Entries</p>
          {rows.map((row) => {
            const rate = halfDayRates.get(row.workerId) ?? 0;
            const total = computeTotal(row, rate);
            const workerName = workerOptions.find((w) => w.id === row.workerId)?.name ?? "—";
            const projName = projectOptions.find((p) => p.id === row.projectId)?.name ?? "—";
            return (
              <Card key={row.localId} className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{workerName}</span>
                  <span className="text-muted-foreground text-sm">{projName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Hours: {row.hours}</div>
                  <div>Cost code: {row.costCode || "—"}</div>
                  <div className={cn("col-span-2", amountClass())}>
                    Total: {formatCurrency(total)}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-lg"
                    onClick={() => saveRow(row)}
                    disabled={busy}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-lg text-rose-600 dark:text-rose-400"
                    onClick={() => deleteRow(row)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

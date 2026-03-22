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
import { createBrowserClient } from "@/lib/supabase";
import { Users, DollarSign, FileEdit, Copy, Check } from "lucide-react";
import { ENSURE_LABOR_TABLES_SQL } from "./ensure-labor-tables-sql";

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

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("labor_entries") &&
    (msg.includes("schema cache") || msg.includes("could not find"))
  );
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

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
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    setMissingLaborTable(false);
    const [entriesRes, workersRes, projectsRes] = await Promise.all([
      supabase
        .from("labor_entries")
        .select("id,worker_id,project_id,work_date,hours,cost_code,notes")
        .eq("work_date", date)
        .order("work_date", { ascending: true }),
      supabase.from("workers").select("id,name,half_day_rate").order("name").limit(500),
      supabase.from("projects").select("id,name").order("name").limit(500),
    ]);

    if (entriesRes.error) {
      if (isMissingTableError(entriesRes.error)) {
        setMissingLaborTable(true);
      } else {
        setError(entriesRes.error.message);
      }
    }
    if (workersRes.error && !isMissingTableError(workersRes.error))
      setError((e) => e ?? workersRes.error?.message ?? null);
    if (projectsRes.error && !isMissingTableError(projectsRes.error))
      setError((e) => e ?? projectsRes.error?.message ?? null);

    const workerOpts: WorkerOption[] = (workersRes.data ?? []).map((w) => {
      const row = w as { id: string; name: string; half_day_rate?: number | null };
      return { id: row.id, name: row.name ?? "", halfDayRate: safeNumber(row.half_day_rate) };
    });
    const projOpts: ProjectOption[] = (projectsRes.data ?? []).map((p) => ({
      id: (p as { id: string }).id,
      name: (p as { name: string }).name ?? "",
    }));
    setWorkerOptions(workerOpts);
    setProjectOptions(projOpts);

    const list = (entriesRes.data ?? []) as LaborEntryRow[];
    const drafts = list.length > 0 ? list.map(rowToDraft) : [];
    setRows(drafts);
    setLoading(false);
  }, [date, configured, supabase]);

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
    if (!supabase || busy) return;
    setBusy(true);
    setMessage(null);
    const hourlyRate = (halfDayRates.get(row.workerId) ?? 0) / 4;
    const payload = {
      worker_id: row.workerId,
      project_id: row.projectId,
      work_date: row.date,
      hours: Number(row.hours) || 0,
      cost_code: row.costCode?.trim() || null,
      notes: row.notes?.trim() || null,
      cost_amount: (Number(row.hours) || 0) * hourlyRate,
    };
    if (row.id) {
      const { error: updErr } = await supabase
        .from("labor_entries")
        .update(payload)
        .eq("id", row.id);
      if (updErr) setError(updErr.message);
      else setMessage("Entry saved.");
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("labor_entries")
        .insert(payload)
        .select("id")
        .single();
      if (insErr) setError(insErr.message);
      else {
        setMessage("Entry saved.");
        if (inserted?.id)
          setRows((prev) =>
            prev.map((r) =>
              r.localId === row.localId ? { ...r, id: inserted.id, localId: inserted.id } : r
            )
          );
      }
    }
    await refresh();
    setBusy(false);
  };

  const deleteRow = async (row: DraftRow) => {
    if (!supabase || busy) return;
    if (row.id && !window.confirm("Delete this entry?")) return;
    if (row.id) {
      setBusy(true);
      setMessage(null);
      const prevRows = rows;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      const { error: delErr } = await supabase.from("labor_entries").delete().eq("id", row.id);
      if (delErr) {
        setError(delErr.message);
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
    for (const row of toSave) {
      const hourlyRate = (halfDayRates.get(row.workerId) ?? 0) / 4;
      const payload = {
        worker_id: row.workerId,
        project_id: row.projectId,
        work_date: row.date,
        hours: Number(row.hours) || 0,
        cost_code: row.costCode?.trim() || null,
        notes: row.notes?.trim() || null,
        cost_amount: (Number(row.hours) || 0) * hourlyRate,
      };
      if (row.id && supabase) {
        await supabase.from("labor_entries").update(payload).eq("id", row.id);
      } else if (supabase) {
        const { data: inserted } = await supabase
          .from("labor_entries")
          .insert(payload)
          .select("id")
          .single();
        if (inserted?.id)
          setRows((prev) =>
            prev.map((r) =>
              r.localId === row.localId ? { ...r, id: inserted.id, localId: inserted.id } : r
            )
          );
        await refresh();
      }
    }
    setMessage("All entries saved.");
    await refresh();
    setBusy(false);
  };

  const addWorkerRow = () => {
    setRows((prev) => [...prev, makeEmptyDraft(date)]);
  };

  if (!configured) {
    return (
      <div className="page-container page-stack py-6">
        <PageHeader
          title="Timesheet Entry"
          description="Manage daily labor entries by worker and project."
        />
        <Card className="rounded-xl border border-[#E5E7EB] bg-white p-6">
          <p className="text-sm text-muted-foreground">
            Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
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
                className="h-10 w-[160px] rounded-xl border-[#E5E7EB] bg-white"
              />
              <Button
                variant="outline"
                className="h-10 rounded-xl border-[#E5E7EB]"
                onClick={addWorkerRow}
                disabled={busy}
              >
                + Add Worker Row
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl border-[#E5E7EB]"
                onClick={saveAll}
                disabled={busy}
              >
                Save All
              </Button>
            </div>
          }
        />

        {error ? (
          <Card className="rounded-xl border border-[#E5E7EB] p-4">
            <p className="text-sm text-red-600">{error}</p>
          </Card>
        ) : null}

        {missingLaborTable ? (
          <Card className="rounded-xl border-2 border-amber-200 border-[#E5E7EB] bg-amber-50/50 p-6">
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
          <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Total Workers" value={String(totalWorkers)} icon={Users} />
          <KpiCard
            label="Total Labor Cost"
            value={new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(totalLaborCost)}
            icon={DollarSign}
            emphasis
          />
          <KpiCard label="Entries" value={String(entryCount)} icon={FileEdit} />
        </div>

        <Card className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
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
                  <thead className="sticky top-0 z-10 bg-[#F8FAFC] shadow-[0_1px_0_0_#E5E7EB]">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Worker
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Project
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Hours
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Cost Code
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Notes
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Half-Day Rate
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Total
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const rate = halfDayRates.get(row.workerId) ?? 0;
                      const total = computeTotal(row, rate);
                      return (
                        <tr
                          key={row.localId}
                          className="border-t border-[#E5E7EB] transition-colors hover:bg-[#F8FAFC]/80"
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
                          <td className="py-3 px-4 align-top text-right text-muted-foreground tabular-nums">
                            {row.workerId ? `$${rate.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-3 px-4 align-top text-right tabular-nums font-semibold">
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                              maximumFractionDigits: 2,
                            }).format(total)}
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
                                className="h-8 rounded-lg text-red-600 hover:bg-red-50"
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

              <div className="md:hidden border-t border-[#E5E7EB] p-4">
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
              <Card key={row.localId} className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{workerName}</span>
                  <span className="text-muted-foreground text-sm">{projName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Hours: {row.hours}</div>
                  <div>Cost code: {row.costCode || "—"}</div>
                  <div className="font-semibold tabular-nums col-span-2">
                    Total:{" "}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 2,
                    }).format(total)}
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
                    className="flex-1 rounded-lg text-red-600"
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

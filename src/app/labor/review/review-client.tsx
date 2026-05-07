"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/formatters";

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

type LaborEntry = {
  id: string;
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

function isMissingTableError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

function rowToEntry(r: LaborEntryRow): LaborEntry {
  return {
    id: r.id,
    date: r.work_date,
    workerId: r.worker_id,
    projectId: r.project_id ?? "",
    hours: safeNumber(r.hours),
    costCode: (r.cost_code ?? "") || "",
    notes: (r.notes ?? "") || "",
  };
}

export default function LaborReviewClient() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<LaborEntry[]>([]);
  const [workerOptions, setWorkerOptions] = React.useState<WorkerOption[]>([]);
  const [projectOptions, setProjectOptions] = React.useState<ProjectOption[]>([]);
  const [selected, setSelected] = React.useState<LaborEntry | null>(null);
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
  const workers = React.useMemo(
    () => new Map(workerOptions.map((w) => [w.id, w.name])),
    [workerOptions]
  );
  const projects = React.useMemo(
    () => new Map(projectOptions.map((p) => [p.id, p.name])),
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

    const [entriesRes, workersRes, projectsRes] = await Promise.all([
      supabase
        .from("labor_entries")
        .select("id,worker_id,project_id,work_date,hours,cost_code,notes")
        .order("work_date", { ascending: false })
        .limit(500),
      supabase
        .from("workers")
        .select("id,name,half_day_rate")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("projects")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (entriesRes.error) {
      if (!isMissingTableError(entriesRes.error)) setError(entriesRes.error.message);
      setRows([]);
    } else {
      const list = (entriesRes.data ?? []) as LaborEntryRow[];
      const workerOpts: WorkerOption[] = (workersRes.data ?? []).map((w) => {
        const row = w as { id: string; name: string; half_day_rate?: number | null };
        return { id: row.id, name: row.name ?? "", halfDayRate: safeNumber(row.half_day_rate) };
      });
      setWorkerOptions(workerOpts);
      const projOpts = (projectsRes.data ?? []) as ProjectOption[];
      setProjectOptions(projOpts);
      setRows(list.map(rowToEntry));
    }
    if (workersRes.error && !isMissingTableError(workersRes.error))
      setError((e) => e ?? workersRes.error?.message ?? null);
    if (projectsRes.error && !isMissingTableError(projectsRes.error))
      setError((e) => e ?? projectsRes.error?.message ?? null);
    setLoading(false);
  }, [configured, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (row.date !== date) return false;
      if (workerFilter && row.workerId !== workerFilter) return false;
      if (projectFilter && row.projectId !== projectFilter) return false;
      return true;
    });
  }, [rows, date, workerFilter, projectFilter]);

  const getHalfDayRate = (workerId: string): number => halfDayRates.get(workerId) ?? 0;

  const computeTotal = (row: LaborEntry): number => {
    const rate = getHalfDayRate(row.workerId) / 4;
    return (row.hours ?? 0) * rate;
  };

  const handleDelete = async (row: LaborEntry) => {
    if (!supabase || busy) return;
    if (!window.confirm("Delete this entry?")) return;
    setBusy(true);
    setError(null);
    if (selected?.id === row.id) setSelected(null);
    const prevRows = rows;
    setRows((r) => r.filter((e) => e.id !== row.id));
    const { error: delErr } = await supabase.from("labor_entries").delete().eq("id", row.id);
    if (delErr) {
      setError(delErr.message);
      setRows(prevRows);
    } else setMessage("Entry deleted.");
    setBusy(false);
  };

  const handleSaveSelected = async () => {
    if (!selected || !supabase || busy) return;
    setBusy(true);
    setError(null);
    const hourlyRate = getHalfDayRate(selected.workerId) / 4;
    const payload = {
      worker_id: selected.workerId,
      project_id: selected.projectId,
      work_date: selected.date,
      hours: selected.hours,
      cost_code: selected.costCode || null,
      notes: selected.notes || null,
      cost_amount: (selected.hours ?? 0) * hourlyRate,
    };
    const { error: upsertErr } = await supabase
      .from("labor_entries")
      .upsert({ id: selected.id, ...payload }, { onConflict: "id" });
    if (upsertErr) setError(upsertErr.message);
    else {
      setMessage("Changes saved.");
    }
    await refresh();
    setBusy(false);
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Labor Review"
        description="Review labor drafts and confirm entries for project actual labor."
      />

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
        />
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm"
        >
          <option value="">All workers</option>
          {workerOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm"
        >
          <option value="">All projects</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {message ? (
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <Card className="overflow-hidden">
          <div className="table-responsive">
            <table className="w-full min-w-[560px] text-sm md:min-w-0">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Worker
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Project
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Hours
                  </th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Cost Code
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Total
                  </th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7}>
                        <Skeleton className="h-12 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="py-8 px-4 text-center text-muted-foreground" colSpan={7}>
                      No data yet.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100/50 dark:border-border/30">
                      <td className="py-3 px-4 font-mono tabular-nums tracking-tight text-zinc-500">
                        {formatDate(row.date)}
                      </td>
                      <td className="py-3 px-4">{workers.get(row.workerId) ?? "—"}</td>
                      <td className="py-3 px-4">
                        {row.projectId ? (projects.get(row.projectId) ?? "—") : "—"}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">{row.hours ?? 0}</td>
                      <td className="py-3 px-4">{row.costCode ?? "—"}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums tracking-tight text-zinc-950">
                        {formatCurrency(computeTotal(row))}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setSelected({ ...row })}
                            disabled={busy}
                          >
                            Review
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => handleDelete(row)}
                            disabled={busy}
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
        </Card>

        <Card className="p-5">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select an entry and click Review.</p>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Review Drawer</h3>
              <div className="grid gap-3">
                <label className="text-xs font-medium text-muted-foreground">Project</label>
                <select
                  value={selected.projectId ?? ""}
                  onChange={(e) =>
                    setSelected((prev) => (prev ? { ...prev, projectId: e.target.value } : prev))
                  }
                  className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm"
                >
                  <option value="">Select project</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="text-xs font-medium text-muted-foreground">Hours</label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={selected.hours ?? ""}
                  onChange={(e) =>
                    setSelected((prev) =>
                      prev ? { ...prev, hours: Number(e.target.value) || 0 } : prev
                    )
                  }
                  className="text-right tabular-nums"
                />
                <label className="text-xs font-medium text-muted-foreground">Cost Code</label>
                <Input
                  type="text"
                  value={selected.costCode ?? ""}
                  onChange={(e) =>
                    setSelected((prev) => (prev ? { ...prev, costCode: e.target.value } : prev))
                  }
                  placeholder="Cost code"
                />
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Input
                  type="text"
                  value={selected.notes ?? ""}
                  onChange={(e) =>
                    setSelected((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  placeholder="Notes"
                />
                <p className="text-sm">
                  Total:{" "}
                  <span className="font-semibold tabular-nums tracking-tight text-zinc-950">
                    {formatCurrency(computeTotal(selected))}
                  </span>
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelected(null)}
                  disabled={busy}
                  className="min-h-[44px] sm:min-h-0"
                >
                  Close
                </Button>
                <Button
                  onClick={handleSaveSelected}
                  disabled={busy}
                  className="min-h-[44px] sm:min-h-0"
                >
                  <SubmitSpinner loading={busy} className="mr-2" />
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

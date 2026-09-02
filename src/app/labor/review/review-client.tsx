"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NeoMobileCard } from "@/components/base";
import {
  MobileFabPlus,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { formatCurrency, formatDate } from "@/lib/formatters";
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
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/labor/entries", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        entries?: LaborEntryRow[];
        workers?: WorkerOption[];
        projects?: ProjectOption[];
      };
      if (!response.ok) throw new Error(body.message ?? "Failed to load labor entries.");
      setWorkerOptions(body.workers ?? []);
      setProjectOptions(body.projects ?? []);
      setRows((body.entries ?? []).map(rowToEntry));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load labor entries.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (busy) return;
    if (!window.confirm("Delete this entry?")) return;
    setBusy(true);
    setError(null);
    if (selected?.id === row.id) setSelected(null);
    const prevRows = rows;
    setRows((r) => r.filter((e) => e.id !== row.id));
    const response = await fetch(`/api/labor/entries?id=${encodeURIComponent(row.id)}`, {
      method: "DELETE",
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setError(body.message ?? "Failed to delete labor entry.");
      setRows(prevRows);
    } else setMessage("Entry deleted.");
    setBusy(false);
  };

  const handleSaveSelected = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const hourlyRate = getHalfDayRate(selected.workerId) / 4;
    const response = await fetch("/api/labor/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        workerId: selected.workerId,
        projectId: selected.projectId,
        workDate: selected.date,
        hours: selected.hours,
        costCode: selected.costCode,
        notes: selected.notes,
        costAmount: (selected.hours ?? 0) * hourlyRate,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) setError(body.message ?? "Failed to save labor entry.");
    else {
      setMessage("Changes saved.");
    }
    await refresh();
    setBusy(false);
  };

  return (
    <div className="min-w-0 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[var(--hh-text-secondary)]">
      <div
        data-testid="labor-review-workspace"
        className={cn(
          "page-shell-wide mx-auto flex w-full max-w-[430px] flex-col gap-2 px-4 py-2 pb-4 sm:max-w-[460px] md:gap-3 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-[var(--hh-border)] pb-3 [&_p]:mt-1"
            title="Labor Review"
            subtitle="Review labor drafts and confirm entries for project actual labor."
          />
        </div>
        <MobileListHeader
          title="Labor Review"
          fab={<MobileFabPlus href="/labor" ariaLabel="Labor home" />}
        />

        {error ? (
          <Card
            role="alert"
            className="border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] p-3 shadow-none"
          >
            <p className="text-sm text-[var(--hh-danger)]">{error}</p>
          </Card>
        ) : null}

        <div
          role="region"
          aria-label="Labor review filters"
          className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 shadow-operational"
        >
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              aria-label="Labor review date"
              className="h-11 min-h-[44px] lg:h-10 lg:min-h-10"
            />
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              aria-label="Labor review worker"
              className="h-11 min-h-[44px] rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] lg:h-10 lg:min-h-10"
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
              aria-label="Labor review project"
              className="h-11 min-h-[44px] rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] lg:h-10 lg:min-h-10"
            >
              <option value="">All projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {message ? (
          <div className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-2 text-sm text-[var(--hh-text-secondary)]">
            {message}
          </div>
        ) : null}

        <div className="md:hidden">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <NeoMobileCard key={i} className="space-y-3 p-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-11 w-full" />
                </NeoMobileCard>
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <NeoMobileCard className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-[var(--hh-text-primary)]">
                No labor entries found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Adjust the date or filters to review a labor entry.
              </p>
            </NeoMobileCard>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredRows.map((row) => (
                <NeoMobileCard
                  key={row.id}
                  data-testid="labor-review-stacked-record"
                  className="space-y-3 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-hh-table-cell font-medium leading-snug text-[var(--hh-text-primary)]">
                        {workers.get(row.workerId) ?? "—"}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {row.projectId ? (projects.get(row.projectId) ?? "—") : "—"}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-hh-financial-total font-semibold tabular-nums text-[var(--hh-text-primary)]">
                      {formatCurrency(computeTotal(row))}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Date
                      </dt>
                      <dd className="pt-0.5 text-sm text-[var(--hh-text-primary)]">
                        {formatDate(row.date)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Hours
                      </dt>
                      <dd className="pt-0.5 text-sm tabular-nums text-[var(--hh-text-primary)]">
                        {row.hours ?? 0}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Cost code
                      </dt>
                      <dd className="truncate pt-0.5 text-sm text-[var(--hh-text-primary)]">
                        {row.costCode || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Total
                      </dt>
                      <dd className="pt-0.5 text-sm font-semibold tabular-nums text-[var(--hh-text-primary)]">
                        {formatCurrency(computeTotal(row))}
                      </dd>
                    </div>
                  </dl>
                  <div className="grid grid-cols-2 gap-2 border-t border-[var(--hh-border)] pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 min-h-[44px]"
                      onClick={() => setSelected({ ...row })}
                      disabled={busy}
                    >
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 min-h-[44px]"
                      onClick={() => handleDelete(row)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  </div>
                </NeoMobileCard>
              ))}
            </div>
          )}
        </div>

        <div className="hidden gap-4 md:grid lg:grid-cols-[minmax(0,1fr)_440px]">
          <Card data-testid="labor-review-dense-table" className="overflow-hidden">
            <div className="table-responsive">
              <table className="w-full min-w-[560px] text-sm md:min-w-0">
                <thead>
                  <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)]">
                    <th className="px-4 py-3 text-left text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                      Worker
                    </th>
                    <th className="px-4 py-3 text-left text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                      Project
                    </th>
                    <th className="px-4 py-3 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                      Hours
                    </th>
                    <th className="px-4 py-3 text-left text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                      Cost Code
                    </th>
                    <th className="px-4 py-3 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                      Total
                    </th>
                    <th className="px-4 py-3 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
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
                      <tr
                        key={row.id}
                        className="border-b border-[var(--hh-border)] last:border-b-0 hover:bg-[var(--hh-l3-hover)] focus-within:bg-[var(--hh-l3-hover)]"
                      >
                        <td className="px-4 py-3 hh-fin tracking-normal text-[var(--hh-text-secondary)]">
                          {formatDate(row.date)}
                        </td>
                        <td className="px-4 py-3 text-[var(--hh-text-primary)]">
                          {workers.get(row.workerId) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[var(--hh-text-secondary)]">
                          {row.projectId ? (projects.get(row.projectId) ?? "—") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--hh-text-primary)]">
                          {row.hours ?? 0}
                        </td>
                        <td className="px-4 py-3 text-[var(--hh-text-secondary)]">
                          {row.costCode ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
                          {formatCurrency(computeTotal(row))}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 min-h-[44px] lg:h-8 lg:min-h-8"
                              onClick={() => setSelected({ ...row })}
                              disabled={busy}
                            >
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 min-h-[44px] lg:h-8 lg:min-h-8"
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
                    className="h-10 rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]"
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
                    <span className="font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
                      {formatCurrency(computeTotal(selected))}
                    </span>
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelected(null)}
                    disabled={busy}
                    className="min-h-[44px] lg:min-h-0"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleSaveSelected}
                    disabled={busy}
                    className="min-h-[44px] lg:min-h-0"
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
    </div>
  );
}

"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  clearLaborEntry,
  getLaborEntries,
  getProjects,
  getWorkers,
  upsertLaborEntry,
  type LaborEntry,
} from "@/lib/data";

export default function LaborReviewPage() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [rows, setRows] = React.useState<LaborEntry[]>([]);
  const [selected, setSelected] = React.useState<LaborEntry | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [workerOptions, setWorkerOptions] = React.useState<Awaited<ReturnType<typeof getWorkers>>>(
    []
  );
  const [projectOptions, setProjectOptions] = React.useState<
    Awaited<ReturnType<typeof getProjects>>
  >([]);

  React.useEffect(() => {
    let cancelled = false;
    getWorkers().then((list) => {
      if (!cancelled) setWorkerOptions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getProjects().then((list) => {
      if (!cancelled) setProjectOptions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const workers = React.useMemo(
    () => new Map(workerOptions.map((w) => [w.id, w.name])),
    [workerOptions]
  );
  const projects = React.useMemo(
    () => new Map(projectOptions.map((p) => [p.id, p.name])),
    [projectOptions]
  );

  const refresh = React.useCallback(async () => {
    const list = await getLaborEntries();
    setRows(list);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const reloadMeta = React.useCallback(async () => {
    const [w, p] = await Promise.all([getWorkers(), getProjects()]);
    setWorkerOptions(w);
    setProjectOptions(p);
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
      void reloadMeta();
    }, [refresh, reloadMeta]),
    [refresh, reloadMeta]
  );

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (row.date !== date) return false;
      if (workerFilter && row.workerId !== workerFilter) return false;
      if (projectFilter && row.projectId !== projectFilter) return false;
      return true;
    });
  }, [rows, date, workerFilter, projectFilter]);

  const getHalfDayRate = (workerId: string): number => {
    return workerOptions.find((w) => w.id === workerId)?.halfDayRate ?? 0;
  };

  const computeTotal = (row: LaborEntry): number => {
    const halfDayRate = getHalfDayRate(row.workerId);
    const hourlyRate = halfDayRate / 4;
    return (Number(row.hours) || 0) * hourlyRate;
  };

  const handleDelete = async (row: LaborEntry) => {
    await clearLaborEntry(row.id);
    if (selected?.id === row.id) setSelected(null);
    setMessage("Entry deleted.");
    await refresh();
  };

  const handleSaveSelected = async () => {
    if (!selected) return;
    const saved = await upsertLaborEntry({
      id: selected.id,
      date: selected.date,
      workerId: selected.workerId,
      projectId: selected.projectId ?? "",
      hours: Number(selected.hours) || 0,
      costCode: selected.costCode ?? "",
      notes: selected.notes ?? "",
    });
    setSelected(saved);
    setMessage("Changes saved.");
    await refresh();
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Labor Review"
        description="Review labor drafts and confirm entries for project actual labor."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="rounded-sm"
        />
        <Select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)}>
          <option value="">All workers</option>
          {workerOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {message ? (
        <p className="border-b border-[#E5E7EB] pb-3 text-sm text-muted-foreground dark:border-border">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div className="overflow-hidden rounded-sm border border-[#E5E7EB] dark:border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-white dark:border-border/60 dark:bg-muted/30">
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
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#E5E7EB]/80 transition-colors hover:bg-[#F9FAFB] dark:border-border/40 dark:hover:bg-muted/20"
                  >
                    <td className="py-3 px-4 tabular-nums">{row.date}</td>
                    <td className="py-3 px-4">{workers.get(row.workerId) ?? "Unknown worker"}</td>
                    <td className="py-3 px-4">
                      {row.projectId ? (projects.get(row.projectId) ?? row.projectId) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">{Number(row.hours) || 0}</td>
                    <td className="py-3 px-4">{row.costCode ?? "—"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 2,
                      }).format(computeTotal(row))}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-sm"
                          onClick={() => setSelected({ ...row })}
                        >
                          Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-sm"
                          onClick={() => handleDelete(row)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="py-8 px-4 text-center text-muted-foreground" colSpan={7}>
                      No entries for current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border border-[#E5E7EB] p-5 dark:border-border">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select an entry and click Review.</p>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Review Drawer</h3>
              <div className="grid gap-3">
                <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Project
                </label>
                <Select
                  value={selected.projectId ?? ""}
                  onChange={(e) =>
                    setSelected((prev) => (prev ? { ...prev, projectId: e.target.value } : prev))
                  }
                >
                  <option value="">Select project</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Hours
                </label>
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
                  className="rounded-sm text-right tabular-nums"
                />
                <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Cost Code
                </label>
                <Input
                  type="text"
                  value={selected.costCode ?? ""}
                  onChange={(e) =>
                    setSelected((prev) => (prev ? { ...prev, costCode: e.target.value } : prev))
                  }
                  placeholder="Cost code"
                  className="rounded-sm"
                />
                <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Notes
                </label>
                <Input
                  type="text"
                  value={selected.notes ?? ""}
                  onChange={(e) =>
                    setSelected((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  placeholder="Notes"
                  className="rounded-sm"
                />
                <p className="text-sm">
                  Total:{" "}
                  <span className="font-semibold tabular-nums">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 2,
                    }).format(computeTotal(selected))}
                  </span>
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-sm"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
                <Button size="sm" className="rounded-sm" onClick={handleSaveSelected}>
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

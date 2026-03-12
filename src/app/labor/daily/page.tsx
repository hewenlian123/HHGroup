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
  insertDailyLaborEntries,
  getLaborEntriesByProjectAndDate,
  getLaborEntriesWithJoins,
} from "@/lib/data";
import type { LaborEntryWithJoins } from "@/lib/data";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DayType = "full_day" | "half_day" | "absent";

function parseDayTypeAndOt(notes: string | null): { dayType: string; otHours: string } {
  const dayType = "—";
  const otHours = "—";
  if (!notes?.trim()) return { dayType, otHours };
  const dayMatch = /day_type=(\w+)/.exec(notes);
  const otMatch = /ot_hours=([\d.]+)/.exec(notes);
  return {
    dayType: dayMatch ? (dayMatch[1] === "full_day" ? "Full Day" : dayMatch[1] === "half_day" ? "Half Day" : dayMatch[1] === "absent" ? "Absent" : dayMatch[1]) : dayType,
    otHours: otMatch ? otMatch[1] : otHours,
  };
}

export default function DailyLaborLogPage() {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [workDate, setWorkDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [dayEntries, setDayEntries] = React.useState<LaborEntryWithJoins[]>([]);
  const [entriesLoading, setEntriesLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, p] = await Promise.all([getWorkers(), getProjects()]);
      setWorkers(w);
      setProjects(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntries = React.useCallback(async () => {
    setEntriesLoading(true);
    try {
      const list = await getLaborEntriesWithJoins({
        date_from: workDate,
        date_to: workDate,
      });
      setDayEntries(list);
    } catch {
      setDayEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, [workDate]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const handleSaved = React.useCallback((count: number) => {
    setMessage(`Saved ${count} entr${count === 1 ? "y" : "ies"}.`);
    setError(null);
    void loadEntries();
  }, [loadEntries]);

  return (
    <PageLayout
      header={
        <PageHeader
          title="Daily Labor Log"
          description="Record worker attendance and daily pay by date."
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
        label="Daily entry"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              max={today}
              className="h-9 w-[152px] text-sm tabular-nums"
            />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-9 min-w-[200px] rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              className="rounded-xl bg-black text-white px-4 py-2 hover:bg-black/90"
              onClick={() => setModalOpen(true)}
              disabled={loading || workers.length === 0 || projects.length === 0}
            >
              + Add Entry
            </Button>
          </div>
        }
      />
      <Divider />
      {error ? (
        <p className="py-3 text-sm text-red-600">{error}</p>
      ) : null}
      {message ? (
        <p className="py-3 text-sm text-gray-500">{message}</p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Entries for {workDate}
        </p>
        {entriesLoading ? (
          <p className="py-4 text-sm text-gray-500">Loading…</p>
        ) : dayEntries.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">No entries for this date. Use &quot;+ Add Entry&quot; to add workers.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-gray-50">
                  <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Worker</th>
                  <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Project</th>
                  <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Day Type</th>
                  <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500 tabular-nums">OT</th>
                  <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500 tabular-nums">Total Pay</th>
                </tr>
              </thead>
              <tbody>
                {dayEntries.map((e) => {
                  const { dayType, otHours } = parseDayTypeAndOt(e.notes);
                  const pay = e.cost_amount != null ? Number(e.cost_amount) : 0;
                  return (
                    <tr key={e.id} className="border-b border-[#E5E7EB] last:border-b-0">
                      <td className="py-2 px-3 font-medium text-[#111111]">{e.worker_name ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{e.project_name ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{dayType}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{otHours}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">${pay.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QuickTimesheetModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        workDate={workDate}
        defaultProjectId={projectFilter}
        workers={workers}
        projects={projects}
        onSaved={handleSaved}
      />
    </PageLayout>
  );
}

interface QuickTimesheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workDate: string;
  defaultProjectId: string;
  workers: Awaited<ReturnType<typeof getWorkers>>;
  projects: Awaited<ReturnType<typeof getProjects>>;
  onSaved: (count: number) => void;
}

function QuickTimesheetModal({
  open,
  onOpenChange,
  workDate,
  defaultProjectId,
  workers,
  projects,
  onSaved,
}: QuickTimesheetModalProps) {
  const [date, setDate] = React.useState(workDate);
  const [projectId, setProjectId] = React.useState(defaultProjectId || "");
  const [selectedWorkerIds, setSelectedWorkerIds] = React.useState<Set<string>>(new Set());
  const [dayType, setDayType] = React.useState<DayType>("full_day");
  const [otHours, setOtHours] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [existingWorkerIds, setExistingWorkerIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setDate(workDate);
  }, [workDate, open]);

  React.useEffect(() => {
    if (!open) {
      setSelectedWorkerIds(new Set());
      setError(null);
      return;
    }
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    }
  }, [open, defaultProjectId]);

  // Load existing entries for this project/date to avoid duplicates.
  React.useEffect(() => {
    async function loadExisting() {
      if (!open || !projectId || !date) {
        setExistingWorkerIds(new Set());
        return;
      }
      try {
        const entries = await getLaborEntriesByProjectAndDate(projectId, date);
        setExistingWorkerIds(new Set(entries.map((e) => e.workerId)));
      } catch {
        setExistingWorkerIds(new Set());
      }
    }
    void loadExisting();
  }, [open, projectId, date]);

  const selectAll = () => {
    setSelectedWorkerIds(
      new Set(workers.filter((w) => !existingWorkerIds.has(w.id)).map((w) => w.id))
    );
  };
  const selectNone = () => setSelectedWorkerIds(new Set());
  const selectYesterday = React.useCallback(async () => {
    if (!projectId || !date) return;
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().slice(0, 10);
    try {
      const entries = await getLaborEntriesByProjectAndDate(projectId, yesterdayStr);
      setSelectedWorkerIds(new Set(entries.map((e) => e.workerId).filter((id) => !existingWorkerIds.has(id))));
    } catch {
      setSelectedWorkerIds(new Set());
    }
  }, [projectId, date, existingWorkerIds]);

  const toggleWorker = (id: string) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const otNum = Number(otHours) || 0;
  const totalPayPreview = React.useMemo(() => {
    let sum = 0;
    for (const id of selectedWorkerIds) {
      const worker = workers.find((w) => w.id === id);
      const dailyRate = worker?.dailyRate ?? (worker?.halfDayRate ?? 0) * 2;
      const basePay =
        dayType === "full_day" ? dailyRate :
        dayType === "half_day" ? dailyRate / 2 : 0;
      const otRate = (dailyRate / 8) * 1.5;
      sum += basePay + otNum * otRate;
    }
    return sum;
  }, [selectedWorkerIds, workers, dayType, otNum]);

  const handleSave = async () => {
    if (!date) {
      setError("Select a date.");
      return;
    }
    if (!projectId) {
      setError("Select a project.");
      return;
    }
    if (selectedWorkerIds.size === 0) {
      setError("Select at least one worker.");
      return;
    }
    const ot = Number(otHours) || 0;
    if (ot < 0) {
      setError("OT hours cannot be negative.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Pay: Full Day = daily_rate, Half Day = daily_rate/2, Absent = 0. OT: (daily_rate/8)*1.5 per hour.
      const rows: { worker_id: string; project_id: string; hours: number; cost_code: string | null; notes: string | null }[] = [];
      for (const id of selectedWorkerIds) {
        const worker = workers.find((w) => w.id === id);
        const dailyRate = worker?.dailyRate ?? (worker?.halfDayRate ?? 0) * 2;
        const basePay =
          dayType === "full_day" ? dailyRate :
          dayType === "half_day" ? dailyRate / 2 : 0;
        const otRate = (dailyRate / 8) * 1.5;
        const totalPay = basePay + ot * otRate;
        if (totalPay <= 0) continue; // skip absent (or invalid)
        const hourlyRate = dailyRate / 8;
        const equivalentHours = hourlyRate > 0 ? totalPay / hourlyRate : 0;
        rows.push({
          worker_id: id,
          project_id: projectId,
          hours: Math.round(equivalentHours * 100) / 100,
          cost_code: null,
          notes: `day_type=${dayType}${ot > 0 ? `, ot_hours=${ot}` : ""}`,
        });
      }

      if (rows.length === 0) {
        setError("No entries to save (e.g. all Absent).");
        setSubmitting(false);
        return;
      }

      const inserted = await insertDailyLaborEntries(date, rows);
      onSaved(inserted.length);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save entries.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-[#111111]">
            Add Daily Entry
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 text-sm tabular-nums"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm"
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-gray-500">Workers</label>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg text-xs px-2" onClick={selectAll}>
                  All
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg text-xs px-2" onClick={selectNone}>
                  None
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg text-xs px-2" onClick={selectYesterday} disabled={!projectId || !date}>
                  Yesterday
                </Button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-[#E5E7EB] bg-white divide-y divide-[#E5E7EB]">
              {workers.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-500">No workers found.</p>
              ) : (
                workers.map((w) => {
                  const disabled = existingWorkerIds.has(w.id);
                  const checked = selectedWorkerIds.has(w.id);
                  const dailyRate = w.dailyRate ?? (w.halfDayRate ?? 0) * 2;
                  return (
                    <label
                      key={w.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                        checked ? "bg-blue-50 border-l-4 border-blue-300" : "border-l-4 border-l-transparent",
                        disabled && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleWorker(w.id)}
                        className="h-4 w-4 rounded border-gray-300 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[#111111]">{w.name}</div>
                        <div className="text-xs text-gray-500">${dailyRate.toFixed(0)} / day</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {existingWorkerIds.size > 0 ? (
              <p className="text-[11px] text-gray-500">
                Workers already logged for this project and date are disabled.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-500">Day Type</label>
              <select
                value={dayType}
                onChange={(e) => setDayType(e.target.value as DayType)}
                className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm"
              >
                <option value="full_day">Full Day</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-500">Overtime hours (optional)</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={otHours}
                onChange={(e) => setOtHours(e.target.value)}
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {selectedWorkerIds.size > 0 ? (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-500">Attendance</label>
              <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-gray-50">
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Worker</th>
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Day Type</th>
                      <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500 tabular-nums">OT</th>
                      <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-500 tabular-nums">Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(selectedWorkerIds).map((id) => {
                      const worker = workers.find((w) => w.id === id);
                      const dailyRate = worker?.dailyRate ?? (worker?.halfDayRate ?? 0) * 2;
                      const basePay =
                        dayType === "full_day" ? dailyRate :
                        dayType === "half_day" ? dailyRate / 2 : 0;
                      const otRate = (dailyRate / 8) * 1.5;
                      const pay = basePay + otNum * otRate;
                      const dayLabel = dayType === "full_day" ? "Full Day" : dayType === "half_day" ? "Half Day" : "Absent";
                      return (
                        <tr key={id} className="border-b border-[#E5E7EB] last:border-b-0">
                          <td className="py-2 px-3 font-medium text-[#111111]">{worker?.name ?? id}</td>
                          <td className="py-2 px-3 text-gray-600">{dayLabel}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-600">{otNum > 0 ? otNum : "—"}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium">${pay.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-xl shadow-sm font-medium bg-gradient-to-r from-gray-900 to-gray-800 text-white hover:from-gray-800 hover:to-gray-700 transition"
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting ? "Saving…" : `Save Entries · $${totalPayPreview.toFixed(2)} total`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


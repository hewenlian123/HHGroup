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
  getFullDayLaborEntriesByDate,
  getLaborEntriesWithJoins,
  updateLaborEntry,
  clearLaborEntry,
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
import { Button as UiButton } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

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

type Session = "morning" | "afternoon" | "full_day";

function sessionLabel(s: Session): string {
  if (s === "morning") return "Morning";
  if (s === "afternoon") return "Afternoon";
  return "Full Day";
}

function sessionTag(s: Session): string {
  if (s === "morning") return "🌅";
  if (s === "afternoon") return "🌇";
  return "🟩";
}

function sessionFromFlags(morning: unknown, afternoon: unknown): Session {
  const m = morning === true;
  const a = afternoon === true;
  if (m && a) return "full_day";
  if (m && !a) return "morning";
  if (!m && a) return "afternoon";
  // default (legacy rows): treat as full day for display
  return "full_day";
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
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LaborEntryWithJoins | null>(null);
  const [editBusy, setEditBusy] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editProjectId, setEditProjectId] = React.useState<string>("");
  const [editSession, setEditSession] = React.useState<Session>("full_day");
  const [editAmount, setEditAmount] = React.useState<string>("");
  const [editHours, setEditHours] = React.useState<string>("");
  const [editNotes, setEditNotes] = React.useState<string>("");

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

  const openEdit = React.useCallback((entry: LaborEntryWithJoins) => {
    setEditing(entry);
    setEditProjectId(entry.project_id ?? "");
    setEditSession(sessionFromFlags((entry as any).morning, (entry as any).afternoon));
    setEditAmount(String(entry.cost_amount != null ? Number(entry.cost_amount) : 0));
    setEditHours(String(entry.hours != null ? Number(entry.hours) : 0));
    setEditNotes(entry.notes ?? "");
    setEditError(null);
    setEditOpen(true);
  }, []);

  const closeEdit = React.useCallback(() => {
    setEditOpen(false);
    setEditing(null);
    setEditError(null);
  }, []);

  const handleDelete = React.useCallback(async (entry: LaborEntryWithJoins) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) return;
    setError(null);
    setMessage(null);
    const prev = dayEntries;
    setDayEntries((p) => p.filter((x) => x.id !== entry.id));
    try {
      await clearLaborEntry(entry.id);
      setMessage("Entry deleted.");
      void loadEntries();
    } catch (e) {
      setDayEntries(prev);
      setError(e instanceof Error ? e.message : "Failed to delete.");
    }
  }, [dayEntries, loadEntries]);

  const handleSaveEdit = React.useCallback(async () => {
    if (!editing) return;
    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      setEditError("Enter a valid amount.");
      return;
    }
    const hrs = Number(editHours);
    if (!Number.isFinite(hrs) || hrs < 0) {
      setEditError("Enter valid hours.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await updateLaborEntry(editing.id, {
        project_id: editProjectId || null,
        session: editSession,
        cost_amount: amt,
        hours: hrs,
        notes: editNotes.trim() || null,
      });
      closeEdit();
      setMessage("Entry updated.");
      void loadEntries();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setEditBusy(false);
    }
  }, [editing, editAmount, editHours, editNotes, editProjectId, editSession, closeEdit, loadEntries]);

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
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {dayEntries.map((e) => {
                  const { dayType, otHours } = parseDayTypeAndOt(e.notes);
                  const sess = sessionFromFlags((e as any).morning, (e as any).afternoon);
                  const pay = e.cost_amount != null ? Number(e.cost_amount) : 0;
                  return (
                    <tr key={e.id} className="group border-b border-[#E5E7EB] last:border-b-0">
                      <td className="py-2 px-3 font-medium text-[#111111]">{e.worker_name ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{e.project_name ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">
                        <span className="mr-1">{sessionTag(sess)}</span>
                        {dayType}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{otHours}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">${pay.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex justify-end gap-1">
                          <UiButton
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(e)}
                            aria-label="Edit entry"
                          >
                            <Pencil className="h-4 w-4" />
                          </UiButton>
                          <UiButton
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => void handleDelete(e)}
                            aria-label="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </UiButton>
                        </div>
                      </td>
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

      <Dialog open={editOpen} onOpenChange={(o) => (o ? null : closeEdit())}>
        <DialogContent className="border-border/60 p-0 sm:p-6 max-sm:h-[100dvh] max-sm:w-[100vw] max-sm:max-w-none max-sm:rounded-none">
          <DialogHeader className="px-6 pt-6 pb-4 max-sm:px-4 max-sm:pt-4 max-sm:pb-3 border-b border-border/60">
            <DialogTitle className="text-base font-semibold">Edit Entry</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 max-sm:px-4 max-sm:py-3 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Worker</label>
              <Input value={editing?.worker_name ?? "—"} readOnly className="h-9" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <select
                value={editProjectId}
                onChange={(e) => setEditProjectId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input value={editing?.work_date ?? workDate} readOnly className="h-9 tabular-nums" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Session</label>
              <select
                value={editSession}
                onChange={(e) => setEditSession(e.target.value as Session)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="full_day">Full Day</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Cost Amount</label>
                <Input
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="h-9 tabular-nums"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Hours</label>
                <Input
                  value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  className="h-9 tabular-nums"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="h-9"
                placeholder="Optional"
              />
            </div>
            {editError ? <p className="text-sm text-destructive">{editError}</p> : null}
          </div>
          <DialogFooter className="px-6 pb-6 max-sm:px-4 max-sm:pb-4 border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={closeEdit} disabled={editBusy}>Cancel</Button>
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={() => void handleSaveEdit()} disabled={editBusy}>
              {editBusy ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

type ProjectSection = {
  id: string;
  projectId: string;
  selectedWorkerIds: Set<string>;
  dayType: DayType;
  otHours: string;
  existingWorkerIds: Set<string>;
  error: string | null;
};

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
  const [sections, setSections] = React.useState<ProjectSection[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const [fullDayWorkerIds, setFullDayWorkerIds] = React.useState<Set<string>>(new Set());

  // Helper to create a new blank section
  const createSection = React.useCallback(
    (projectId = ""): ProjectSection => ({
      id: Math.random().toString(36).slice(2),
      projectId,
      selectedWorkerIds: new Set<string>(),
      dayType: "full_day",
      otHours: "",
      existingWorkerIds: new Set<string>(),
      error: null,
    }),
    [],
  );

  React.useEffect(() => {
    setDate(workDate);
  }, [workDate, open]);

  // Initialize sections when modal opens
  React.useEffect(() => {
    if (!open) {
      setSections([]);
      setGlobalError(null);
      return;
    }
    setSections((prev) => {
      if (prev.length > 0) return prev;
      // First section uses default project if provided
      return [createSection(defaultProjectId || "")];
    });
  }, [open, defaultProjectId, createSection]);

  // Load full-day workers by date (across all projects) to avoid double entries.
  React.useEffect(() => {
    if (!open || !date) return;
    async function loadFullDayWorkers() {
      try {
        const entries = await getFullDayLaborEntriesByDate(date);
        const ids = new Set(entries.map((e) => e.workerId));
        setFullDayWorkerIds(ids);
      } catch {
        setFullDayWorkerIds(new Set());
      }
    }
    void loadFullDayWorkers();
  }, [open, date]);

  const updateSection = React.useCallback(
    (id: string, updater: (s: ProjectSection) => ProjectSection) => {
      setSections((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
    },
    [],
  );

  const addSection = () => {
    setSections((prev) => [...prev, createSection()]);
  };

  const removeSection = (id: string) => {
    setSections((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== id);
    });
  };

  const handleProjectChange = (id: string, projectId: string) => {
    // Prevent duplicate project selection
    const duplicate = sections.some(
      (s) => s.id !== id && s.projectId && s.projectId === projectId,
    );
    if (duplicate) {
      updateSection(id, (s) => ({
        ...s,
        error: "This project is already used in another section.",
      }));
      return;
    }
    updateSection(id, (s) => ({
      ...s,
      projectId,
      selectedWorkerIds: new Set<string>(),
      existingWorkerIds: new Set<string>(),
      error: null,
    }));
  };

  const toggleWorker = (sectionId: string, workerId: string) => {
    updateSection(sectionId, (s) => {
      const next = new Set(s.selectedWorkerIds);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return { ...s, selectedWorkerIds: next };
    });
  };

  const setDayTypeForSection = (id: string, value: DayType) => {
    updateSection(id, (s) => ({ ...s, dayType: value }));
  };

  const setOtHoursForSection = (id: string, value: string) => {
    updateSection(id, (s) => ({ ...s, otHours: value }));
  };

  const selectAllInSection = (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    const allowed = workers.filter(
      (w) => !fullDayWorkerIds.has(w.id),
    );
    updateSection(id, (s) => ({
      ...s,
      selectedWorkerIds: new Set(allowed.map((w) => w.id)),
    }));
  };

  const selectNoneInSection = (id: string) => {
    updateSection(id, (s) => ({ ...s, selectedWorkerIds: new Set() }));
  };

  const selectYesterdayInSection = (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section?.projectId || !date) return;
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().slice(0, 10);
    (async () => {
      try {
        const entries = await getLaborEntriesByProjectAndDate(
          section.projectId,
          yesterdayStr,
        );
        const ids = new Set(
          entries
            .map((e) => e.workerId)
            .filter((wid) => !fullDayWorkerIds.has(wid)),
        );
        updateSection(id, (s) => ({ ...s, selectedWorkerIds: ids }));
      } catch {
        updateSection(id, (s) => ({ ...s, selectedWorkerIds: new Set() }));
      }
    })();
  };

  const otNumBySection = sections.reduce<Record<string, number>>(
    (acc, s) => ({
      ...acc,
      [s.id]: Number(s.otHours) || 0,
    }),
    {},
  );

  const totalPayPreview = React.useMemo(() => {
    let sum = 0;
    for (const section of sections) {
      const otNum = Number(section.otHours) || 0;
      for (const id of Array.from(section.selectedWorkerIds)) {
        const worker = workers.find((w) => w.id === id);
        const dailyRate = worker?.dailyRate ?? worker?.halfDayRate ?? 0;
        const basePay =
          section.dayType === "full_day"
            ? dailyRate
            : section.dayType === "half_day"
              ? dailyRate / 2
              : 0;
        const otRate = (dailyRate / 8) * 1.5;
        sum += basePay + otNum * otRate;
      }
    }
    return sum;
  }, [sections, workers]);

  const handleSave = async () => {
    if (!date) {
      setGlobalError("Select a date.");
      return;
    }

    // Reset per-section errors
    setSections((prev) => prev.map((s) => ({ ...s, error: null })));
    setGlobalError(null);

    // Validate duplicates between sections
    const usedProjects = new Map<string, number>();
    for (const s of sections) {
      if (!s.projectId) continue;
      usedProjects.set(s.projectId, (usedProjects.get(s.projectId) ?? 0) + 1);
    }
    const dupProjects = Array.from(usedProjects.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
    if (dupProjects.length > 0) {
      setSections((prev) =>
        prev.map((s) =>
          dupProjects.includes(s.projectId)
            ? {
                ...s,
                error: "Each project can only be used once per day.",
              }
            : s,
        ),
      );
      setGlobalError("Each project can only be used once per day.");
      return;
    }

    // Per-section validation
    let hasError = false;
    setSections((prev) =>
      prev.map((s) => {
        let error: string | null = null;
        if (!s.projectId) {
          error = "Select a project.";
          hasError = true;
        } else if (s.selectedWorkerIds.size === 0) {
          error = "Select at least one worker.";
          hasError = true;
        } else {
          const ot = Number(s.otHours) || 0;
          if (ot < 0) {
            error = "OT hours cannot be negative.";
            hasError = true;
          }
        }
        return { ...s, error };
      }),
    );
    if (hasError) return;

    setSubmitting(true);
    try {
      const rows: {
        worker_id: string;
        project_id: string;
        hours: number;
        cost_code: string | null;
        notes: string | null;
      }[] = [];

      for (const section of sections) {
        const ot = Number(section.otHours) || 0;
        for (const id of Array.from(section.selectedWorkerIds)) {
          const worker = workers.find((w) => w.id === id);
          const dailyRate = worker?.dailyRate ?? worker?.halfDayRate ?? 0;
          const basePay =
            section.dayType === "full_day"
              ? dailyRate
              : section.dayType === "half_day"
                ? dailyRate / 2
                : 0;
          const otRate = (dailyRate / 8) * 1.5;
          const totalPay = basePay + ot * otRate;
          if (totalPay <= 0) continue;
          const hourlyRate = dailyRate / 8;
          const equivalentHours = hourlyRate > 0 ? totalPay / hourlyRate : 0;
          rows.push({
            worker_id: id,
            project_id: section.projectId,
            hours: Math.round(equivalentHours * 100) / 100,
            cost_code: null,
            notes: `day_type=${section.dayType}${
              ot > 0 ? `, ot_hours=${ot}` : ""
            }`,
          });
        }
      }

      if (rows.length === 0) {
        setGlobalError("No entries to save (e.g. all Absent).");
        setSubmitting(false);
        return;
      }

      const inserted = await insertDailyLaborEntries(date, rows);
      onSaved(inserted.length);
      onOpenChange(false);
    } catch (e) {
      setGlobalError(
        e instanceof Error ? e.message : "Failed to save entries.",
      );
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

          {sections.map((section, index) => {
            const otNum = otNumBySection[section.id] ?? 0;
            const dayLabel =
              section.dayType === "full_day"
                ? "Full Day"
                : section.dayType === "half_day"
                  ? "Half Day"
                  : "Absent";
            return (
              <div
                key={section.id}
                className="space-y-3 rounded-md border border-[#E5E7EB] bg-white px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500">
                      Project
                    </label>
                    <select
                      value={section.projectId}
                      onChange={(e) =>
                        handleProjectChange(section.id, e.target.value)
                      }
                      className="h-9 min-w-[200px] rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm"
                    >
                      <option value="">Select project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">
                      Section {index + 1}
                    </span>
                    {sections.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-sm text-xs"
                        onClick={() => removeSection(section.id)}
                        disabled={submitting}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-gray-500">
                      Workers
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg px-2 text-xs"
                        onClick={() => selectAllInSection(section.id)}
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg px-2 text-xs"
                        onClick={() => selectNoneInSection(section.id)}
                      >
                        None
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg px-2 text-xs"
                        onClick={() => selectYesterdayInSection(section.id)}
                        disabled={!section.projectId || !date}
                      >
                        Yesterday
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto rounded-lg border border-[#E5E7EB] bg-white divide-y divide-[#E5E7EB]">
                    {workers.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-500">
                        No workers found.
                      </p>
                    ) : (
                      workers.map((w) => {
                        const disabled = fullDayWorkerIds.has(w.id);
                        const checked =
                          section.selectedWorkerIds.has(w.id) || false;
                        const dailyRate =
                          w.dailyRate ?? w.halfDayRate ?? 0;
                        return (
                          <label
                            key={w.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors",
                              checked
                                ? "bg-blue-50 border-l-4 border-blue-300"
                                : "border-l-4 border-l-transparent",
                              disabled && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() =>
                                toggleWorker(section.id, w.id)
                              }
                              className="h-4 w-4 shrink-0 rounded border-gray-300"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-[#111111]">
                                {w.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                ${dailyRate.toFixed(0)} / day
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {fullDayWorkerIds.size > 0 ? (
                    <p className="text-[11px] text-gray-500">
                      Workers who have completed a full day (AM+PM) on this
                      date are disabled across all projects.
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-500">
                      Day Type
                    </label>
                    <select
                      value={section.dayType}
                      onChange={(e) =>
                        setDayTypeForSection(
                          section.id,
                          e.target.value as DayType,
                        )
                      }
                      className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm"
                    >
                      <option value="full_day">Full Day</option>
                      <option value="half_day">Half Day</option>
                      <option value="absent">Absent</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-500">
                      Overtime hours (optional)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={section.otHours}
                      onChange={(e) =>
                        setOtHoursForSection(section.id, e.target.value)
                      }
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {section.selectedWorkerIds.size > 0 ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-500">
                      Attendance
                    </label>
                    <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-gray-50">
                            <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                              Worker
                            </th>
                            <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                              Day Type
                            </th>
                            <th className="py-2 px-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 tabular-nums">
                              OT
                            </th>
                            <th className="py-2 px-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 tabular-nums">
                              Pay
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(section.selectedWorkerIds).map(
                            (id) => {
                              const worker = workers.find(
                                (w) => w.id === id,
                              );
                              const dailyRate =
                                worker?.dailyRate ??
                                worker?.halfDayRate ??
                                0;
                              const basePay =
                                section.dayType === "full_day"
                                  ? dailyRate
                                  : section.dayType === "half_day"
                                    ? dailyRate / 2
                                    : 0;
                              const otRate = (dailyRate / 8) * 1.5;
                              const pay = basePay + otNum * otRate;
                              return (
                                <tr
                                  key={id}
                                  className="border-b border-[#E5E7EB] last:border-b-0"
                                >
                                  <td className="py-2 px-3 font-medium text-[#111111]">
                                    {worker?.name ?? id}
                                  </td>
                                  <td className="py-2 px-3 text-gray-600">
                                    {dayLabel}
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">
                                    {otNum > 0 ? otNum : "—"}
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums font-medium">
                                    ${pay.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {section.error ? (
                  <p className="text-xs text-red-600">{section.error}</p>
                ) : null}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={addSection}
            disabled={submitting}
          >
            + Add Another Project
          </Button>

          {globalError ? (
            <p className="text-xs text-red-600">{globalError}</p>
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


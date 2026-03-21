"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageLayout, PageHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "calendar";
type ScheduleRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  scheduled: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  delayed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  scheduled: "Planned",
  in_progress: "In progress",
  done: "Done",
  delayed: "Delayed",
};

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  const s = start ? new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
  const e = end ? new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
  return start && end ? `${s} → ${e}` : s;
}

/** Simple month calendar grid: one row per week, items under their start_date. */
function ScheduleCalendarGrid({
  schedule,
  statusStyle,
  statusLabel,
}: {
  schedule: ScheduleRow[];
  statusStyle: (s: string) => string;
  statusLabel: (s: string) => string;
}) {
  const [viewDate, setViewDate] = React.useState(() => new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
  const itemsByDate = React.useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const s of schedule) {
      const d = s.start_date?.slice(0, 10) ?? "";
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(s);
    }
    return map;
  }, [schedule]);

  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells: { day: number | null; dateKey: string }[] = [];
  for (let i = 0; i < totalCells; i++) {
    if (i < startPad) {
      cells.push({ day: null, dateKey: "" });
    } else if (i < startPad + daysInMonth) {
      const day = i - startPad + 1;
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, dateKey });
    } else {
      cells.push({ day: null, dateKey: "" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded">←</button>
        <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
        <button type="button" onClick={nextMonth} className="text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded">→</button>
      </div>
      <div className="grid grid-cols-7 gap-px border border-[#EBEBE9] rounded-sm overflow-hidden bg-[#EBEBE9] dark:border-border/60 dark:bg-border/40">
        {weekDays.map((w) => (
          <div key={w} className="bg-background py-1.5 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            className={cn(
              "min-h-[72px] bg-background p-1.5 text-left",
              c.day == null && "bg-[#F7F7F5]/80 dark:bg-muted/20"
            )}
          >
            {c.day != null && (
              <>
                <span className="text-xs font-medium text-muted-foreground">{c.day}</span>
                <div className="mt-1 space-y-1">
                  {(itemsByDate.get(c.dateKey) ?? []).map((s) => (
                    <div
                      key={s.id}
                      className={cn(
                        "text-xs truncate rounded px-1 py-0.5",
                        statusStyle(s.status)
                      )}
                      title={`${s.title} — ${statusLabel(s.status)}`}
                    >
                      {s.title || "—"}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const ScheduleListRow = React.memo(function ScheduleListRow({
  item,
  statusStyle,
  statusLabel,
}: {
  item: ScheduleRow;
  statusStyle: (s: string) => string;
  statusLabel: (s: string) => string;
}) {
  return (
    <li className="py-2.5 px-3 border-b border-[#EBEBE9]/80 last:border-b-0 hover:bg-[#F7F7F5] transition-colors dark:border-border/40 dark:hover:bg-muted/30">
      <div className="font-medium text-foreground">{item.title || "—"}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{item.project_name ?? "—"}</div>
      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm">
        <span className="tabular-nums text-muted-foreground">
          {formatDateRange(item.start_date, item.end_date)}
        </span>
        <span
          className={cn(
            "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
            statusStyle(item.status)
          )}
        >
          {statusLabel(item.status)}
        </span>
      </div>
    </li>
  );
});

export default function SchedulePage() {
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [schedule, setSchedule] = React.useState<ScheduleRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    project_id: "",
    title: "",
    start_date: "",
    end_date: "",
    status: "planned",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operations/schedule");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      setSchedule(data.schedule ?? []);
      setProjects(data.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openModal = React.useCallback(() => {
    setForm((prev) => ({
      ...prev,
      project_id: projects[0]?.id ?? "",
      title: "",
      start_date: "",
      end_date: "",
      status: "planned",
    }));
    setModalOpen(true);
  }, [projects]);

  const handleCreate = React.useCallback(async () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: form.project_id,
          title: form.title || "Untitled",
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          status: form.status,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to create");
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create.");
    } finally {
      setSubmitting(false);
    }
  }, [form, load]);

  const statusStyle = React.useCallback((status: string) =>
    STATUS_STYLES[status] ?? "bg-muted text-muted-foreground", []);
  const statusLabel = React.useCallback((status: string) => STATUS_LABEL[status] ?? status, []);

  return (
    <PageLayout
      header={
        <PageHeader
          title="Schedule"
          description="Project schedule across all projects."
          actions={
            <Button size="touch" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90 min-h-[44px]" onClick={openModal}>
              + New schedule item
            </Button>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-3">
        {/* View switch: List | Calendar */}
        <div className="flex items-center gap-1 p-0.5 rounded-sm border border-[#EBEBE9] bg-background w-fit dark:border-border/60">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              viewMode === "list"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              viewMode === "calendar"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Calendar
          </button>
        </div>

        {/* List view — compact list */}
        {viewMode === "list" && (
          <div className="overflow-hidden border border-[#EBEBE9] bg-background dark:border-border/60">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="py-8 text-center text-sm text-destructive">{error}</div>
            ) : schedule.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No schedule items yet.</p>
                <Button onClick={openModal} className="mt-3" size="sm">
                  New schedule item
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-[#EBEBE9] dark:divide-border/60">
                {schedule.map((s) => (
                  <ScheduleListRow
                    key={s.id}
                    item={s}
                    statusStyle={statusStyle}
                    statusLabel={statusLabel}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Calendar view — placeholder */}
        {viewMode === "calendar" && (
          <div className="overflow-hidden border border-[#EBEBE9] bg-background dark:border-border/60">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="py-8 text-center text-sm text-destructive">{error}</div>
            ) : schedule.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No schedule items yet.</p>
                <Button onClick={openModal} className="mt-3" size="sm">
                  New schedule item
                </Button>
              </div>
            ) : (
              <>
                {/* Mobile: simplified list (event title + date only) */}
                <div className="lg:hidden divide-y divide-[#EBEBE9] dark:divide-border/60">
                  {schedule.map((s) => (
                    <div key={s.id} className="py-3 px-3 sm:px-4">
                      <div className="font-medium text-foreground">{s.title || "—"}</div>
                      <div className="text-sm text-muted-foreground mt-0.5 tabular-nums">
                        {formatDateRange(s.start_date, s.end_date)}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: month calendar grid */}
                <div className="hidden lg:block p-4">
                  <ScheduleCalendarGrid schedule={schedule} statusStyle={statusStyle} statusLabel={statusLabel} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New schedule item</DialogTitle>
            <DialogDescription>Add a task to the schedule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <Select
                value={form.project_id}
                onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))}
                className="mt-1.5 w-full"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Task</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Task name"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start date</label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  className="mt-1.5 h-9 rounded-sm border-border/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End date</label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  className="mt-1.5 h-9 rounded-sm border-border/60"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="mt-1.5 w-full"
              >
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="delayed">Delayed</option>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={submitting}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

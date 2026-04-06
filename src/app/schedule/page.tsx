"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageLayout, PageHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { Search } from "lucide-react";
import {
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

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
  done: "bg-[#DCFCE7] text-[#166534] dark:bg-green-950 dark:text-green-300",
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
  const s = start
    ? new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";
  const e = end
    ? new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";
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
        <button
          type="button"
          onClick={prevMonth}
          className="text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded"
        >
          ←
        </button>
        <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px border border-gray-100 rounded-sm overflow-hidden bg-[#E5E7EB] dark:border-border/60 dark:bg-border/40">
        {weekDays.map((w) => (
          <div
            key={w}
            className="bg-background py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            className={cn(
              "min-h-[72px] bg-background p-1.5 text-left",
              c.day == null && "bg-[#F3F4F6] dark:bg-muted/20"
            )}
          >
            {c.day != null && (
              <>
                <span className="text-xs font-medium text-muted-foreground">{c.day}</span>
                <div className="mt-1 space-y-1">
                  {(itemsByDate.get(c.dateKey) ?? []).map((s) => (
                    <div
                      key={s.id}
                      className={cn("text-xs truncate rounded px-1 py-0.5", statusStyle(s.status))}
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

const ScheduleTableRow = React.memo(function ScheduleTableRow({
  item,
  statusStyle,
  statusLabel,
}: {
  item: ScheduleRow;
  statusStyle: (s: string) => string;
  statusLabel: (s: string) => string;
}) {
  return (
    <tr className={listTableRowStaticClassName}>
      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium text-foreground">
        {item.title || "—"}
      </td>
      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
        {item.project_name ?? "—"}
      </td>
      <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums text-muted-foreground">
        {formatDateRange(item.start_date, item.end_date)}
      </td>
      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
        <span
          className={cn(
            "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
            statusStyle(item.status)
          )}
        >
          {statusLabel(item.status)}
        </span>
      </td>
    </tr>
  );
});

export default function SchedulePage() {
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [schedule, setSchedule] = React.useState<ScheduleRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
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

  const statusStyle = React.useCallback(
    (status: string) => STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
    []
  );
  const statusLabel = React.useCallback((status: string) => STATUS_LABEL[status] ?? status, []);

  const filteredSchedule = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return schedule;
    return schedule.filter(
      (s) =>
        (s.title ?? "").toLowerCase().includes(q) ||
        (s.project_name ?? "").toLowerCase().includes(q)
    );
  }, [schedule, searchQuery]);

  const activeDrawerFilterCount = viewMode !== "list" ? 1 : 0;

  return (
    <PageLayout
      divider={false}
      className={cn("md:max-w-5xl", mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <>
          <div className="hidden md:block">
            <PageHeader
              title="Schedule"
              description="Project schedule across all projects."
              actions={
                <Button
                  size="sm"
                  className="h-9 rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90"
                  onClick={openModal}
                >
                  + New schedule item
                </Button>
              }
            />
          </div>
          <div className="md:hidden">
            <MobileListHeader
              title="Schedule"
              fab={<MobileFabButton ariaLabel="New schedule item" onClick={openModal} />}
            />
          </div>
        </>
      }
    >
      <div className="w-full space-y-3">
        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search schedule…"
                className="h-10 pl-8 text-sm"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="View">
          <div className="flex gap-1 rounded-sm border border-gray-100 bg-background p-0.5 dark:border-border/60">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium",
                viewMode === "list" ? "bg-foreground text-background" : "text-muted-foreground"
              )}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium",
                viewMode === "calendar" ? "bg-foreground text-background" : "text-muted-foreground"
              )}
            >
              Calendar
            </button>
          </div>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        {/* View switch: List | Calendar */}
        <div className="hidden w-fit items-center gap-1 rounded-sm border border-gray-100 bg-background p-0.5 dark:border-border/60 md:flex">
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

        <div className="hidden md:flex md:max-w-md md:items-center md:gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search schedule…"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        {/* List view — compact list */}
        {viewMode === "list" && (
          <div className="airtable-table-wrap airtable-table-wrap--ruled bg-background max-md:border-0 max-md:bg-transparent">
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
            ) : filteredSchedule.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No matches.</div>
            ) : (
              <>
                <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
                  {filteredSchedule.map((s) => (
                    <div key={s.id} className="flex min-h-[48px] flex-col gap-1 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{s.title || "—"}</p>
                          <p className="truncate text-xs text-text-secondary dark:text-muted-foreground">
                            {s.project_name ?? "—"}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                            statusStyle(s.status)
                          )}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </div>
                      <p className="text-sm font-medium tabular-nums text-foreground">
                        {formatDateRange(s.start_date, s.end_date)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="airtable-table-scroll hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                          Title
                        </th>
                        <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                          Project
                        </th>
                        <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                          Dates
                        </th>
                        <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSchedule.map((s) => (
                        <ScheduleTableRow
                          key={s.id}
                          item={s}
                          statusStyle={statusStyle}
                          statusLabel={statusLabel}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Calendar view — placeholder */}
        {viewMode === "calendar" && (
          <div className="overflow-hidden border border-gray-100 bg-background dark:border-border/60">
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
            ) : filteredSchedule.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No matches.</div>
            ) : (
              <>
                <div className="divide-y divide-gray-100 dark:divide-border/60 lg:hidden">
                  {filteredSchedule.map((s) => (
                    <div
                      key={s.id}
                      className="flex min-h-[48px] flex-col gap-1 px-0 py-2.5 sm:px-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{s.title || "—"}</p>
                          <p className="truncate text-xs text-text-secondary dark:text-muted-foreground">
                            {s.project_name ?? "—"}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium",
                            statusStyle(s.status)
                          )}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </div>
                      <p className="text-sm font-medium tabular-nums text-foreground">
                        {formatDateRange(s.start_date, s.end_date)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="hidden p-4 lg:block">
                  <ScheduleCalendarGrid
                    schedule={filteredSchedule}
                    statusStyle={statusStyle}
                    statusLabel={statusLabel}
                  />
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
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
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
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={submitting}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

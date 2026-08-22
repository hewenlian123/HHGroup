"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import {
  EmptyState,
  LoadingState,
  NeoFieldLabel,
  NeoInput,
  NeoMobileCard,
  NeoModal,
  NeoPanel,
  NeoSelect,
  NeoStatus,
  NeoTable,
  NeoToolbar,
  PageLayout,
  PageHeader,
  neoFormErrorClassName,
  type StatusBadgeVariant,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { TYPO } from "@/lib/typography";
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

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  scheduled: "Planned",
  in_progress: "In progress",
  done: "Done",
  delayed: "Delayed",
};

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  planned: "muted",
  scheduled: "muted",
  in_progress: "warning",
  done: "success",
  delayed: "danger",
};

const CALENDAR_STATUS_CLASS: Record<string, string> = {
  planned:
    "border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]",
  scheduled:
    "border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]",
  in_progress:
    "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]",
  done: "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]",
  delayed:
    "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]",
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
  statusLabel,
}: {
  schedule: ScheduleRow[];
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
          className="rounded-md px-2 py-1 text-sm font-medium text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)]"
        >
          ←
        </button>
        <span className="text-sm font-semibold text-[var(--hh-text-primary)]">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-md px-2 py-1 text-sm font-medium text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)]"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--hh-border)] bg-[var(--hh-border)]">
        {weekDays.map((w) => (
          <div
            key={w}
            className="bg-[var(--hh-l2-operational-surface)] py-1.5 text-center text-xs font-medium text-[var(--hh-text-secondary)]"
          >
            {w}
          </div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            className={cn(
              "min-h-[72px] bg-[var(--hh-l2-operational-surface)] p-1.5 text-left",
              c.day == null && "bg-[var(--hh-l2-operational-surface)]"
            )}
          >
            {c.day != null && (
              <>
                <span className="text-xs font-medium text-[var(--hh-text-secondary)]">{c.day}</span>
                <div className="mt-1 space-y-1">
                  {(itemsByDate.get(c.dateKey) ?? []).map((s) => (
                    <div
                      key={s.id}
                      className={cn(
                        "truncate rounded-md border px-1.5 py-0.5 text-xs font-medium",
                        CALENDAR_STATUS_CLASS[s.status] ?? CALENDAR_STATUS_CLASS.planned
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

const ScheduleTableRow = React.memo(function ScheduleTableRow({
  item,
  statusLabel,
  statusVariant,
}: {
  item: ScheduleRow;
  statusLabel: (s: string) => string;
  statusVariant: (s: string) => StatusBadgeVariant;
}) {
  return (
    <tr className={listTableRowStaticClassName}>
      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium text-[var(--hh-text-primary)]">
        {item.title || "—"}
      </td>
      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
        {item.project_name ?? "—"}
      </td>
      <td className="hh-fin h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
        {formatDateRange(item.start_date, item.end_date)}
      </td>
      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell">
        <NeoStatus label={statusLabel(item.status)} variant={statusVariant(item.status)} />
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

  const statusVariant = React.useCallback(
    (status: string) => STATUS_VARIANT[status] ?? "default",
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
                <Button size="sm" onClick={openModal}>
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
              <NeoInput
                aria-label="Search schedule"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search schedule…"
                className="h-10 pl-8 text-sm"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="View">
          <div className="flex gap-1 rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                viewMode === "list"
                  ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                  : "text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
              )}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                viewMode === "calendar"
                  ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                  : "text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
              )}
            >
              Calendar
            </button>
          </div>
          <Button
            type="button"
            className="w-full rounded-hh-compact"
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        <NeoToolbar className="hidden justify-between md:flex">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === "list"
                  ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                  : "text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
              )}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === "calendar"
                  ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                  : "text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
              )}
            >
              Calendar
            </button>
          </div>
          <div className="relative min-w-0 flex-1 md:max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <NeoInput
              aria-label="Search schedule"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search schedule…"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </NeoToolbar>

        {/* List view — compact list */}
        {viewMode === "list" && (
          <div>
            {loading ? (
              <LoadingState text="Loading schedule..." />
            ) : error ? (
              <EmptyState title="Schedule unavailable" description={error} />
            ) : schedule.length === 0 ? (
              <EmptyState
                title="No schedule items yet"
                description="Add the next project milestone or field task."
                action={
                  <Button onClick={openModal} size="sm">
                    New schedule item
                  </Button>
                }
              />
            ) : filteredSchedule.length === 0 ? (
              <EmptyState title="No matches" description="Try a different schedule search." />
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {filteredSchedule.map((s) => (
                    <NeoMobileCard key={s.id} className="flex min-h-[64px] flex-col gap-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--hh-text-primary)]">
                            {s.title || "—"}
                          </p>
                          <p className="truncate text-xs text-[var(--hh-text-secondary)]">
                            {s.project_name ?? "—"}
                          </p>
                        </div>
                        <NeoStatus
                          label={statusLabel(s.status)}
                          variant={statusVariant(s.status)}
                        />
                      </div>
                      <p className="hh-fin text-hh-metadata font-medium text-[var(--hh-text-secondary)]">
                        {formatDateRange(s.start_date, s.end_date)}
                      </p>
                    </NeoMobileCard>
                  ))}
                </div>
                <NeoTable className="hidden md:block" tableClassName="min-w-[720px] lg:min-w-0">
                  <thead>
                    <tr>
                      <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                        Title
                      </th>
                      <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                        Project
                      </th>
                      <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                        Dates
                      </th>
                      <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchedule.map((s) => (
                      <ScheduleTableRow
                        key={s.id}
                        item={s}
                        statusLabel={statusLabel}
                        statusVariant={statusVariant}
                      />
                    ))}
                  </tbody>
                </NeoTable>
              </>
            )}
          </div>
        )}

        {/* Calendar view — placeholder */}
        {viewMode === "calendar" && (
          <NeoPanel bodyClassName="p-3 md:p-4">
            {loading ? (
              <LoadingState text="Loading calendar..." />
            ) : error ? (
              <EmptyState title="Calendar unavailable" description={error} />
            ) : schedule.length === 0 ? (
              <EmptyState
                title="No schedule items yet"
                description="Add the next project milestone or field task."
                action={
                  <Button onClick={openModal} size="sm">
                    New schedule item
                  </Button>
                }
              />
            ) : filteredSchedule.length === 0 ? (
              <EmptyState title="No matches" description="Try a different schedule search." />
            ) : (
              <>
                <div className="space-y-2 lg:hidden">
                  {filteredSchedule.map((s) => (
                    <NeoMobileCard key={s.id} className="flex min-h-[64px] flex-col gap-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--hh-text-primary)]">
                            {s.title || "—"}
                          </p>
                          <p className="truncate text-xs text-[var(--hh-text-secondary)]">
                            {s.project_name ?? "—"}
                          </p>
                        </div>
                        <NeoStatus
                          label={statusLabel(s.status)}
                          variant={statusVariant(s.status)}
                        />
                      </div>
                      <p className="hh-fin text-hh-metadata font-medium text-[var(--hh-text-secondary)]">
                        {formatDateRange(s.start_date, s.end_date)}
                      </p>
                    </NeoMobileCard>
                  ))}
                </div>
                <div className="hidden lg:block">
                  <ScheduleCalendarGrid schedule={filteredSchedule} statusLabel={statusLabel} />
                </div>
              </>
            )}
          </NeoPanel>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <NeoModal
          title="New schedule item"
          description="Add a task to the schedule."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={submitting}>
                Add
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <NeoFieldLabel>Project</NeoFieldLabel>
              <NeoSelect
                value={form.project_id}
                onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))}
                className="w-full"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NeoSelect>
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Task</NeoFieldLabel>
              <NeoInput
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Task name"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <NeoFieldLabel>Start date</NeoFieldLabel>
                <NeoInput
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <NeoFieldLabel>End date</NeoFieldLabel>
                <NeoInput
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Status</NeoFieldLabel>
              <NeoSelect
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="w-full"
              >
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="delayed">Delayed</option>
              </NeoSelect>
            </div>
            {error && <p className={neoFormErrorClassName}>{error}</p>}
          </div>
        </NeoModal>
      </Dialog>
    </PageLayout>
  );
}

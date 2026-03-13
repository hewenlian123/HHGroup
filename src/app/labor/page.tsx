"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getProjects,
  getLaborEntriesWithJoins,
} from "@/lib/data";
import type { LaborEntryWithJoins } from "@/lib/daily-labor-db";
import { cn } from "@/lib/utils";
import { AddDailyEntryModal as QuickTimesheetModal } from "./add-daily-entry-modal";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HIGH_COST_THRESHOLD = 1000;

function parseDayTypeAndOt(notes: string | null): { dayType: string; otHours: string } {
  const defaultDay = "—";
  const defaultOt = "—";
  if (!notes?.trim()) return { dayType: defaultDay, otHours: defaultOt };
  const dayMatch = /day_type=(\w+)/.exec(notes);
  const otMatch = /ot_hours=([\d.]+)/.exec(notes);
  return {
    dayType: dayMatch
      ? dayMatch[1] === "full_day"
        ? "Full Day"
        : dayMatch[1] === "half_day"
          ? "Half Day"
          : dayMatch[1] === "absent"
            ? "Absent"
            : dayMatch[1]
      : defaultDay,
    otHours: otMatch ? otMatch[1] : defaultOt,
  };
}

function getMonthRange(ym: string): { dateFrom: string; dateTo: string } {
  const [y, m] = ym.split("-").map(Number);
  const dateFrom = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const dateTo = `${ym}-${String(lastDay).padStart(2, "0")}`;
  return { dateFrom, dateTo };
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function buildMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = -12; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value: ym, label: formatMonthLabel(ym) });
  }
  return options;
}

function getDatesInMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    dates.push(`${ym}-${String(d).padStart(2, "0")}`);
  }
  return dates;
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

/** Build calendar grid for month (Mon–Sun). Each cell is null (empty) or day number 1–31. Last row padded to 7. */
function getCalendarGrid(ym: string): (number | null)[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7; // 0 = Monday
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    cells.push(...Array(7 - remainder).fill(null));
  }
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

const MONTH_OPTIONS = buildMonthOptions();

export default function LaborPage() {
  const searchParams = useSearchParams();
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = React.useState(initialMonth);
  const { dateFrom: monthStart, dateTo: monthEnd } = getMonthRange(selectedMonth);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const appliedProjectIdFromUrl = React.useRef(false);
  React.useEffect(() => {
    if (appliedProjectIdFromUrl.current) return;
    const pid = searchParams.get("project_id");
    if (pid) {
      setProjectFilter(pid);
      appliedProjectIdFromUrl.current = true;
    }
  }, [searchParams]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [monthEntries, setMonthEntries] = React.useState<LaborEntryWithJoins[]>([]);
  const [loadingProjects, setLoadingProjects] = React.useState(true);
  const [loadingEntries, setLoadingEntries] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [expandedDate, setExpandedDate] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"list" | "calendar">("list");
  const [selectedDayForDetail, setSelectedDayForDetail] = React.useState<string | null>(null);

  const loadProjects = React.useCallback(async () => {
    setLoadingProjects(true);
    try {
      const p = await getProjects();
      setProjects(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects.");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadMonthEntries = React.useCallback(async () => {
    setLoadingEntries(true);
    try {
      const list = await getLaborEntriesWithJoins({
        date_from: monthStart,
        date_to: monthEnd,
        project_id: projectFilter || undefined,
      });
      setMonthEntries(list);
    } catch {
      setMonthEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [monthStart, monthEnd, projectFilter]);

  React.useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    void loadMonthEntries();
  }, [loadMonthEntries]);

  const handleSaved = React.useCallback(() => {
    setMessage("Entries saved.");
    setError(null);
    void loadMonthEntries();
  }, [loadMonthEntries]);

  const summary = React.useMemo(() => {
    const totalLaborCost = monthEntries.reduce((sum, e) => sum + (e.cost_amount ?? 0), 0);
    const uniqueDates = new Set(monthEntries.map((e) => e.work_date?.slice(0, 10)).filter(Boolean));
    return {
      totalLaborCost,
      totalWorkDays: uniqueDates.size,
      totalEntries: monthEntries.length,
    };
  }, [monthEntries]);

  const datesInMonth = React.useMemo(() => getDatesInMonth(selectedMonth), [selectedMonth]);

  const entriesByDate = React.useMemo(() => {
    const map = new Map<string, LaborEntryWithJoins[]>();
    for (const e of monthEntries) {
      const d = e.work_date?.slice(0, 10);
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return map;
  }, [monthEntries]);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Labor"
        subtitle="Daily labor entries by worker and project."
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Month</label>
        <select
          value={selectedMonth}
          onChange={(e) => {
            setSelectedMonth(e.target.value);
            setExpandedDate(null);
            setSelectedDayForDetail(null);
          }}
          className="h-9 min-w-[160px] rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</label>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-9 min-w-[200px] rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="rounded-sm"
          onClick={() => setModalOpen(true)}
          disabled={loadingProjects}
        >
          + Add Entry
        </Button>
        <div className="flex border border-border/60 rounded-sm overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              view === "list"
                ? "bg-foreground text-background"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            List View
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors border-l border-border/60",
              view === "calendar"
                ? "bg-foreground text-background"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Calendar View
          </button>
        </div>
      </div>

      {error ? (
        <p className="py-3 text-sm text-red-600">{error}</p>
      ) : null}
      {message ? (
        <p className="py-3 text-sm text-muted-foreground">{message}</p>
      ) : null}

      {/* Monthly Summary */}
      <section className="border-b border-border/60 pb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Monthly Summary · {formatMonthLabel(selectedMonth)}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-border/60 rounded-sm px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Labor Cost</p>
            <p className="text-base font-semibold mt-1 tabular-nums">
              {loadingEntries ? "—" : `$${summary.totalLaborCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
          </div>
          <div className="border border-border/60 rounded-sm px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Work Days</p>
            <p className="text-base font-semibold mt-1 tabular-nums">
              {loadingEntries ? "—" : `${summary.totalWorkDays} days`}
            </p>
          </div>
          <div className="border border-border/60 rounded-sm px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Entries</p>
            <p className="text-base font-semibold mt-1 tabular-nums">
              {loadingEntries ? "—" : `${summary.totalEntries} entries`}
            </p>
          </div>
        </div>
      </section>

      {/* List View: month labor log */}
      {view === "list" && (
      <section className="mt-4 border-b border-border/60 pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          {formatMonthLabel(selectedMonth)} · Labor log
        </p>
        {loadingEntries ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-sm border border-border/60 overflow-hidden">
            {datesInMonth.map((dateStr) => {
              const entries = entriesByDate.get(dateStr) ?? [];
              const hasEntries = entries.length > 0;
              const workerCount = new Set(entries.map((e) => e.worker_id)).size;
              const totalPay = entries.reduce((sum, e) => sum + (e.cost_amount ?? 0), 0);
              const isExpanded = expandedDate === dateStr;
              return (
                <div
                  key={dateStr}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedDate((d) => (d === dateStr ? null : dateStr))}
                    className="w-full flex items-center justify-between gap-3 py-2 px-3 text-left text-sm hover:bg-muted/30 transition-colors"
                  >
                    <span className={hasEntries ? "font-medium text-foreground" : "text-muted-foreground"}>
                      {formatShortDate(dateStr)}
                    </span>
                    <span className={hasEntries ? "text-foreground tabular-nums" : "text-muted-foreground"}>
                      {hasEntries
                        ? `${workerCount} worker${workerCount !== 1 ? "s" : ""} · $${totalPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "No entries"}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-muted-foreground transition-transform duration-200",
                        isExpanded && "rotate-90"
                      )}
                      aria-hidden
                    >
                      ▶
                    </span>
                  </button>
                  <div
                    className={cn(
                      "overflow-hidden transition-[max-height] duration-200 ease-out",
                      isExpanded ? "max-h-[2000px]" : "max-h-0"
                    )}
                  >
                    <div className="border-t border-border/60">
                      {entries.length === 0 ? (
                        <p className="py-3 px-3 text-sm text-muted-foreground">
                          No entries. Use &quot;+ Add Entry&quot; to add workers.
                        </p>
                      ) : (
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-border/60">
                              <th className="text-left py-1.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Worker</th>
                              <th className="text-left py-1.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</th>
                              <th className="text-left py-1.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Day Type</th>
                              <th className="text-right py-1.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">OT</th>
                              <th className="text-right py-1.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Total Pay</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map((e) => {
                              const { dayType, otHours } = parseDayTypeAndOt(e.notes);
                              const pay = e.cost_amount != null ? Number(e.cost_amount) : 0;
                              return (
                                <tr key={e.id} className="border-b border-border/30 last:border-b-0">
                                  <td className="py-1.5 px-3 font-medium text-foreground">{e.worker_name ?? "—"}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{e.project_name ?? "—"}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{dayType}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{otHours}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums font-medium">
                                    {pay > 0 ? `$${pay.toFixed(2)}` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Calendar View */}
      {view === "calendar" && (
      <section className="mt-4 border-b border-border/60 pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          {formatMonthLabel(selectedMonth)}
        </p>
        {loadingEntries ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-sm border border-border/60 overflow-hidden">
            <div className="grid grid-cols-7 text-sm">
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className="border-b border-r border-border/60 py-2 px-1 text-center text-xs font-medium text-muted-foreground last:border-r-0"
                >
                  {wd}
                </div>
              ))}
              {getCalendarGrid(selectedMonth).flat().map((day, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[4rem] border-b border-r border-border/60 p-1 last:border-r-0 flex flex-col",
                    day === null && "border-border/30"
                  )}
                >
                  {day === null ? (
                    <span className="invisible">0</span>
                  ) : (() => {
                    const dateStr = `${selectedMonth}-${String(day).padStart(2, "0")}`;
                    const entries = entriesByDate.get(dateStr) ?? [];
                    const hasEntries = entries.length > 0;
                    const workerCount = entries.length;
                    const totalPay = entries.reduce((s, e) => s + (e.cost_amount ?? 0), 0);
                    const isHighCost = totalPay > HIGH_COST_THRESHOLD;
                    return (
                      <button
                        type="button"
                        onClick={() => setSelectedDayForDetail(dateStr)}
                        className={cn(
                          "w-full h-full min-h-[4rem] rounded-sm flex flex-col items-center justify-center gap-0.5 text-left py-1.5 px-1 transition-colors",
                          hasEntries
                            ? isHighCost
                              ? "bg-amber-50 dark:bg-amber-950/30 text-foreground hover:bg-amber-100 dark:hover:bg-amber-950/50"
                              : "bg-background text-foreground hover:bg-muted/30"
                            : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                        )}
                      >
                        <span className="font-medium tabular-nums">{day}</span>
                        {hasEntries ? (
                          <>
                            <span className="text-xs tabular-nums">
                              {workerCount} worker{workerCount !== 1 ? "s" : ""}
                            </span>
                            <span className="text-xs font-medium tabular-nums">
                              ${totalPay.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs">No entries</span>
                        )}
                      </button>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      <QuickTimesheetModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleSaved}
      />

      {/* Day detail (Calendar View) */}
      <Dialog open={!!selectedDayForDetail} onOpenChange={(open) => !open && setSelectedDayForDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col border-border/60 rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {selectedDayForDetail ? formatShortDate(selectedDayForDetail) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto min-h-0 -mx-6 px-6">
            {selectedDayForDetail && (() => {
              const dayEntries = entriesByDate.get(selectedDayForDetail) ?? [];
              if (dayEntries.length === 0) {
                return (
                  <p className="py-4 text-sm text-muted-foreground">
                    No entries for this day.
                  </p>
                );
              }
              return (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Worker</th>
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</th>
                      <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Day Type</th>
                      <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">OT</th>
                      <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Total Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEntries.map((e) => {
                      const { dayType, otHours } = parseDayTypeAndOt(e.notes);
                      const pay = e.cost_amount != null ? Number(e.cost_amount) : 0;
                      return (
                        <tr key={e.id} className="border-b border-border/60 last:border-b-0">
                          <td className="py-2 px-3 font-medium text-foreground">{e.worker_name ?? "—"}</td>
                          <td className="py-2 px-3 text-muted-foreground">{e.project_name ?? "—"}</td>
                          <td className="py-2 px-3 text-muted-foreground">{dayType}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{otHours}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium">
                            {pay > 0 ? `$${pay.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

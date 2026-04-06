"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { FilterBar } from "@/components/filter-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  clearLaborEntry,
  getProjects,
  getLaborEntriesWithJoins,
  getLaborWorkersList,
} from "@/lib/data";
import type { LaborEntryWithJoins } from "@/lib/daily-labor-db";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { useRegisterLaborOpenDailyEntry } from "@/contexts/labor-add-entry-context";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { invalidateDataCache } from "@/lib/client-data-cache";
import { useToast } from "@/components/toast/toast-provider";
import { AddDailyEntryModal as QuickTimesheetModal } from "./add-daily-entry-modal";
import { EditEntryModal, sessionLabel } from "./edit-entry-modal";
import type { LaborSession } from "./edit-entry-modal";
import { Pencil, Trash2 } from "lucide-react";

function sessionBadgeClass(session: LaborSession): string {
  if (session === "morning") return "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60";
  if (session === "afternoon") return "bg-blue-50 text-blue-800 ring-1 ring-blue-200/60";
  return "bg-[#DCFCE7] text-[#166534] ring-1 ring-[#DCFCE7]";
}

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

export default function LaborPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const workerMode =
    pathname === "/labor/daily-entry" && (searchParams.get("mode") ?? "") === "worker";
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = React.useState(initialMonth);
  const { dateFrom: monthStart, dateTo: monthEnd } = getMonthRange(selectedMonth);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [workerFilter, setWorkerFilter] = React.useState<string>("");
  const appliedProjectIdFromUrl = React.useRef(false);
  React.useEffect(() => {
    if (appliedProjectIdFromUrl.current) return;
    const pid = searchParams.get("project_id");
    if (pid) {
      setProjectFilter(pid);
      appliedProjectIdFromUrl.current = true;
    }
  }, [searchParams]);

  /** Mobile FAB: open Add Daily Entry after redirect from quick actions when /labor was not mounted. */
  React.useEffect(() => {
    if (searchParams.get("addDaily") !== "1") return;
    let shouldOpen = false;
    try {
      shouldOpen = window.sessionStorage.getItem("hh.openLaborEntryFromFab") === "1";
      window.sessionStorage.removeItem("hh.openLaborEntryFromFab");
    } catch {
      shouldOpen = false;
    }
    if (!shouldOpen) return;
    setModalOpen(true);
    router.replace("/labor", { scroll: false });
  }, [searchParams, router]);
  const workerModeAutoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    const mode = (searchParams.get("mode") ?? "").toLowerCase();
    const autoOpenKey = "hh.worker-daily-entry-auto-opened";
    if (pathname !== "/labor/daily-entry" || mode !== "worker") {
      try {
        window.sessionStorage.removeItem(autoOpenKey);
      } catch {
        // ignore storage errors
      }
      return;
    }
    if (workerModeAutoOpenedRef.current) return;
    try {
      if (window.sessionStorage.getItem(autoOpenKey) === "1") return;
    } catch {
      // ignore storage errors
    }
    setModalOpen(true);
    workerModeAutoOpenedRef.current = true;
    try {
      window.sessionStorage.setItem(autoOpenKey, "1");
    } catch {
      // ignore storage errors
    }
  }, [pathname, searchParams]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [workers, setWorkers] = React.useState<{ id: string; name: string }[]>([]);
  const [monthEntries, setMonthEntries] = React.useState<LaborEntryWithJoins[]>([]);
  const monthEntriesRef = React.useRef(monthEntries);
  monthEntriesRef.current = monthEntries;
  const [loadingProjects, setLoadingProjects] = React.useState(true);
  const [loadingEntries, setLoadingEntries] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const openAddEntryModal = React.useCallback(() => setModalOpen(true), []);
  useRegisterLaborOpenDailyEntry(openAddEntryModal);
  const [expandedDate, setExpandedDate] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"list" | "calendar">("list");
  const [selectedDayForDetail, setSelectedDayForDetail] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LaborEntryWithJoins | null>(null);

  const sessionFromFlags = React.useCallback((e: LaborEntryWithJoins): LaborSession => {
    const m = (e as any).morning === true;
    const a = (e as any).afternoon === true;
    if (m && a) return "full_day";
    if (m && !a) return "morning";
    if (!m && a) return "afternoon";
    return "full_day";
  }, []);

  const openEdit = React.useCallback((e: LaborEntryWithJoins) => {
    setEditing(e);
    setEditOpen(true);
  }, []);

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

  const loadWorkers = React.useCallback(async () => {
    try {
      const list = await getLaborWorkersList();
      setWorkers(list ?? []);
    } catch {
      setWorkers([]);
    }
  }, []);

  const loadMonthEntries = React.useCallback(async () => {
    setLoadingEntries(true);
    try {
      const list = await getLaborEntriesWithJoins({
        date_from: monthStart,
        date_to: monthEnd,
        project_id: projectFilter || undefined,
        worker_id: workerFilter || undefined,
      });
      setMonthEntries(list);
    } catch {
      setMonthEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [monthStart, monthEnd, projectFilter, workerFilter]);

  React.useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  React.useEffect(() => {
    void loadMonthEntries();
  }, [loadMonthEntries]);

  useOnAppSync(
    React.useCallback(() => {
      invalidateDataCache("data:");
      void loadMonthEntries();
      void loadProjects();
      void loadWorkers();
    }, [loadMonthEntries, loadProjects, loadWorkers]),
    [loadMonthEntries, loadProjects, loadWorkers]
  );

  const handleSaved = React.useCallback(() => {
    setMessage("Entries saved.");
    setError(null);
    toast({ title: "Entry saved successfully", variant: "success" });
    void loadMonthEntries();
  }, [loadMonthEntries, toast]);

  const handleDelete = React.useCallback(
    async (e: LaborEntryWithJoins) => {
      if (workerMode) {
        toast({
          title: "Delete is disabled in worker link",
          description: "Please use the main Labor page to delete entries.",
          variant: "error",
        });
        return;
      }
      const ok = window.confirm(
        `Delete entry for ${e.worker_name ?? "worker"} on ${e.work_date?.slice(0, 10) ?? "date"}?`
      );
      if (!ok) return;
      const snapshot = monthEntriesRef.current;
      setMonthEntries((prev) => prev.filter((x) => x.id !== e.id));
      setMessage("Entry deleted.");
      setError(null);
      try {
        await clearLaborEntry(e.id);
        void loadMonthEntries();
      } catch (err) {
        setMonthEntries(snapshot);
        setMessage(null);
        setError(err instanceof Error ? err.message : "Failed to delete.");
      }
    },
    [loadMonthEntries, toast, workerMode]
  );

  const summary = React.useMemo(() => {
    const totalLaborCost = monthEntries.reduce((sum, e) => sum + (e.cost_amount ?? 0), 0);
    const uniqueDates = new Set(monthEntries.map((e) => e.work_date?.slice(0, 10)).filter(Boolean));
    return {
      totalLaborCost,
      totalWorkDays: uniqueDates.size,
      totalEntries: monthEntries.length,
    };
  }, [monthEntries]);

  /** Labor cost per project for selected month (group by project_id, sum amount). Sorted by highest cost. */
  const projectLaborCost = React.useMemo(() => {
    const byProject = new Map<string, { id: string; name: string; total: number }>();
    for (const e of monthEntries) {
      const pid = e.project_id ?? "__none__";
      const name = e.project_name ?? "No project";
      const amount = e.cost_amount ?? 0;
      const cur = byProject.get(pid);
      if (cur) {
        cur.total += amount;
      } else {
        byProject.set(pid, { id: pid, name, total: amount });
      }
    }
    return Array.from(byProject.values())
      .filter((v) => v.total > 0)
      .sort((a, b) => b.total - a.total);
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
      <PageHeader title="Labor" subtitle="Daily labor entries by worker and project." />
      <FilterBar className="!flex-col !items-stretch gap-4 border-0 bg-transparent p-0 shadow-none dark:bg-transparent">
        <div className="flex w-full flex-wrap items-end gap-4">
          <div className="flex min-w-[140px] flex-1 flex-col gap-1 sm:min-w-[160px] sm:flex-initial">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Month
            </label>
            <Select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setExpandedDate(null);
                setSelectedDayForDetail(null);
              }}
              className="h-9 min-h-[44px] min-w-0 sm:min-h-9 sm:w-[200px]"
            >
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-[140px] flex-1 flex-col gap-1 sm:min-w-[180px] sm:flex-initial">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Project
            </label>
            <Select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setExpandedDate(null);
              }}
              className="h-9 min-h-[44px] min-w-0 sm:min-h-9 sm:w-[220px]"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-[140px] flex-1 flex-col gap-1 sm:min-w-[180px] sm:flex-initial">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Worker
            </label>
            <Select
              value={workerFilter}
              onChange={(e) => {
                setWorkerFilter(e.target.value);
                setExpandedDate(null);
              }}
              className="h-9 min-h-[44px] min-w-0 sm:min-h-9 sm:w-[220px]"
            >
              <option value="">All Workers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-300 pt-3 dark:border-border">
          <Button
            size="sm"
            className="rounded-sm h-9"
            onClick={() => setModalOpen(true)}
            disabled={loadingProjects}
          >
            + Add Entry
          </Button>
          <div className="flex h-9 shrink-0 overflow-hidden rounded-lg border border-gray-300 shadow-sm dark:border-border">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "h-full px-3 text-xs font-medium transition-all duration-150",
                view === "list"
                  ? "bg-[#111827] text-white dark:bg-foreground dark:text-background"
                  : "bg-white text-text-secondary hover:bg-[#F9FAFB] hover:text-text-primary dark:bg-card dark:hover:bg-muted"
              )}
            >
              List View
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "h-full border-l border-gray-300 px-3 text-xs font-medium transition-all duration-150 dark:border-border",
                view === "calendar"
                  ? "bg-[#111827] text-white dark:bg-foreground dark:text-background"
                  : "bg-white text-text-secondary hover:bg-[#F9FAFB] hover:text-text-primary dark:bg-card dark:hover:bg-muted"
              )}
            >
              Calendar View
            </button>
          </div>
        </div>
      </FilterBar>

      {error ? <p className="py-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="py-3 text-sm text-muted-foreground">{message}</p> : null}

      {/* Monthly Summary */}
      <section className="border-b border-border/60 pb-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
          Monthly Summary · {formatMonthLabel(selectedMonth)}
        </p>
        <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-border dark:bg-card dark:shadow-none">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            <div className="border-b border-gray-300 px-3 py-2.5 sm:border-b-0 sm:border-r sm:border-gray-300 dark:border-border">
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-widest">
                Total Labor Cost
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                $
                {summary.totalLaborCost.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div className="border-b border-gray-300 px-3 py-2.5 sm:border-b-0 sm:border-r sm:border-gray-300 dark:border-border">
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-widest">
                Work Days
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.totalWorkDays.toLocaleString("en-US")}
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-widest">
                Entries
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.totalEntries.toLocaleString("en-US")}
              </p>
            </div>
          </div>
        </div>

        {/* PROJECT LABOR COST — labor cost per project for selected month, sorted by highest */}
        {projectLaborCost.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              PROJECT LABOR COST
            </p>
            <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-border dark:bg-card dark:shadow-none">
              {projectLaborCost.map(({ id, name, total }) => (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 border-b border-gray-300 px-2.5 py-2.5 last:border-b-0 hover:bg-[#F9FAFB] dark:border-border dark:hover:bg-muted/40"
                >
                  <span className="text-sm font-medium text-foreground truncate">{name}</span>
                  <span className="text-sm tabular-nums font-medium text-foreground shrink-0">
                    $
                    {total.toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* List View */}
      {view === "list" && (
        <section className="mt-4 border-b border-border/60 pb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Daily entries · {formatMonthLabel(selectedMonth)}
          </p>
          {loadingEntries ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : datesInMonth.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No dates.</p>
          ) : datesInMonth.filter((d) => (entriesByDate.get(d) ?? []).length > 0).length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground/70">No entries for this month.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-sm border border-border/70 overflow-hidden">
              {datesInMonth
                .filter((d) => (entriesByDate.get(d) ?? []).length > 0)
                .map((date) => {
                  const entries = entriesByDate.get(date) ?? [];
                  const totalPay = entries.reduce((s, e) => s + (e.cost_amount ?? 0), 0);
                  const isHighCost = totalPay > HIGH_COST_THRESHOLD;
                  const isExpanded = expandedDate === date;
                  return (
                    <div key={date}>
                      <button
                        type="button"
                        onClick={() => setExpandedDate((prev) => (prev === date ? null : date))}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-none px-3 py-2 text-left transition-all duration-150 ease-out hover:-translate-y-px bg-gray-50 hover:bg-gray-100 active:scale-[0.99] active:duration-100 dark:bg-muted/20 dark:hover:bg-muted/40",
                          isExpanded && "bg-gray-100 dark:bg-muted/40"
                        )}
                      >
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span className="text-[15px] font-semibold text-foreground shrink-0">
                            {formatShortDate(date)}
                          </span>
                          <span className="text-xs text-muted-foreground/80 truncate">
                            {entries.length} entries
                          </span>
                          <span
                            className={cn(
                              "ml-auto text-sm font-semibold tabular-nums shrink-0",
                              isHighCost ? "text-amber-700" : "text-hh-profit-positive"
                            )}
                          >
                            $
                            {totalPay.toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-muted-foreground transition-transform duration-200 text-xs",
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
                        <div className="border-t border-border/60 bg-background">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-border/60">
                                <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                                  Worker
                                </th>
                                <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                                  Project
                                </th>
                                <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                                  Session
                                </th>
                                <th className="text-right py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 tabular-nums">
                                  Total Pay
                                </th>
                                <th className="w-[84px] py-2 px-3" />
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map((e) => {
                                const pay = e.cost_amount != null ? Number(e.cost_amount) : 0;
                                const session = sessionFromFlags(e);
                                return (
                                  <tr
                                    key={e.id}
                                    className={cn(
                                      listTableRowStaticClassName,
                                      "border-b border-border/30 last:border-b-0"
                                    )}
                                  >
                                    <td className="py-2 px-3 font-semibold text-foreground">
                                      {e.worker_name ?? "—"}
                                    </td>
                                    <td className="py-2 px-3 text-muted-foreground/80">
                                      {e.project_name ?? "—"}
                                    </td>
                                    <td className="py-2 px-3">
                                      <span
                                        className={cn(
                                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                          sessionBadgeClass(session)
                                        )}
                                      >
                                        {sessionLabel(session)}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums font-semibold">
                                      {pay > 0 ? `$${pay.toFixed(2)}` : "—"}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          className="h-8 w-8 inline-flex items-center justify-center rounded-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50/60"
                                          onClick={() => openEdit(e)}
                                          aria-label="Edit"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          className="h-8 w-8 inline-flex items-center justify-center rounded-sm text-red-600 hover:text-red-700 hover:bg-red-50/60"
                                          onClick={() => void handleDelete(e)}
                                          aria-label="Delete"
                                          disabled={workerMode}
                                          title={
                                            workerMode
                                              ? "Delete is available only on the main Labor page."
                                              : "Delete entry"
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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
                {getCalendarGrid(selectedMonth)
                  .flat()
                  .map((day, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "min-h-[4rem] border-b border-r border-border/60 p-1 last:border-r-0 flex flex-col",
                        day === null && "border-border/30"
                      )}
                    >
                      {day === null ? (
                        <span className="invisible">0</span>
                      ) : (
                        (() => {
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
                                    $
                                    {totalPay.toLocaleString("en-US", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs">No entries</span>
                              )}
                            </button>
                          );
                        })()
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}

      <QuickTimesheetModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={handleSaved} />

      <EditEntryModal
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
        entry={editing}
        projects={projects}
        onSaved={handleSaved}
      />

      {/* Day detail (Calendar View) */}
      <Dialog
        open={!!selectedDayForDetail}
        onOpenChange={(open) => !open && setSelectedDayForDetail(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col border-border/60 rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {selectedDayForDetail ? formatShortDate(selectedDayForDetail) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto min-h-0 -mx-6 px-6">
            {selectedDayForDetail &&
              (() => {
                const dayEntries = entriesByDate.get(selectedDayForDetail) ?? [];
                if (dayEntries.length === 0) {
                  return (
                    <p className="py-4 text-sm text-muted-foreground">No entries for this day.</p>
                  );
                }
                return (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                          Worker
                        </th>
                        <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                          Project
                        </th>
                        <th className="text-left py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                          Session
                        </th>
                        <th className="text-right py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 tabular-nums">
                          OT
                        </th>
                        <th className="text-right py-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 tabular-nums">
                          Total Pay
                        </th>
                        <th className="w-[84px] py-2 px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {dayEntries.map((e) => {
                        const { otHours } = parseDayTypeAndOt(e.notes);
                        const pay = e.cost_amount != null ? Number(e.cost_amount) : 0;
                        const session = sessionFromFlags(e);
                        return (
                          <tr
                            key={e.id}
                            className={cn(
                              listTableRowStaticClassName,
                              "border-b border-border/60 last:border-b-0"
                            )}
                          >
                            <td className="py-2 px-3 font-semibold text-foreground">
                              {e.worker_name ?? "—"}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground/80">
                              {e.project_name ?? "—"}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                  sessionBadgeClass(session)
                                )}
                              >
                                {sessionLabel(session)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                              {otHours}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums font-semibold">
                              {pay > 0 ? `$${pay.toFixed(2)}` : "—"}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50/60"
                                  onClick={() => openEdit(e)}
                                  aria-label="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-sm text-red-600 hover:text-red-700 hover:bg-red-50/60"
                                  onClick={() => void handleDelete(e)}
                                  aria-label="Delete"
                                  disabled={workerMode}
                                  title={
                                    workerMode
                                      ? "Delete is available only on the main Labor page."
                                      : "Delete entry"
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
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

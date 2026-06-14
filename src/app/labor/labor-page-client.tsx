"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MobileFabPlus,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { NeoAmount, NeoToolbar } from "@/components/base";
import { type LaborEntryWithJoins } from "@/lib/daily-labor-db";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { useRegisterLaborOpenDailyEntry } from "@/contexts/labor-add-entry-context";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { invalidateDataCache } from "@/lib/client-data-cache";
import { useToast } from "@/components/toast/toast-provider";
import {
  AddDailyEntryModal as QuickTimesheetModal,
  type DailyEntrySaveResult,
} from "./add-daily-entry-modal";
import { EditEntryModal, sessionLabel } from "./edit-entry-modal";
import type { LaborSession } from "./edit-entry-modal";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
  WalletCards,
} from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate, formatInteger, formatNumber } from "@/lib/formatters";
import { encodeWorkerReturnPath } from "@/lib/worker-return-path";

function monthAdd(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sessionBadgeClass(session: LaborSession): string {
  if (session === "morning") return "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60";
  if (session === "afternoon") return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/70";
  return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70";
}

const timeShell =
  "rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)] md:rounded-xl";

const timeKpiTile =
  "rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)] md:rounded-xl";

const timeKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[var(--neo-text-secondary)] md:h-8 md:w-8";

const timeSegmentedShell =
  "relative flex h-10 min-h-[44px] shrink-0 items-center rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] p-0.5 shadow-[var(--neo-shadow-panel)] backdrop-blur";

const timeSegmentedPill =
  "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[6px] bg-[var(--neo-gold)] shadow-[0_6px_18px_rgba(184,137,45,0.18)] transition-transform duration-200 ease-out";

const timeSegmentedButton =
  "relative z-10 flex h-full w-1/2 items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-medium transition-colors duration-200";

const calendarControlButton =
  "h-9 min-h-[44px] rounded-md border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 text-[13px] text-[var(--neo-text-primary)] shadow-none hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-hover)] focus-visible:ring-[var(--neo-gold-ring)] md:min-h-9";

const calendarIconButton =
  "h-9 w-9 min-h-[44px] min-w-[44px] rounded-md border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-secondary)] shadow-none hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-hover)] hover:text-[var(--neo-text-primary)] focus-visible:ring-[var(--neo-gold-ring)] md:min-h-9 md:min-w-9";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HIGH_COST_THRESHOLD = 1000;

function parseDayTypeAndOt(notes: string | null): {
  dayType: string;
  otHours: string;
  otAmount: string;
} {
  const defaultDay = "—";
  const defaultOt = "—";
  if (!notes?.trim()) return { dayType: defaultDay, otHours: defaultOt, otAmount: defaultOt };
  const dayMatch = /day_type=(\w+)/.exec(notes);
  const otMatch = /ot_hours=([\d.]+)/.exec(notes);
  const otAmountMatch = /ot_amount=([\d.]+)/.exec(notes);
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
    otAmount: otAmountMatch ? formatCurrency(Number(otAmountMatch[1]) || 0) : defaultOt,
  };
}

function hasFixedOvertimeAmount(notes: string | null): boolean {
  const match = /ot_amount=([\d.]+)/i.exec(notes ?? "");
  return match ? Number(match[1]) > 0 : false;
}

function sessionLabelWithOvertime(session: LaborSession, notes: string | null): string {
  return hasFixedOvertimeAmount(notes) ? `${sessionLabel(session)} + OT` : sessionLabel(session);
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
  return formatDate(date, "month");
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
  return formatDate(dateStr, "compact");
}

function formatLaborDaysLabel(days: number, options: { compact?: boolean } = {}): string {
  const value = formatNumber(days, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  if (options.compact) return `${value}d`;
  return `${value} ${days === 1 ? "day" : "days"}`;
}

function getWorkerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join("").toUpperCase();
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
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

type LaborProjectOption = { id: string; name: string };
type LaborWorkerOption = { id: string; name: string };
type LaborEntriesResponse = {
  message?: string;
  entries?: LaborEntryWithJoins[];
  projects?: LaborProjectOption[];
  workers?: LaborWorkerOption[];
};

export default function LaborPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const workerMode =
    pathname === "/labor/daily-entry" && (searchParams.get("mode") ?? "") === "worker";
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const initialMonthFromUrl = searchParams.get("month");
  const [selectedMonth, setSelectedMonth] = React.useState(
    initialMonthFromUrl && /^\d{4}-\d{2}$/.test(initialMonthFromUrl)
      ? initialMonthFromUrl
      : initialMonth
  );
  const { dateFrom: monthStart, dateTo: monthEnd } = getMonthRange(selectedMonth);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [workerFilter, setWorkerFilter] = React.useState<string>("");
  const appliedProjectIdFromUrl = React.useRef(false);
  const appliedWorkerIdFromUrl = React.useRef(false);
  React.useEffect(() => {
    if (appliedProjectIdFromUrl.current) return;
    const pid = searchParams.get("project_id");
    if (pid) {
      setProjectFilter(pid);
      appliedProjectIdFromUrl.current = true;
    }
  }, [searchParams]);
  React.useEffect(() => {
    if (appliedWorkerIdFromUrl.current) return;
    const workerId = searchParams.get("workerId");
    if (workerId) {
      setWorkerFilter(workerId);
      appliedWorkerIdFromUrl.current = true;
    }
  }, [searchParams]);
  React.useEffect(() => {
    const month = searchParams.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      setSelectedMonth(month);
    }
  }, [searchParams]);

  /** Mobile FAB: open Add Daily Entry after redirect from quick actions when /labor was not mounted. */
  React.useEffect(() => {
    if (searchParams.get("addDaily") !== "1") return;
    try {
      window.sessionStorage.removeItem("hh.openLaborEntryFromFab");
    } catch {
      // ignore storage errors
    }
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
  const [projects, setProjects] = React.useState<LaborProjectOption[]>([]);
  const [workers, setWorkers] = React.useState<LaborWorkerOption[]>([]);
  const [monthEntries, setMonthEntries] = React.useState<LaborEntryWithJoins[]>([]);
  const monthEntriesRef = React.useRef(monthEntries);
  const entriesLoadSeqRef = React.useRef(0);
  monthEntriesRef.current = monthEntries;
  const [loadingProjects, setLoadingProjects] = React.useState(true);
  const [loadingEntries, setLoadingEntries] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastSavedEntry, setLastSavedEntry] = React.useState<DailyEntrySaveResult | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const openAddEntryModal = React.useCallback(() => setModalOpen(true), []);
  useRegisterLaborOpenDailyEntry(openAddEntryModal);
  const [expandedDate, setExpandedDate] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"list" | "calendar">("list");
  const [selectedDayForDetail, setSelectedDayForDetail] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LaborEntryWithJoins | null>(null);
  const todayYmd = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const sessionFromFlags = React.useCallback((e: LaborEntryWithJoins): LaborSession => {
    const flags = e as LaborEntryWithJoins & { morning?: unknown; afternoon?: unknown };
    const m = flags.morning === true;
    const a = flags.afternoon === true;
    if (m && a) return "full_day";
    if (m && !a) return "morning";
    if (!m && a) return "afternoon";
    return "full_day";
  }, []);

  const openEdit = React.useCallback((e: LaborEntryWithJoins) => {
    setEditing(e);
    setEditOpen(true);
  }, []);

  const loadMonthEntries = React.useCallback(async () => {
    const seq = entriesLoadSeqRef.current + 1;
    entriesLoadSeqRef.current = seq;
    setLoadingEntries(true);
    setLoadingProjects(true);
    try {
      const params = new URLSearchParams({
        view: "joined",
        dateFrom: monthStart,
        dateTo: monthEnd,
      });
      if (projectFilter) params.set("projectId", projectFilter);
      if (workerFilter) params.set("workerId", workerFilter);
      const response = await fetch(`/api/labor/entries?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as LaborEntriesResponse;
      if (!response.ok) throw new Error(body.message ?? "Failed to load labor entries.");
      if (entriesLoadSeqRef.current !== seq) return;
      setMonthEntries(body.entries ?? []);
      setProjects(body.projects ?? []);
      setWorkers(body.workers ?? []);
      setError(null);
    } catch (e) {
      if (entriesLoadSeqRef.current !== seq) return;
      setMonthEntries([]);
      setError(e instanceof Error ? e.message : "Failed to load labor entries.");
    } finally {
      if (entriesLoadSeqRef.current === seq) {
        setLoadingEntries(false);
        setLoadingProjects(false);
      }
    }
  }, [monthStart, monthEnd, projectFilter, workerFilter]);

  React.useEffect(() => {
    void loadMonthEntries();
  }, [loadMonthEntries]);

  useOnAppSync(
    React.useCallback(() => {
      invalidateDataCache("data:");
      void loadMonthEntries();
    }, [loadMonthEntries]),
    [loadMonthEntries]
  );

  const handleSaved = React.useCallback(
    (saved?: DailyEntrySaveResult | string) => {
      const savedDate = typeof saved === "string" ? saved : saved?.workDate;
      if (saved && typeof saved !== "string" && saved.workerId) {
        setLastSavedEntry(saved);
      }
      setMessage("Entries saved.");
      setError(null);
      toast({ title: "Entry saved successfully", variant: "success" });
      const savedMonth = String(savedDate ?? "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(savedMonth) && savedMonth !== selectedMonth) {
        setSelectedMonth(savedMonth);
        return;
      }
      void loadMonthEntries();
    },
    [loadMonthEntries, selectedMonth, toast]
  );

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
        const response = await fetch(`/api/labor/entries?id=${encodeURIComponent(e.id)}`, {
          method: "DELETE",
        });
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) throw new Error(body.message ?? "Failed to delete.");
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

  const calendarEntryDates = React.useMemo(
    () => datesInMonth.filter((date) => (entriesByDate.get(date) ?? []).length > 0),
    [datesInMonth, entriesByDate]
  );

  return (
    <div
      className={cn(
        "dark neo-page-on-graphite min-w-0 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[var(--neo-canvas-text-secondary)]",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "neo-page-on-graphite page-shell-wide mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-2 px-4 py-2 pb-4 sm:max-w-[460px] md:gap-2 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass,
          "max-md:!gap-2"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-white/10 pb-3 lg:items-baseline lg:gap-x-4 [&_h1]:!text-[24px] [&_h1]:!font-semibold [&_h1]:!leading-none [&_h1]:!tracking-normal [&_h1]:!text-[var(--neo-canvas-text-primary)] [&_p]:!mt-1 [&_p]:!max-w-xl [&_p]:!text-[14px] [&_p]:!leading-snug [&_p]:!text-[var(--neo-canvas-text-secondary)]"
            title="Daily Labor"
            subtitle="Track and manage daily labor entries by worker and project."
            actions={
              <Button
                size="sm"
                className="h-9 shrink-0 gap-1.5 border-transparent bg-[var(--neo-gold)] text-zinc-950 shadow-none hover:bg-[var(--neo-gold-soft)]"
                onClick={() => setModalOpen(true)}
                disabled={loadingProjects}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Entry
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Labor"
          fab={<MobileFabPlus href="/labor?addDaily=1" ariaLabel="Add entry" />}
        />

        <div className={cn(timeShell, "p-3 md:p-3")}>
          <NeoToolbar className="!flex-col !items-stretch gap-3 border-0 bg-transparent p-0 shadow-none dark:bg-transparent">
            <div className="flex w-full flex-wrap items-end gap-3 md:flex-nowrap">
              <div className="flex min-w-[160px] flex-1 flex-col gap-1 sm:flex-initial">
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
                  className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[200px]"
                >
                  {MONTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
                <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                  Project
                </label>
                <Select
                  value={projectFilter}
                  onChange={(e) => {
                    setProjectFilter(e.target.value);
                    setExpandedDate(null);
                  }}
                  className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[220px]"
                >
                  <option value="">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
                <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                  Worker
                </label>
                <Select
                  value={workerFilter}
                  onChange={(e) => {
                    setWorkerFilter(e.target.value);
                    setExpandedDate(null);
                  }}
                  className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[220px]"
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100/80 pt-3 dark:border-border/60">
              <div className={cn(timeSegmentedShell, "w-full sm:w-[260px]")}>
                <span
                  aria-hidden
                  className={cn(
                    timeSegmentedPill,
                    view === "calendar" && "translate-x-[calc(100%+2px)]"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={cn(
                    timeSegmentedButton,
                    view === "list"
                      ? "text-zinc-950"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ListOrdered className="h-3.5 w-3.5" aria-hidden />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setView("calendar")}
                  className={cn(
                    timeSegmentedButton,
                    view === "calendar"
                      ? "text-zinc-950"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  Calendar
                </button>
              </div>
            </div>
          </NeoToolbar>
        </div>

        {error ? <p className="py-3 text-sm text-red-600">{error}</p> : null}
        {message ? <p className="py-3 text-sm text-muted-foreground">{message}</p> : null}
        {lastSavedEntry ? (
          <div
            data-testid="daily-entry-next-actions"
            className={cn(
              "mb-4 flex flex-col gap-3 rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 py-3 shadow-[var(--neo-shadow-panel)]",
              "sm:flex-row sm:items-center sm:justify-between"
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--neo-text-primary)]">
                  Entry saved
                </p>
                <p className="truncate text-xs text-[var(--neo-text-secondary)]">
                  {lastSavedEntry.workerName}
                  {lastSavedEntry.rowCount > 1 ? ` + ${lastSavedEntry.rowCount - 1} more` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px] rounded-[0.625rem]"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Add Another
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="min-h-[40px] rounded-[0.625rem]"
              >
                <Link href={`/workers/${encodeURIComponent(lastSavedEntry.workerId)}`}>
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                  Open Worker
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="min-h-[40px] rounded-[0.625rem] bg-[var(--neo-gold)] text-zinc-950 hover:bg-[var(--neo-gold-soft)]"
              >
                <Link
                  href={`/labor/workers/${encodeURIComponent(
                    lastSavedEntry.workerId
                  )}/balance?returnTo=${encodeWorkerReturnPath(lastSavedEntry.workerId, "payments")}`}
                >
                  <WalletCards className="mr-2 h-4 w-4" aria-hidden />
                  Pay Worker
                </Link>
              </Button>
            </div>
          </div>
        ) : null}

        {/* Monthly Summary */}
        <section className="border-b border-border/60 pb-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
            Monthly Summary · {formatMonthLabel(selectedMonth)}
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:gap-2">
            <div
              className={cn(
                timeKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(timeKpiIcon, "mt-0.5 md:mt-0")}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Total labor cost
                </p>
                <NeoAmount className="mt-0.5 block truncate text-base leading-none md:text-xl">
                  {formatCurrency(summary.totalLaborCost)}
                </NeoAmount>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">This month</p>
              </div>
            </div>
            <div
              className={cn(
                timeKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(timeKpiIcon, "mt-0.5 md:mt-0")}>
                <CalendarDays
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Work days
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatInteger(summary.totalWorkDays)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Unique dates</p>
              </div>
            </div>
            <div
              className={cn(
                timeKpiTile,
                "col-span-2 flex min-h-[48px] items-start gap-1.5 px-2 py-2 sm:col-span-1 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(timeKpiIcon, "mt-0.5 md:mt-0")}>
                <ListOrdered className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Entries
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatInteger(summary.totalEntries)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Recorded</p>
              </div>
            </div>
          </div>

          {/* PROJECT LABOR COST — labor cost per project for selected month, sorted by highest */}
          {projectLaborCost.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/60">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                PROJECT LABOR COST
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm dark:border-border dark:bg-card dark:shadow-none">
                {projectLaborCost.map(({ id, name, total }) => (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 px-2.5 py-2.5 last:border-b-0 hover:bg-[#F9FAFB] dark:border-border dark:hover:bg-muted/40"
                  >
                    <span className="text-sm font-medium text-foreground truncate">{name}</span>
                    <NeoAmount className="shrink-0 text-sm">{formatCurrency(total)}</NeoAmount>
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
              <div className={cn(timeShell, "px-4 py-8 text-center")}>
                <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-zinc-50/80 text-zinc-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
                  <Clock className="h-5 w-5" aria-hidden />
                </span>
                <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                  No labor entries this month
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a labor entry to track worker time and project labor cost.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 h-9 rounded-sm shadow-none"
                  onClick={() => setModalOpen(true)}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
                  Add entry
                </Button>
              </div>
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
                            "flex w-full items-center justify-between gap-3 rounded-none px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-muted/25 active:bg-muted/40 dark:hover:bg-muted/25",
                            isExpanded && "bg-muted/25"
                          )}
                        >
                          <div className="flex items-baseline gap-3 min-w-0">
                            <span className="text-[15px] font-semibold text-foreground shrink-0">
                              {formatShortDate(date)}
                            </span>
                            <span className="text-xs text-muted-foreground/80 truncate">
                              {entries.length} entries
                            </span>
                            <NeoAmount
                              tone={isHighCost ? "expense" : "income"}
                              className="ml-auto shrink-0 text-sm"
                            >
                              {formatCurrency(totalPay)}
                            </NeoAmount>
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
                            <div className="overflow-x-auto">
                              <table className="hidden w-full min-w-[480px] border-collapse text-sm md:table">
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
                                            {sessionLabelWithOvertime(session, e.notes)}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                          <NeoAmount>
                                            {pay > 0 ? formatCurrency(pay) : "—"}
                                          </NeoAmount>
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              className="h-8 w-8 inline-flex items-center justify-center rounded-sm text-emerald-700 hover:bg-emerald-50/60 hover:text-emerald-800"
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

                              <div className="flex flex-col divide-y divide-border/60 md:hidden">
                                {entries.map((e) => {
                                  const pay = e.cost_amount != null ? Number(e.cost_amount) : 0;
                                  const session = sessionFromFlags(e);
                                  return (
                                    <div key={e.id} className="px-3 py-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-foreground truncate">
                                              {e.worker_name ?? "—"}
                                            </span>
                                            <span
                                              className={cn(
                                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                                sessionBadgeClass(session)
                                              )}
                                            >
                                              {sessionLabelWithOvertime(session, e.notes)}
                                            </span>
                                          </div>
                                          <div className="mt-0.5 text-xs text-muted-foreground truncate">
                                            {e.project_name ?? "—"}
                                          </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                          <div className="text-sm font-semibold tabular-nums text-foreground">
                                            {pay > 0 ? `$${pay.toFixed(2)}` : "—"}
                                          </div>
                                          <div className="mt-1 flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-border/70 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground active:scale-[0.98]"
                                              onClick={() => openEdit(e)}
                                              aria-label="Edit"
                                            >
                                              <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-border/70 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-destructive active:scale-[0.98]"
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
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
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
          <section className="mt-6 pb-4 md:mt-7">
            <div className="overflow-hidden rounded-2xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]">
              <div className="flex flex-col gap-3 border-b border-[var(--neo-border)] px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                    Daily Labor Calendar
                  </p>
                  <h2 className="mt-1 truncate text-[20px] font-semibold leading-none tracking-normal text-[var(--neo-text-primary)] md:text-[22px]">
                    {formatMonthLabel(selectedMonth)}
                  </h2>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={calendarControlButton}
                    onClick={() => {
                      setSelectedMonth(initialMonth);
                      setExpandedDate(null);
                      setSelectedDayForDetail(null);
                    }}
                  >
                    Today
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={calendarIconButton}
                      onClick={() => {
                        setSelectedMonth((m) => monthAdd(m, -1));
                        setExpandedDate(null);
                        setSelectedDayForDetail(null);
                      }}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={calendarIconButton}
                      onClick={() => {
                        setSelectedMonth((m) => monthAdd(m, 1));
                        setExpandedDate(null);
                        setSelectedDayForDetail(null);
                      }}
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>

              {loadingEntries ? (
                <p className="px-4 py-6 text-sm text-[var(--neo-text-secondary)]">Loading…</p>
              ) : (
                <>
                  <div className="hidden px-3 pb-3 pt-4 md:block md:px-5 md:pb-5">
                    <div className="overflow-hidden rounded-[18px] border border-[var(--neo-border)] bg-[var(--neo-border)]">
                      <div className="grid grid-cols-7 bg-[var(--neo-surface-muted)]">
                        {WEEKDAYS.map((wd) => (
                          <div
                            key={wd}
                            className="border-r border-[var(--neo-border)] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)] last:border-r-0"
                          >
                            {wd}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-px bg-[var(--neo-border)]">
                        {getCalendarGrid(selectedMonth)
                          .flat()
                          .map((day, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "min-h-[136px] bg-[var(--neo-surface-raised)] p-1.5 lg:min-h-[148px]",
                                day === null && "bg-[var(--neo-surface-muted)]"
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
                                  const totalPay = entries.reduce(
                                    (s, e) => s + (e.cost_amount ?? 0),
                                    0
                                  );
                                  const isHighCost = totalPay > HIGH_COST_THRESHOLD;
                                  const totalLaborDays = entries.reduce(
                                    (s, e) => s + (Number(e.hours) || 0),
                                    0
                                  );
                                  const isToday = dateStr === todayYmd;
                                  const crewPreview = entries
                                    .map((e) => (e.worker_name ?? "").trim())
                                    .filter(Boolean)
                                    .slice(0, 3)
                                    .map((name) => ({
                                      name,
                                      initials: getWorkerInitials(name),
                                    }));
                                  const workerLabel =
                                    workerCount === 1 ? "1 worker" : `${workerCount} workers`;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDayForDetail(dateStr)}
                                      aria-label={
                                        hasEntries
                                          ? `${formatShortDate(dateStr)}, ${formatLaborDaysLabel(
                                              totalLaborDays
                                            )}, ${formatCurrency(totalPay)}, ${workerLabel}`
                                          : `${formatShortDate(dateStr)}, no labor entries`
                                      }
                                      className={cn(
                                        "group relative flex h-full min-h-[124px] w-full flex-col overflow-hidden rounded-[14px] border px-3 py-2.5 text-left transition-[background,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none lg:min-h-[136px]",
                                        hasEntries
                                          ? "border-[var(--neo-border)] bg-[rgb(255_255_255_/_0.025)] text-[var(--neo-text-primary)] shadow-[0_1px_0_rgb(255_255_255_/_0.035)_inset] hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-hover)]"
                                          : "border-transparent bg-transparent text-[var(--neo-text-secondary)] hover:bg-[var(--neo-surface-muted)]",
                                        isToday &&
                                          "border-[rgb(184_147_90_/_0.38)] bg-[rgb(184_147_90_/_0.06)] ring-1 ring-inset ring-[rgb(184_147_90_/_0.18)]"
                                      )}
                                    >
                                      {hasEntries ? (
                                        <span
                                          aria-hidden
                                          className={cn(
                                            "absolute left-0 top-3 h-10 w-[2px] rounded-full",
                                            isHighCost
                                              ? "bg-[rgb(184_147_90_/_0.72)]"
                                              : "bg-emerald-400/45"
                                          )}
                                        />
                                      ) : null}
                                      <div className="flex items-start justify-between gap-2">
                                        <span
                                          className={cn(
                                            "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular-nums text-[var(--neo-text-primary)]",
                                            isToday &&
                                              "bg-[rgb(184_147_90_/_0.14)] text-[var(--neo-gold-soft)] ring-1 ring-inset ring-[rgb(184_147_90_/_0.26)]"
                                          )}
                                        >
                                          {day}
                                        </span>
                                      </div>

                                      {hasEntries ? (
                                        <>
                                          <div
                                            className={cn(
                                              "mt-3 rounded-xl border px-2.5 py-2",
                                              isHighCost
                                                ? "border-[rgb(184_147_90_/_0.26)] bg-[rgb(184_147_90_/_0.10)]"
                                                : "border-emerald-400/15 bg-emerald-400/5"
                                            )}
                                          >
                                            <div className="flex items-baseline justify-between gap-2">
                                              <span className="shrink-0 text-[13px] font-semibold tabular-nums leading-none text-[var(--neo-text-primary)]">
                                                {formatLaborDaysLabel(totalLaborDays, {
                                                  compact: true,
                                                })}
                                              </span>
                                              <NeoAmount
                                                tone={isHighCost ? "neutral" : "income"}
                                                className={cn(
                                                  "min-w-0 truncate text-right text-[12px] leading-none",
                                                  isHighCost && "text-[var(--neo-gold-soft)]"
                                                )}
                                              >
                                                {formatCurrency(totalPay)}
                                              </NeoAmount>
                                            </div>
                                          </div>

                                          <div className="mt-auto pt-3">
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex min-w-0 items-center -space-x-1.5">
                                                {crewPreview.map(({ name, initials }, i) => (
                                                  <span
                                                    key={`${name}-${i}`}
                                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[10px] font-semibold uppercase tracking-normal text-[var(--neo-text-secondary)] shadow-[0_1px_0_rgb(255_255_255_/_0.035)_inset]"
                                                    aria-hidden
                                                    title={name}
                                                  >
                                                    {initials}
                                                  </span>
                                                ))}
                                                {workerCount > crewPreview.length ? (
                                                  <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-1.5 text-[10px] font-semibold tabular-nums text-[var(--neo-text-tertiary)]">
                                                    +{workerCount - crewPreview.length}
                                                  </span>
                                                ) : null}
                                              </div>
                                              <span className="shrink-0 text-[11px] font-medium text-[var(--neo-text-tertiary)]">
                                                {workerLabel}
                                              </span>
                                            </div>
                                          </div>
                                        </>
                                      ) : (
                                        <span className="mt-auto h-1.5 w-1.5 rounded-full bg-[var(--neo-border-strong)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none" />
                                      )}
                                    </button>
                                  );
                                })()
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-3 pt-3 md:hidden">
                    {calendarEntryDates.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[var(--neo-border-strong)] bg-[var(--neo-surface-muted)] px-4 py-8 text-center">
                        <p className="text-sm font-medium text-[var(--neo-text-primary)]">
                          No labor entries this month
                        </p>
                        <p className="mt-1 text-xs text-[var(--neo-text-secondary)]">
                          Add a labor entry to see the month agenda.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {calendarEntryDates.map((date) => {
                          const entries = entriesByDate.get(date) ?? [];
                          const workerCount = entries.length;
                          const totalPay = entries.reduce((s, e) => s + (e.cost_amount ?? 0), 0);
                          const isHighCost = totalPay > HIGH_COST_THRESHOLD;
                          const totalLaborDays = entries.reduce(
                            (s, e) => s + (Number(e.hours) || 0),
                            0
                          );
                          const isToday = date === todayYmd;
                          const workerLabel =
                            workerCount === 1 ? "1 worker" : `${workerCount} workers`;
                          const crewPreview = entries
                            .map((e) => (e.worker_name ?? "").trim())
                            .filter(Boolean)
                            .slice(0, 3)
                            .map((name) => ({ name, initials: getWorkerInitials(name) }));
                          return (
                            <button
                              key={date}
                              type="button"
                              onClick={() => setSelectedDayForDetail(date)}
                              className={cn(
                                "flex min-h-[72px] w-full items-center justify-between gap-3 rounded-xl border border-[var(--neo-border)] bg-[rgb(255_255_255_/_0.025)] px-3 py-3 text-left transition-[background,border-color,box-shadow] duration-150 ease-out hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-hover)] motion-reduce:transition-none",
                                isToday &&
                                  "border-[rgb(184_147_90_/_0.38)] bg-[rgb(184_147_90_/_0.06)]"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--neo-text-primary)]">
                                    {formatShortDate(date)}
                                  </span>
                                  {isToday ? (
                                    <span className="rounded-full border border-[rgb(184_147_90_/_0.26)] bg-[rgb(184_147_90_/_0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-gold-soft)]">
                                      Today
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2 flex min-w-0 items-center gap-2">
                                  <div className="flex shrink-0 items-center -space-x-1.5">
                                    {crewPreview.map(({ name, initials }, i) => (
                                      <span
                                        key={`${name}-${i}`}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[10px] font-semibold uppercase text-[var(--neo-text-secondary)]"
                                        aria-hidden
                                        title={name}
                                      >
                                        {initials}
                                      </span>
                                    ))}
                                    {workerCount > crewPreview.length ? (
                                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-1.5 text-[10px] font-semibold tabular-nums text-[var(--neo-text-tertiary)]">
                                        +{workerCount - crewPreview.length}
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="truncate text-xs font-medium text-[var(--neo-text-secondary)]">
                                    {workerLabel}
                                  </span>
                                </div>
                              </div>
                              <div
                                className={cn(
                                  "shrink-0 rounded-xl border px-2.5 py-2 text-right",
                                  isHighCost
                                    ? "border-[rgb(184_147_90_/_0.26)] bg-[rgb(184_147_90_/_0.10)]"
                                    : "border-emerald-400/15 bg-emerald-400/5"
                                )}
                              >
                                <p className="text-[13px] font-semibold tabular-nums leading-none text-[var(--neo-text-primary)]">
                                  {formatLaborDaysLabel(totalLaborDays)}
                                </p>
                                <NeoAmount
                                  tone={isHighCost ? "neutral" : "income"}
                                  className={cn(
                                    "mt-1 block text-[12px] leading-none",
                                    isHighCost && "text-[var(--neo-gold-soft)]"
                                  )}
                                >
                                  {formatCurrency(totalPay)}
                                </NeoAmount>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
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
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border/60">
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                              Worker
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                              Project
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                              Session
                            </th>
                            <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 tabular-nums">
                              OT
                            </th>
                            <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 tabular-nums">
                              OT Amount
                            </th>
                            <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 tabular-nums">
                              Total Pay
                            </th>
                            <th className="w-[84px] px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {dayEntries.map((e) => {
                            const { otHours, otAmount } = parseDayTypeAndOt(e.notes);
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
                                    {sessionLabelWithOvertime(session, e.notes)}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                                  {otHours}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                                  {otAmount}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <NeoAmount>{pay > 0 ? formatCurrency(pay) : "—"}</NeoAmount>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      className="h-8 w-8 inline-flex items-center justify-center rounded-sm text-emerald-700 hover:bg-emerald-50/60 hover:text-emerald-800"
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
                  );
                })()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { cn } from "@/lib/utils";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

/** Above this, window the worker list so mobile scroll stays smooth. */
const WORKER_LIST_VIRTUAL_THRESHOLD = 32;
const WORKER_ROW_ESTIMATE_PX = 54;
const rdp = getDefaultClassNames();

const modalScrollbar =
  "[scrollbar-width:thin] [scrollbar-color:var(--hh-border-strong)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--hh-border)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--hh-border-strong)]";

const labelClass =
  "text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]";
const fieldClass =
  "hh-type-text-entry h-10 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-none placeholder:text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-border-strong)] focus-visible:ring-[var(--hh-focus-ring)] max-md:min-h-[44px]";
const workerGridClass =
  "grid grid-cols-[minmax(8.5rem,1.75fr)_4.4rem_3.35rem_3.35rem_3.45rem_5.6rem_5.7rem] items-center gap-2";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: DailyEntrySaveResult) => void;
};

export type DailyEntrySaveResult = {
  workDate: string;
  workerId: string;
  workerName: string;
  rowCount: number;
};

type LaborWorker = {
  id: string;
  name: string;
  halfDayRate?: number | null;
  dailyRate?: number | null;
  phone?: string | null;
  nickname?: string | null;
  code?: string | null;
};

type LaborProjectOption = { id: string; name: string };

type LaborEntryOptionResponse = {
  message?: string;
  entries?: ExistingLaborEntryOption[];
  workers?: LaborWorker[];
  projects?: LaborProjectOption[];
};

type ExistingLaborEntryOption = {
  id?: string;
  worker_id?: string;
  workerId?: string;
  project_id?: string | null;
  projectId?: string | null;
  morning?: boolean | null;
  afternoon?: boolean | null;
  status?: string | null;
};

type JoinedLaborEntryOption = ExistingLaborEntryOption & {
  work_date?: string | null;
  workDate?: string | null;
};

type ExistingSessionState = {
  morning: boolean;
  afternoon: boolean;
  entryId: string | null;
};

type DailyLaborRowInput = {
  workerId: string;
  morning: boolean;
  afternoon: boolean;
  otHours?: number;
  otAmount?: number;
};

type Sel = { morning: boolean; afternoon: boolean; otHours: number; otAmount: number };

function ymdToLocalDate(ymd: string): Date | null {
  const raw = String(ymd ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(yy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYmd(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDateInput(ymd: string): string {
  const date = ymdToLocalDate(ymd);
  if (!date) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(
    2,
    "0"
  )}/${date.getFullYear()}`;
}

function parseDateInput(value: string): string | null {
  const text = value.trim();
  if (!text) return "";

  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const parts = ymd
    ? { year: Number(ymd[1]), month: Number(ymd[2]), day: Number(ymd[3]) }
    : mdy
      ? { year: Number(mdy[3]), month: Number(mdy[1]), day: Number(mdy[2]) }
      : null;
  if (!parts) return null;

  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return null;
  }
  return toYmd(date);
}

function computeRegularPay(dailyRate: number, morning: boolean, afternoon: boolean): number {
  return morning && afternoon ? dailyRate : morning || afternoon ? dailyRate / 2 : 0;
}

function existingEntryWorkerId(entry: ExistingLaborEntryOption): string {
  return String(entry.worker_id ?? entry.workerId ?? "").trim();
}

function existingSessionLabel(existing: ExistingSessionState | undefined): string | null {
  if (!existing) return null;
  if (existing.morning && existing.afternoon) return "Already has full day";
  if (existing.morning) return "AM already entered";
  if (existing.afternoon) return "PM already entered";
  return null;
}

function laborEntryVisiblePath(workerId: string, workDate: string, entryId: string | null): string {
  const params = new URLSearchParams();
  params.set("workerId", workerId);
  if (/^\d{4}-\d{2}/.test(workDate)) params.set("month", workDate.slice(0, 7));
  if (entryId) params.set("entryId", entryId);
  return `/labor?${params.toString()}`;
}

const defaultSel = (): Sel => ({
  morning: false,
  afternoon: false,
  otHours: 0,
  otAmount: 0,
});

function defaultSelectionMap(workers: LaborWorker[]): Record<string, Sel> {
  return Object.fromEntries(workers.map((worker) => [worker.id, defaultSel()])) as Record<
    string,
    Sel
  >;
}

function workerDailyRate(worker: LaborWorker): number | null {
  const raw = worker.dailyRate ?? worker.halfDayRate;
  if (raw == null) return null;
  const rate = Number(raw);
  return Number.isFinite(rate) ? Math.max(0, rate) : null;
}

function formatDailyRate(worker: LaborWorker): string {
  const rate = workerDailyRate(worker);
  if (rate == null) return "—/day";
  return `$${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}/day`;
}

function compareWorkersByDailyRate(a: LaborWorker, b: LaborWorker): number {
  const rateA = workerDailyRate(a);
  const rateB = workerDailyRate(b);
  if (rateA == null && rateB != null) return 1;
  if (rateA != null && rateB == null) return -1;
  if (rateA != null && rateB != null && rateA !== rateB) return rateB - rateA;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

function workerMatchesSearch(worker: LaborWorker, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return [worker.name, worker.phone, worker.nickname, worker.code].some((value) =>
    String(value ?? "")
      .toLocaleLowerCase()
      .includes(q)
  );
}

function pluralizeWorkers(count: number): string {
  return `${count} ${count === 1 ? "worker" : "workers"}`;
}

function recentProjectDateFrom(workDate: string): string {
  const base = ymdToLocalDate(workDate) ?? new Date();
  base.setDate(base.getDate() - 365);
  return toYmd(base);
}

function AddDailyEntryDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextYmd: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => ymdToLocalDate(value), [value]);
  const [month, setMonth] = React.useState<Date>(() => selected ?? new Date());
  const [draft, setDraft] = React.useState(() => formatDateInput(value));
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (editing) return;
    setDraft(formatDateInput(value));
  }, [editing, value]);

  React.useEffect(() => {
    if (!open) return;
    const nextMonth = selected ?? new Date();
    setMonth((current) => {
      if (
        current.getFullYear() === nextMonth.getFullYear() &&
        current.getMonth() === nextMonth.getMonth()
      ) {
        return current;
      }
      return nextMonth;
    });
  }, [open, selected]);

  const chooseToday = React.useCallback(() => {
    const today = new Date();
    onChange(toYmd(today));
    setDraft(formatDateInput(toYmd(today)));
    setMonth(today);
    setOpen(false);
  }, [onChange]);

  const commitDraft = React.useCallback(() => {
    const parsed = parseDateInput(draft);
    setEditing(false);
    if (parsed == null) {
      setDraft(formatDateInput(value));
      return;
    }
    onChange(parsed);
    setDraft(formatDateInput(parsed));
  }, [draft, onChange, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            id="add-daily-entry-date"
            data-testid="add-daily-entry-date-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Work Date"
            placeholder="MM/DD/YYYY"
            value={draft}
            onFocus={() => {
              setEditing(true);
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              const nextDraft = e.target.value;
              setDraft(nextDraft);
              const parsed = parseDateInput(nextDraft);
              if (parsed != null) onChange(parsed);
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
                setOpen(false);
              }
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(formatDateInput(value));
                setOpen(false);
              }
            }}
            className={cn(fieldClass, "pr-11 tabular-nums")}
            required
          />
          <button
            type="button"
            aria-label="Open date picker"
            aria-expanded={open}
            data-testid="add-daily-entry-date-button"
            onClick={() => setOpen(true)}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] max-md:h-9 max-md:w-9"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        data-testid="add-daily-entry-date-popover"
        className="z-[140] w-[min(300px,calc(100vw-24px))] rounded-hh-task border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] p-3 text-[var(--hh-text-primary)] shadow-floating"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DayPicker
          mode="single"
          selected={selected ?? undefined}
          month={month}
          onMonthChange={setMonth}
          onSelect={(d) => {
            if (!d) return;
            const next = toYmd(d);
            onChange(next);
            setDraft(formatDateInput(next));
            setEditing(false);
            setOpen(false);
          }}
          classNames={{
            ...rdp,
            root: cn(rdp.root, "relative"),
            months: cn(rdp.months, "gap-2"),
            month: cn(rdp.month, "relative space-y-2"),
            month_grid: cn(rdp.month_grid, "mx-auto"),
            month_caption: cn(
              rdp.month_caption,
              "pointer-events-none flex min-h-8 items-center justify-center px-14 py-0 text-center"
            ),
            caption_label: cn(
              rdp.caption_label,
              "flex items-center justify-center text-sm font-semibold leading-none text-[var(--hh-text-primary)]"
            ),
            nav: cn(rdp.nav, "absolute right-0 top-0 z-10 flex h-8 items-center gap-1"),
            button_previous: cn(
              rdp.button_previous,
              "flex h-8 w-8 items-center justify-center rounded-hh-compact border-0 bg-transparent text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]"
            ),
            button_next: cn(
              rdp.button_next,
              "flex h-8 w-8 items-center justify-center rounded-hh-compact border-0 bg-transparent text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]"
            ),
            weekdays: cn(rdp.weekdays, "text-hh-status font-semibold uppercase tracking-normal"),
            weekday: cn(rdp.weekday, "w-8 text-center text-[var(--hh-text-tertiary)]"),
            week: cn(rdp.week, "gap-1"),
            day: cn(rdp.day, "h-8 w-8 rounded-hh-compact text-hh-body transition-colors"),
            day_button: cn(
              (rdp as unknown as Record<string, string>).day_button ?? "",
              "flex h-8 w-8 items-center justify-center rounded-hh-compact text-sm font-medium leading-none text-[var(--hh-text-primary)]"
            ),
            today: cn(
              rdp.today,
              "ring-1 ring-inset ring-[var(--hh-focus-ring)] [&_button]:text-[var(--hh-information)]"
            ),
            selected: cn(
              rdp.selected,
              "bg-[var(--hh-l3-selected)] ring-0 [&_button]:border [&_button]:border-[var(--hh-border-strong)] [&_button]:bg-[var(--hh-action-primary)] [&_button]:text-[var(--hh-action-primary-foreground)]"
            ),
            outside: cn(
              rdp.outside,
              "text-[var(--hh-text-tertiary)] opacity-55 [&_button]:text-[var(--hh-text-tertiary)]"
            ),
          }}
          components={{
            Chevron: (props) =>
              props.orientation === "left" ? (
                <ChevronLeft className="h-4 w-4 text-[var(--hh-text-secondary)]" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--hh-text-secondary)]" aria-hidden />
              ),
          }}
          footer={
            <div className="mt-2 flex items-center justify-between border-t border-[var(--hh-border)] pt-2">
              <button
                type="button"
                className="text-hh-control text-[var(--hh-text-secondary)] transition-colors hover:text-[var(--hh-text-primary)] disabled:pointer-events-none disabled:opacity-45"
                disabled={!value}
                onClick={() => {
                  onChange("");
                  setDraft("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="text-hh-control text-[var(--hh-text-secondary)] transition-colors hover:text-[var(--hh-text-primary)]"
                onClick={chooseToday}
              >
                Today
              </button>
            </div>
          }
        />
      </PopoverContent>
    </Popover>
  );
}

const AddDailyEntryWorkerRow = React.memo(function AddDailyEntryWorkerRow({
  worker,
  morning,
  afternoon,
  otHours,
  otAmount,
  existing,
  workDate,
  toggleMorning,
  toggleAfternoon,
  commitOtHours,
  commitOtAmount,
}: {
  worker: LaborWorker;
  morning: boolean;
  afternoon: boolean;
  otHours: number;
  otAmount: number;
  existing?: ExistingSessionState;
  workDate: string;
  toggleMorning: (id: string) => void;
  toggleAfternoon: (id: string) => void;
  commitOtHours: (id: string, value: number) => void;
  commitOtAmount: (id: string, value: number) => void;
}) {
  const [otDraft, setOtDraft] = React.useState(() => (otHours === 0 ? "" : String(otHours)));
  const [otAmountDraft, setOtAmountDraft] = React.useState(() =>
    otAmount === 0 ? "" : String(otAmount)
  );
  const otDraftRef = React.useRef(otDraft);
  const otAmountDraftRef = React.useRef(otAmountDraft);
  otDraftRef.current = otDraft;
  otAmountDraftRef.current = otAmountDraft;
  const otRafRef = React.useRef<number | null>(null);
  const otAmountRafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setOtDraft(otHours === 0 ? "" : String(otHours));
  }, [otHours]);
  React.useEffect(() => {
    setOtAmountDraft(otAmount === 0 ? "" : String(otAmount));
  }, [otAmount]);

  const onAm = React.useCallback(() => toggleMorning(worker.id), [toggleMorning, worker.id]);
  const onPm = React.useCallback(() => toggleAfternoon(worker.id), [toggleAfternoon, worker.id]);
  const morningDisabled = existing?.morning === true;
  const afternoonDisabled = existing?.afternoon === true;
  const fullyBlocked = morningDisabled && afternoonDisabled;
  const existingLabel = existingSessionLabel(existing);
  const existingHref = existingLabel
    ? laborEntryVisiblePath(worker.id, workDate, existing?.entryId ?? null)
    : "";

  const scheduleOtCommit = React.useCallback(() => {
    if (otRafRef.current != null) cancelAnimationFrame(otRafRef.current);
    otRafRef.current = requestAnimationFrame(() => {
      otRafRef.current = null;
      const raw = otDraftRef.current;
      const n = parseFloat(raw);
      const v = Number.isFinite(n) ? Math.max(0, n) : 0;
      commitOtHours(worker.id, v);
    });
  }, [commitOtHours, worker.id]);

  const scheduleOtAmountCommit = React.useCallback(() => {
    if (otAmountRafRef.current != null) cancelAnimationFrame(otAmountRafRef.current);
    otAmountRafRef.current = requestAnimationFrame(() => {
      otAmountRafRef.current = null;
      const raw = otAmountDraftRef.current;
      const n = parseFloat(raw);
      const v = Number.isFinite(n) ? Math.max(0, n) : 0;
      commitOtAmount(worker.id, v);
    });
  }, [commitOtAmount, worker.id]);

  React.useEffect(
    () => () => {
      if (otRafRef.current != null) cancelAnimationFrame(otRafRef.current);
      if (otAmountRafRef.current != null) cancelAnimationFrame(otAmountRafRef.current);
    },
    []
  );

  const rate = workerDailyRate(worker) ?? 0;
  const baseTotal = computeRegularPay(rate, morning, afternoon);
  const total = baseTotal + Math.max(0, Number(otAmount) || 0);

  return (
    <div
      className={cn(
        workerGridClass,
        "min-h-[54px] border-b border-[var(--hh-border)] px-3 text-sm transition-colors last:border-b-0 bg-[var(--hh-l3-hover)] [&>div]:min-w-0",
        fullyBlocked && "bg-[var(--hh-l3-hover)] opacity-70 bg-[var(--hh-l3-hover)]"
      )}
      role="row"
    >
      <div className="pr-1">
        <span
          className="block truncate text-hh-table-cell font-semibold text-[var(--hh-text-primary)]"
          title={worker.name}
        >
          {worker.name}
        </span>
        {existingLabel ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-hh-status font-medium text-[var(--hh-text-tertiary)]">
            <span className="truncate">{existingLabel}</span>
            <a
              href={existingHref}
              className="shrink-0 text-[var(--hh-warning)] underline-offset-4 hover:text-[var(--hh-warning)] hover:underline"
            >
              View
            </a>
          </span>
        ) : null}
      </div>
      <div className="whitespace-nowrap text-right text-xs font-medium tabular-nums text-[var(--hh-text-secondary)]">
        {formatDailyRate(worker)}
      </div>
      <div className="flex justify-center">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-8 min-h-8 w-full rounded-hh-compact border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-0 text-hh-status font-semibold tracking-normal text-[var(--hh-text-secondary)] shadow-none border-[var(--hh-border)] bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] max-md:min-h-[44px]",
            morning &&
              "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)] border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] hover:text-[var(--hh-warning)]"
          )}
          onClick={onAm}
          disabled={morningDisabled}
        >
          AM
        </Button>
      </div>
      <div className="flex justify-center">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-8 min-h-8 w-full rounded-hh-compact border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-0 text-hh-status font-semibold tracking-normal text-[var(--hh-text-secondary)] shadow-none border-[var(--hh-border)] bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] max-md:min-h-[44px]",
            afternoon &&
              "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)] border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] hover:text-[var(--hh-warning)]"
          )}
          onClick={onPm}
          disabled={afternoonDisabled}
        >
          PM
        </Button>
      </div>
      <div>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={otDraft}
          aria-label={`Overtime hours for ${worker.name}`}
          onChange={(e) => {
            const v = e.target.value;
            setOtDraft(v);
            scheduleOtCommit();
          }}
          onBlur={() => {
            if (otRafRef.current != null) {
              cancelAnimationFrame(otRafRef.current);
              otRafRef.current = null;
            }
            const n = parseFloat(otDraftRef.current);
            const v = Number.isFinite(n) ? Math.max(0, n) : 0;
            commitOtHours(worker.id, v);
            setOtDraft(v === 0 ? "" : String(v));
          }}
          disabled={fullyBlocked}
          className="h-8 min-h-8 w-full min-w-0 rounded-hh-compact border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-1 text-center text-sm tabular-nums text-[var(--hh-text-primary)] border-[var(--hh-border)] bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)] max-md:min-h-[44px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <div>
        <Input
          type="number"
          min={0}
          step={1}
          value={otAmountDraft}
          aria-label={`Overtime fixed amount for ${worker.name}`}
          onChange={(e) => {
            const v = e.target.value;
            setOtAmountDraft(v);
            scheduleOtAmountCommit();
          }}
          onBlur={() => {
            if (otAmountRafRef.current != null) {
              cancelAnimationFrame(otAmountRafRef.current);
              otAmountRafRef.current = null;
            }
            const n = parseFloat(otAmountDraftRef.current);
            const v = Number.isFinite(n) ? Math.max(0, n) : 0;
            commitOtAmount(worker.id, v);
            setOtAmountDraft(v === 0 ? "" : String(v));
          }}
          disabled={fullyBlocked}
          className="h-8 min-h-8 w-full min-w-0 rounded-hh-compact border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-1 text-center text-sm tabular-nums text-[var(--hh-text-primary)] border-[var(--hh-border)] bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)] max-md:min-h-[44px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <div className="pr-1 text-right text-xs font-semibold tabular-nums text-[var(--hh-text-secondary)]">
        {morning || afternoon ? `$${total.toFixed(2)}` : "—"}
      </div>
    </div>
  );
});

export function AddDailyEntryModal({ open, onOpenChange, onSuccess }: Props) {
  const [projectId, setProjectId] = React.useState("");
  const [workDate, setWorkDate] = React.useState(() => workerRateLocalYmd());
  const [projects, setProjects] = React.useState<LaborProjectOption[]>([]);
  const [workers, setWorkers] = React.useState<LaborWorker[]>([]);
  const [workerSearch, setWorkerSearch] = React.useState("");
  const [projectRecentWorkerIds, setProjectRecentWorkerIds] = React.useState<string[]>([]);
  const [selectionByWorkerId, setSelectionByWorkerId] = React.useState<Record<string, Sel>>({});
  const selectionRef = React.useRef(selectionByWorkerId);
  React.useEffect(() => {
    selectionRef.current = selectionByWorkerId;
  }, [selectionByWorkerId]);
  const [existingSessionsByWorkerId, setExistingSessionsByWorkerId] = React.useState<
    Record<string, ExistingSessionState>
  >({});
  const [notes, setNotes] = React.useState("");
  const [costCode, setCostCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleWorkDateChange = React.useCallback(
    (nextDate: string) => {
      if (nextDate === workDate) return;
      const nextSelection = defaultSelectionMap(workers);
      selectionRef.current = nextSelection;
      setSelectionByWorkerId(nextSelection);
      setExistingSessionsByWorkerId({});
      setError(null);
      setWorkDate(nextDate);
    },
    [workDate, workers]
  );

  React.useEffect(() => {
    if (!open || !workDate) {
      setExistingSessionsByWorkerId({});
      return;
    }
    let cancelled = false;
    fetch(`/api/labor/entries?date=${encodeURIComponent(workDate)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as LaborEntryOptionResponse;
        if (!response.ok) throw new Error(body.message ?? "Failed to load labor options.");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        const nextWorkers = body.workers ?? [];
        setProjects(body.projects ?? []);
        setWorkers(nextWorkers);
        const nextSelection = defaultSelectionMap(nextWorkers);
        selectionRef.current = nextSelection;
        setSelectionByWorkerId(nextSelection);
        setExistingSessionsByWorkerId(() => {
          const next: Record<string, ExistingSessionState> = {};
          for (const entry of body.entries ?? []) {
            const workerId = existingEntryWorkerId(entry);
            if (!workerId) continue;
            const current = next[workerId] ?? { morning: false, afternoon: false, entryId: null };
            const morning = entry.morning === true;
            const afternoon = entry.afternoon === true;
            next[workerId] = {
              morning: current.morning || morning,
              afternoon: current.afternoon || afternoon,
              entryId: current.entryId ?? (entry.id ? String(entry.id) : null),
            };
          }
          return next;
        });
        setError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setExistingSessionsByWorkerId({});
          setProjects([]);
          setWorkers([]);
          setError("Failed to load labor options.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, workDate]);

  React.useEffect(() => {
    if (!open || !projectId) {
      setProjectRecentWorkerIds([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      view: "joined",
      projectId,
      dateFrom: recentProjectDateFrom(workDate),
    });
    fetch(`/api/labor/entries?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const body = (await response.json().catch(() => ({}))) as {
          entries?: JoinedLaborEntryOption[];
        };
        return body.entries ?? [];
      })
      .then((entries) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const next: string[] = [];
        for (const entry of entries) {
          const workerId = existingEntryWorkerId(entry);
          if (!workerId || seen.has(workerId)) continue;
          seen.add(workerId);
          next.push(workerId);
        }
        setProjectRecentWorkerIds(next);
      })
      .catch(() => {
        if (!cancelled) setProjectRecentWorkerIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, workDate]);

  const displayedWorkers = React.useMemo(() => {
    const query = workerSearch.trim();
    const sorted = workers
      .filter((worker) => workerMatchesSearch(worker, query))
      .sort(compareWorkersByDailyRate);
    if (query || !projectId || projectRecentWorkerIds.length === 0) return sorted;
    const recent = new Set(projectRecentWorkerIds);
    return [
      ...sorted.filter((worker) => recent.has(worker.id)),
      ...sorted.filter((worker) => !recent.has(worker.id)),
    ];
  }, [projectId, projectRecentWorkerIds, workerSearch, workers]);

  const toggleMorning = React.useCallback(
    (workerId: string) => {
      if (existingSessionsByWorkerId[workerId]?.morning) return;
      setSelectionByWorkerId((prev) => {
        const cur = prev[workerId] ?? defaultSel();
        return { ...prev, [workerId]: { ...cur, morning: !cur.morning } };
      });
    },
    [existingSessionsByWorkerId]
  );

  const toggleAfternoon = React.useCallback(
    (workerId: string) => {
      if (existingSessionsByWorkerId[workerId]?.afternoon) return;
      setSelectionByWorkerId((prev) => {
        const cur = prev[workerId] ?? defaultSel();
        return { ...prev, [workerId]: { ...cur, afternoon: !cur.afternoon } };
      });
    },
    [existingSessionsByWorkerId]
  );

  const commitOtHours = React.useCallback((workerId: string, value: number) => {
    setSelectionByWorkerId((prev) => {
      const cur = prev[workerId] ?? defaultSel();
      return { ...prev, [workerId]: { ...cur, otHours: value } };
    });
  }, []);

  const commitOtAmount = React.useCallback((workerId: string, value: number) => {
    setSelectionByWorkerId((prev) => {
      const cur = prev[workerId] ?? defaultSel();
      return { ...prev, [workerId]: { ...cur, otAmount: value } };
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ae = document.activeElement;
    if (ae instanceof HTMLElement) ae.blur();
    // One frame so blur + pending rAF overtime commits land before reading selections (~16ms)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const map = selectionRef.current;
    if (!projectId || !workDate) {
      setError("Project and date are required.");
      return;
    }
    const toSave: DailyLaborRowInput[] = [];
    for (const w of workers) {
      const s = map[w.id];
      if (!s || (!s.morning && !s.afternoon)) continue;
      toSave.push({
        workerId: w.id,
        morning: s.morning,
        afternoon: s.afternoon,
        otHours: s.otHours,
        otAmount: s.otAmount,
      });
    }
    if (toSave.length === 0) {
      setError("Select at least one worker with AM or PM.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/labor/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          workDate,
          rows: toSave,
          notes: notes.trim() || undefined,
          costCode: costCode.trim() || undefined,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Failed to save entries.");
      const firstSaved = toSave[0];
      const firstWorker = workers.find((worker) => worker.id === firstSaved?.workerId);
      onOpenChange(false);
      onSuccess({
        workDate,
        workerId: firstSaved?.workerId ?? "",
        workerName: firstWorker?.name ?? "Worker",
        rowCount: toSave.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entries.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[min(740px,calc(100vw-24px))] max-w-[740px] max-h-[calc(100vh-48px)] overflow-hidden rounded-hh-task border border-[var(--hh-border-floating)] bg-[var(--hh-l5-task-surface)] p-0 text-[var(--hh-text-primary)] shadow-task",
          "flex flex-col gap-0",
          "max-md:!bottom-auto max-md:!left-1/2 max-md:!right-auto max-md:!top-1/2 max-md:!w-[calc(100vw-24px)] max-md:!max-w-[calc(100vw-24px)] max-md:!-translate-x-1/2 max-md:!-translate-y-1/2 max-md:!rounded-hh-task max-md:!border-b max-md:!max-h-[calc(100dvh-24px)]",
          "[&>button.absolute]:right-4 [&>button.absolute]:top-4 [&>button.absolute]:h-9 [&>button.absolute]:w-9 [&>button.absolute]:rounded-hh-standard [&>button.absolute]:border [&>button.absolute]:border-[var(--hh-border)] [&>button.absolute]:bg-[var(--hh-l2-operational-surface)] [&>button.absolute]:text-[var(--hh-text-secondary)] [&>button.absolute]:opacity-100 [&>button.absolute]:hover:bg-[var(--hh-l3-hover)] [&>button.absolute]:hover:text-[var(--hh-text-primary)]"
        )}
      >
        <DialogHeader className="sticky top-0 z-20 shrink-0 space-y-0 border-b border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)] px-5 py-4 pr-16">
          <DialogTitle className="text-hh-section-title font-semibold tracking-normal text-[var(--hh-text-primary)]">
            Add Daily Entry
          </DialogTitle>
        </DialogHeader>
        <form
          id="add-daily-form"
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            className={cn(
              modalScrollbar,
              "min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-4"
            )}
          >
            <div className="grid gap-3 sm:grid-cols-[1.45fr_0.85fr]">
              <div className="space-y-1.5">
                <label className={labelClass}>Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={cn(fieldClass, "w-full px-3  focus-visible:outline-none")}
                  required
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Date</label>
                <AddDailyEntryDateField value={workDate} onChange={handleWorkDateChange} />
              </div>
            </div>
            <div className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-2">
              <p className="text-hh-status leading-5 text-[var(--hh-text-tertiary)]">
                Existing visible entries only block the matching AM/PM session. Cancelled, deleted,
                or hidden rows do not block new time.
              </p>
            </div>
            <div className="min-w-0 overflow-hidden rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] shadow-operational">
              <div className="flex flex-col gap-2 border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <label className={labelClass} htmlFor="add-daily-worker-search">
                    Search workers
                  </label>
                  <p className="text-hh-status text-[var(--hh-text-tertiary)]">
                    {pluralizeWorkers(displayedWorkers.length)}
                  </p>
                </div>
                <Input
                  id="add-daily-worker-search"
                  type="search"
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  placeholder="Search by name"
                  className={cn(fieldClass, "w-full sm:w-72")}
                />
              </div>
              <div className={cn(modalScrollbar, "overflow-x-auto")}>
                <div className="min-w-[720px] sm:min-w-0">
                  <div
                    className={cn(
                      workerGridClass,
                      "border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                    )}
                    role="row"
                  >
                    <div className="truncate text-left" title="Worker">
                      Worker
                    </div>
                    <div className="text-right">Rate</div>
                    <div className="text-center">AM</div>
                    <div className="text-center">PM</div>
                    <div className="text-center">OT Hrs</div>
                    <div className="text-center">OT Amount</div>
                    <div className="pr-1 text-right">Total</div>
                  </div>
                  {displayedWorkers.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm font-medium text-[var(--hh-text-tertiary)]">
                      No workers found
                    </div>
                  ) : displayedWorkers.length > WORKER_LIST_VIRTUAL_THRESHOLD ? (
                    <VirtualScrollList
                      count={displayedWorkers.length}
                      estimateSize={WORKER_ROW_ESTIMATE_PX}
                      className={cn(
                        modalScrollbar,
                        "min-h-[132px] max-h-[min(42vh,372px)] flex-1 overflow-auto"
                      )}
                    >
                      {(index) => {
                        const worker = displayedWorkers[index];
                        if (!worker) return null;
                        const sel = selectionByWorkerId[worker.id] ?? defaultSel();
                        const existing = existingSessionsByWorkerId[worker.id];
                        return (
                          <AddDailyEntryWorkerRow
                            key={`${workDate}:${worker.id}`}
                            worker={worker}
                            morning={sel.morning}
                            afternoon={sel.afternoon}
                            otHours={sel.otHours}
                            otAmount={sel.otAmount}
                            existing={existing}
                            workDate={workDate}
                            toggleMorning={toggleMorning}
                            toggleAfternoon={toggleAfternoon}
                            commitOtHours={commitOtHours}
                            commitOtAmount={commitOtAmount}
                          />
                        );
                      }}
                    </VirtualScrollList>
                  ) : (
                    <div
                      className={cn(
                        modalScrollbar,
                        "max-h-[min(42vh,372px)] min-h-[108px] overflow-auto text-sm"
                      )}
                    >
                      {displayedWorkers.map((worker) => {
                        const sel = selectionByWorkerId[worker.id] ?? defaultSel();
                        const existing = existingSessionsByWorkerId[worker.id];
                        return (
                          <AddDailyEntryWorkerRow
                            key={`${workDate}:${worker.id}`}
                            worker={worker}
                            morning={sel.morning}
                            afternoon={sel.afternoon}
                            otHours={sel.otHours}
                            otAmount={sel.otAmount}
                            existing={existing}
                            workDate={workDate}
                            toggleMorning={toggleMorning}
                            toggleAfternoon={toggleAfternoon}
                            commitOtHours={commitOtHours}
                            commitOtAmount={commitOtAmount}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 shadow-operational">
              <div className="grid gap-3 sm:grid-cols-[0.85fr_1.4fr]">
                <div className="space-y-1.5">
                  <label className={labelClass}>Cost code</label>
                  <Input
                    value={costCode}
                    onChange={(e) => setCostCode(e.target.value)}
                    placeholder="Optional"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Notes</label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="m-0 shrink-0 border-t border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end">
            {error ? (
              <p className="min-w-0 text-left text-sm font-medium text-[var(--hh-danger)] sm:mr-auto">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-hh-standard px-4 text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] max-lg:min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              className="h-9 rounded-hh-standard border-transparent bg-[var(--hh-action-primary)] px-4 text-[var(--hh-action-primary-foreground)] shadow-none hover:opacity-90 max-lg:min-h-[44px]"
            >
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

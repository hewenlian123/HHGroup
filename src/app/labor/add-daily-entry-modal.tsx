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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

/** Above this, window the worker list so mobile scroll stays smooth. */
const WORKER_LIST_VIRTUAL_THRESHOLD = 32;
const WORKER_ROW_ESTIMATE_PX = 54;
const rdp = getDefaultClassNames();

const modalScrollbar =
  "[scrollbar-width:thin] [scrollbar-color:rgba(190,198,210,0.22)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(190,198,210,0.22)] [&::-webkit-scrollbar-thumb:hover]:bg-[rgba(190,198,210,0.34)]";

const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]";
const fieldClass =
  "h-10 rounded-lg border-white/[0.09] bg-[#0d0f14] text-sm text-[var(--neo-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] placeholder:text-[var(--neo-text-tertiary)] hover:border-white/[0.14] hover:bg-[#111318] focus-visible:border-[var(--neo-gold)] focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-[44px]";
const workerGridClass =
  "grid grid-cols-[minmax(8.5rem,1.75fr)_4.4rem_3.35rem_3.35rem_3.45rem_5.6rem_5.7rem] items-center gap-2";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (savedDate?: string) => void;
};

type LaborWorker = {
  id: string;
  name: string;
  halfDayRate?: number | null;
  dailyRate?: number | null;
};

type LaborProjectOption = { id: string; name: string };

type LaborEntryOptionResponse = {
  message?: string;
  entries?: Array<{ worker_id?: string; workerId?: string }>;
  workers?: LaborWorker[];
  projects?: LaborProjectOption[];
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

function computeRegularPay(dailyRate: number, morning: boolean, afternoon: boolean): number {
  return morning && afternoon ? dailyRate : morning || afternoon ? dailyRate / 2 : 0;
}

const defaultSel = (): Sel => ({
  morning: false,
  afternoon: false,
  otHours: 0,
  otAmount: 0,
});

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
    setMonth(today);
    setOpen(false);
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            fieldClass,
            "pr-11 tabular-nums [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0"
          )}
          required
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Open date picker"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035] text-[var(--neo-text-secondary)] transition-colors hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-[var(--neo-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] max-md:h-9 max-md:w-9"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="z-[140] w-[min(300px,calc(100vw-24px))] rounded-2xl border border-[rgba(190,198,210,0.16)] bg-[#111318] p-3 text-[#F6F7FA] shadow-[0_24px_58px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.055)]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DayPicker
          mode="single"
          selected={selected ?? undefined}
          month={month}
          onMonthChange={setMonth}
          onSelect={(d) => {
            if (!d) return;
            onChange(toYmd(d));
            setOpen(false);
          }}
          classNames={{
            ...rdp,
            months: cn(rdp.months, "gap-2"),
            month_caption: cn(
              rdp.month_caption,
              "flex min-h-8 items-center justify-between gap-2 px-0.5 py-0"
            ),
            caption_label: cn(
              rdp.caption_label,
              "flex items-center justify-center text-sm font-semibold leading-none text-[#F6F7FA]"
            ),
            nav: cn(rdp.nav, "items-center gap-1"),
            button_previous: cn(
              rdp.button_previous,
              "flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-[#BAC2CA] transition-colors hover:bg-white/[0.07] hover:text-white"
            ),
            button_next: cn(
              rdp.button_next,
              "flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-[#BAC2CA] transition-colors hover:bg-white/[0.07] hover:text-white"
            ),
            weekdays: cn(rdp.weekdays, "text-[10px] font-semibold uppercase tracking-[0.06em]"),
            weekday: cn(rdp.weekday, "w-8 text-center text-[#737C8C]"),
            week: cn(rdp.week, "gap-1"),
            day: cn(rdp.day, "h-8 w-8 rounded-md text-sm transition-colors hover:bg-white/[0.07]"),
            day_button: cn(
              (rdp as unknown as Record<string, string>).day_button ?? "",
              "flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium leading-none text-[#E7EAEE]"
            ),
            today: cn(
              rdp.today,
              "ring-1 ring-inset ring-[rgba(184,147,90,0.42)] [&_button]:text-[#F2D49B]"
            ),
            selected: cn(
              rdp.selected,
              "bg-[rgba(184,147,90,0.22)] ring-0 hover:bg-[rgba(184,147,90,0.26)] [&_button]:border [&_button]:border-[rgba(184,147,90,0.46)] [&_button]:bg-[rgba(184,147,90,0.18)] [&_button]:text-[#FFE7B2]"
            ),
            outside: cn(rdp.outside, "text-[#737C8C] opacity-55 [&_button]:text-[#737C8C]"),
          }}
          components={{
            Chevron: (props) =>
              props.orientation === "left" ? (
                <ChevronLeft className="h-4 w-4 text-[#BAC2CA]" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#BAC2CA]" aria-hidden />
              ),
          }}
          footer={
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-2">
              <button
                type="button"
                className="text-xs font-semibold text-[#D2B77F] transition-colors hover:text-[#FFE0A3] disabled:pointer-events-none disabled:opacity-45"
                disabled={!value}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-[#D2B77F] transition-colors hover:text-[#FFE0A3]"
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
  disabled,
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
  disabled: boolean;
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

  const rate =
    worker.dailyRate != null && Number(worker.dailyRate) >= 0 ? Number(worker.dailyRate) : 0;
  const total = computeRegularPay(rate, morning, afternoon);

  return (
    <div
      className={cn(
        workerGridClass,
        "min-h-[54px] border-b border-white/[0.065] px-3 text-sm transition-colors last:border-b-0 hover:bg-white/[0.035] [&>div]:min-w-0",
        disabled && "bg-white/[0.018] opacity-70 hover:bg-white/[0.018]"
      )}
      role="row"
    >
      <div className="pr-1">
        <span
          className="block truncate text-[13px] font-semibold text-[var(--neo-text-primary)]"
          title={worker.name}
        >
          {worker.name}
        </span>
        {disabled ? (
          <span className="mt-0.5 block truncate text-[11px] font-medium text-[var(--neo-text-tertiary)]">
            Already has entry
          </span>
        ) : null}
      </div>
      <div className="whitespace-nowrap text-right text-xs font-medium tabular-nums text-[var(--neo-text-secondary)]">
        ${Math.round(rate)}/d
      </div>
      <div className="flex justify-center">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-8 min-h-8 w-full rounded-md border-white/[0.09] bg-white/[0.035] px-0 text-[11px] font-semibold tracking-[0.04em] text-[var(--neo-text-secondary)] shadow-none hover:border-white/[0.14] hover:bg-white/[0.065] hover:text-[var(--neo-text-primary)] max-md:min-h-[44px]",
            morning &&
              "border-[rgba(184,147,90,0.5)] bg-[rgba(184,147,90,0.18)] text-[#F4D89E] hover:border-[rgba(184,147,90,0.6)] hover:bg-[rgba(184,147,90,0.22)] hover:text-[#FFE0A3]"
          )}
          onClick={onAm}
          disabled={disabled}
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
            "h-8 min-h-8 w-full rounded-md border-white/[0.09] bg-white/[0.035] px-0 text-[11px] font-semibold tracking-[0.04em] text-[var(--neo-text-secondary)] shadow-none hover:border-white/[0.14] hover:bg-white/[0.065] hover:text-[var(--neo-text-primary)] max-md:min-h-[44px]",
            afternoon &&
              "border-[rgba(184,147,90,0.5)] bg-[rgba(184,147,90,0.18)] text-[#F4D89E] hover:border-[rgba(184,147,90,0.6)] hover:bg-[rgba(184,147,90,0.22)] hover:text-[#FFE0A3]"
          )}
          onClick={onPm}
          disabled={disabled}
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
          disabled={disabled}
          className="h-8 min-h-8 w-full min-w-0 rounded-md border-white/[0.09] bg-white/[0.035] px-1 text-center text-sm tabular-nums text-[var(--neo-text-primary)] hover:border-white/[0.14] hover:bg-white/[0.065] focus-visible:border-[var(--neo-gold)] focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-[44px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
          disabled={disabled}
          className="h-8 min-h-8 w-full min-w-0 rounded-md border-white/[0.09] bg-white/[0.035] px-1 text-center text-sm tabular-nums text-[var(--neo-text-primary)] hover:border-white/[0.14] hover:bg-white/[0.065] focus-visible:border-[var(--neo-gold)] focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-[44px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <div className="pr-1 text-right text-xs font-semibold tabular-nums text-[var(--neo-text-secondary)]">
        {morning || afternoon ? `$${total.toFixed(2)}` : "—"}
      </div>
    </div>
  );
});

export function AddDailyEntryModal({ open, onOpenChange, onSuccess }: Props) {
  const [projectId, setProjectId] = React.useState("");
  const [workDate, setWorkDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [projects, setProjects] = React.useState<LaborProjectOption[]>([]);
  const [workers, setWorkers] = React.useState<LaborWorker[]>([]);
  const [selectionByWorkerId, setSelectionByWorkerId] = React.useState<Record<string, Sel>>({});
  const selectionRef = React.useRef(selectionByWorkerId);
  React.useEffect(() => {
    selectionRef.current = selectionByWorkerId;
  }, [selectionByWorkerId]);
  const [disabledWorkerIds, setDisabledWorkerIds] = React.useState<Set<string>>(new Set());
  const [notes, setNotes] = React.useState("");
  const [costCode, setCostCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !workDate) {
      setDisabledWorkerIds(new Set());
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
        setSelectionByWorkerId((prev) => {
          const next = Object.fromEntries(
            nextWorkers.map((worker) => [worker.id, prev[worker.id] ?? defaultSel()])
          ) as Record<string, Sel>;
          return next;
        });
        setDisabledWorkerIds(
          new Set((body.entries ?? []).map((e) => e.worker_id ?? e.workerId ?? ""))
        );
        setError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setDisabledWorkerIds(new Set());
          setProjects([]);
          setWorkers([]);
          setError("Failed to load labor options.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, workDate]);

  const toggleMorning = React.useCallback(
    (workerId: string) => {
      if (disabledWorkerIds.has(workerId)) return;
      setSelectionByWorkerId((prev) => {
        const cur = prev[workerId] ?? defaultSel();
        return { ...prev, [workerId]: { ...cur, morning: !cur.morning } };
      });
    },
    [disabledWorkerIds]
  );

  const toggleAfternoon = React.useCallback(
    (workerId: string) => {
      if (disabledWorkerIds.has(workerId)) return;
      setSelectionByWorkerId((prev) => {
        const cur = prev[workerId] ?? defaultSel();
        return { ...prev, [workerId]: { ...cur, afternoon: !cur.afternoon } };
      });
    },
    [disabledWorkerIds]
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
      onOpenChange(false);
      onSuccess(workDate);
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
          "w-[min(740px,calc(100vw-24px))] max-w-[740px] max-h-[calc(100vh-48px)] overflow-hidden rounded-[1.5rem] border-white/[0.11] bg-[#101318] p-0 text-[var(--neo-text-primary)] shadow-[0_34px_92px_rgba(0,0,0,0.52),0_8px_24px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.055)]",
          "flex flex-col gap-0",
          "max-md:!bottom-auto max-md:!left-1/2 max-md:!right-auto max-md:!top-1/2 max-md:!w-[calc(100vw-24px)] max-md:!max-w-[calc(100vw-24px)] max-md:!-translate-x-1/2 max-md:!-translate-y-1/2 max-md:!rounded-[1.5rem] max-md:!border-b max-md:!max-h-[calc(100dvh-24px)]",
          "[&>button.absolute]:right-4 [&>button.absolute]:top-4 [&>button.absolute]:h-9 [&>button.absolute]:w-9 [&>button.absolute]:rounded-lg [&>button.absolute]:border [&>button.absolute]:border-white/[0.08] [&>button.absolute]:bg-white/[0.035] [&>button.absolute]:text-[var(--neo-text-secondary)] [&>button.absolute]:opacity-100 [&>button.absolute]:hover:border-white/[0.16] [&>button.absolute]:hover:bg-white/[0.08] [&>button.absolute]:hover:text-white"
        )}
      >
        <DialogHeader className="sticky top-0 z-20 shrink-0 space-y-0 border-b border-white/[0.08] bg-[#101318]/95 px-5 py-4 pr-16 backdrop-blur">
          <DialogTitle className="text-[17px] font-semibold tracking-normal text-[#F6F7FA]">
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
                  className={cn(
                    fieldClass,
                    "w-full px-3 [color-scheme:dark] focus-visible:outline-none"
                  )}
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
                <AddDailyEntryDateField value={workDate} onChange={setWorkDate} />
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
              <p className="text-[11px] leading-5 text-[var(--neo-text-tertiary)]">
                Workers who have completed a full day (AM+PM) on this date are disabled across all
                projects.
              </p>
            </div>
            <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className={cn(modalScrollbar, "overflow-x-auto")}>
                <div className="min-w-[720px] sm:min-w-0">
                  <div
                    className={cn(
                      workerGridClass,
                      "border-b border-white/[0.08] bg-[#11151c] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]"
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
                  {workers.length > WORKER_LIST_VIRTUAL_THRESHOLD ? (
                    <VirtualScrollList
                      count={workers.length}
                      estimateSize={WORKER_ROW_ESTIMATE_PX}
                      className={cn(
                        modalScrollbar,
                        "min-h-[132px] max-h-[min(42vh,372px)] flex-1 overflow-auto"
                      )}
                    >
                      {(index) => {
                        const worker = workers[index];
                        if (!worker) return null;
                        const sel = selectionByWorkerId[worker.id] ?? defaultSel();
                        const disabled = disabledWorkerIds.has(worker.id);
                        return (
                          <AddDailyEntryWorkerRow
                            key={worker.id}
                            worker={worker}
                            morning={sel.morning}
                            afternoon={sel.afternoon}
                            otHours={sel.otHours}
                            otAmount={sel.otAmount}
                            disabled={disabled}
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
                      {workers.map((worker) => {
                        const sel = selectionByWorkerId[worker.id] ?? defaultSel();
                        const disabled = disabledWorkerIds.has(worker.id);
                        return (
                          <AddDailyEntryWorkerRow
                            key={worker.id}
                            worker={worker}
                            morning={sel.morning}
                            afternoon={sel.afternoon}
                            otHours={sel.otHours}
                            otAmount={sel.otAmount}
                            disabled={disabled}
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
            <div className="rounded-xl border border-white/[0.08] bg-[#0d0f14] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
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
            {error ? <p className="text-sm font-medium text-red-300">{error}</p> : null}
          </div>
          <DialogFooter className="m-0 shrink-0 border-t border-white/[0.08] bg-[#111318]/95 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-14px_34px_rgba(0,0,0,0.18)] backdrop-blur sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg px-4 text-[var(--neo-text-secondary)] hover:bg-white/[0.06] hover:text-[var(--neo-text-primary)] max-lg:min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              className="h-9 rounded-lg border-transparent bg-[var(--neo-gold)] px-4 text-zinc-950 shadow-[0_10px_24px_rgba(184,147,90,0.18)] hover:bg-[var(--neo-gold-soft)] max-lg:min-h-[44px]"
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

"use client";

import * as React from "react";
import {
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { DayPicker, type DateRange, getDefaultClassNames } from "react-day-picker";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

const rdp = getDefaultClassNames();

export type ExpenseDateFilterPreset =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export type ExpenseDateFilterValue =
  | { kind: "all" }
  | {
      kind: "range";
      /** Inclusive local calendar dates YYYY-MM-DD */
      start: string;
      end: string;
      preset: ExpenseDateFilterPreset;
    };

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function ymdToLocalDate(ymd: string): Date {
  const [y, m, day] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, day);
}

export function computePresetRange(preset: Exclude<ExpenseDateFilterPreset, "all" | "custom">): {
  start: string;
  end: string;
} {
  const now = new Date();
  let start: Date;
  let end: Date;
  switch (preset) {
    case "today":
      start = startOfDay(now);
      end = endOfDay(now);
      break;
    case "yesterday": {
      const y = subDays(now, 1);
      start = startOfDay(y);
      end = endOfDay(y);
      break;
    }
    case "last7":
      start = startOfDay(subDays(now, 6));
      end = endOfDay(now);
      break;
    case "last30":
      start = startOfDay(subDays(now, 29));
      end = endOfDay(now);
      break;
    case "thisMonth":
      start = startOfMonth(now);
      end = endOfDay(now);
      break;
    case "lastMonth": {
      const ref = subMonths(now, 1);
      start = startOfMonth(ref);
      end = endOfMonth(ref);
      break;
    }
    default:
      start = startOfDay(now);
      end = endOfDay(now);
  }
  return { start: toYmd(start), end: toYmd(end) };
}

function presetLabel(p: ExpenseDateFilterPreset): string | null {
  switch (p) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "last7":
      return "Last 7 days";
    case "last30":
      return "Last 30 days";
    case "thisMonth":
      return "This month";
    case "lastMonth":
      return "Last month";
    default:
      return null;
  }
}

function formatRangeSpanLabel(startYmd: string, endYmd: string): string {
  const a = ymdToLocalDate(startYmd);
  const b = ymdToLocalDate(endYmd);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = format(a, sameYear ? "MMM d" : "MMM d, yyyy");
  const right = format(b, "MMM d, yyyy");
  return `${left} – ${right}`;
}

export function formatExpenseDateFilterTrigger(value: ExpenseDateFilterValue): string {
  if (value.kind === "all") return "All dates";
  const pl = presetLabel(value.preset);
  if (pl && value.preset !== "custom") return pl;
  return formatRangeSpanLabel(value.start, value.end);
}

type Panel = "menu" | "custom";

const MENU_ITEM =
  "flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-[#111827] outline-none transition-colors hover:bg-gray-50 focus:bg-gray-50 dark:text-foreground dark:hover:bg-muted/60 dark:focus:bg-muted/60";

export type ExpenseDateRangeFilterProps = {
  value: ExpenseDateFilterValue;
  onChange: (next: ExpenseDateFilterValue) => void;
  className?: string;
};

export function ExpenseDateRangeFilter({
  value,
  onChange,
  className,
}: ExpenseDateRangeFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<Panel>("menu");
  const [draft, setDraft] = React.useState<DateRange | undefined>(() =>
    value.kind === "range"
      ? { from: ymdToLocalDate(value.start), to: ymdToLocalDate(value.end) }
      : undefined
  );
  const [month, setMonth] = React.useState<Date>(() =>
    value.kind === "range" ? ymdToLocalDate(value.start) : new Date()
  );
  const prevPanelRef = React.useRef<Panel>("menu");

  React.useEffect(() => {
    const prev = prevPanelRef.current;
    prevPanelRef.current = panel;
    if (panel !== "custom" || prev === "custom") return;
    if (value.kind === "range") {
      setDraft({ from: ymdToLocalDate(value.start), to: ymdToLocalDate(value.end) });
      setMonth(ymdToLocalDate(value.start));
    } else {
      const { start, end } = computePresetRange("last30");
      setDraft({ from: ymdToLocalDate(start), to: ymdToLocalDate(end) });
      setMonth(ymdToLocalDate(start));
    }
  }, [panel, value]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPanel("menu");
    }
  };

  const applyPreset = (preset: Exclude<ExpenseDateFilterPreset, "all" | "custom">) => {
    const { start, end } = computePresetRange(preset);
    onChange({ kind: "range", start, end, preset });
    setOpen(false);
    setPanel("menu");
  };

  const applyAll = () => {
    onChange({ kind: "all" });
    setOpen(false);
    setPanel("menu");
  };

  const applyCustom = () => {
    if (!draft?.from) return;
    const to = draft.to ?? draft.from;
    onChange({
      kind: "range",
      start: toYmd(startOfDay(draft.from)),
      end: toYmd(startOfDay(to)),
      preset: "custom",
    });
    setOpen(false);
    setPanel("menu");
  };

  const applyShortcutInCustom = (preset: "today" | "last7" | "last30" | "thisMonth") => {
    const { start, end } = computePresetRange(preset);
    setDraft({ from: ymdToLocalDate(start), to: ymdToLocalDate(end) });
    setMonth(ymdToLocalDate(start));
  };

  const label = formatExpenseDateFilterTrigger(value);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 min-w-[7.5rem] items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-2.5 text-left text-xs font-medium text-[#111827] shadow-none transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/50",
            className
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(
          "p-0",
          panel === "menu"
            ? "w-[min(100vw-16px_260px)]"
            : "w-[min(100vw-16px_720px)] max-w-[calc(100vw-16px)]"
        )}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {panel === "menu" ? (
          <div className="py-1.5">
            <button type="button" className={MENU_ITEM} onClick={applyAll}>
              All dates
            </button>
            <button type="button" className={MENU_ITEM} onClick={() => applyPreset("today")}>
              Today
            </button>
            <button type="button" className={MENU_ITEM} onClick={() => applyPreset("yesterday")}>
              Yesterday
            </button>
            <button type="button" className={MENU_ITEM} onClick={() => applyPreset("last7")}>
              Last 7 days
            </button>
            <button type="button" className={MENU_ITEM} onClick={() => applyPreset("last30")}>
              Last 30 days
            </button>
            <button type="button" className={MENU_ITEM} onClick={() => applyPreset("thisMonth")}>
              This month
            </button>
            <button type="button" className={MENU_ITEM} onClick={() => applyPreset("lastMonth")}>
              Last month
            </button>
            <div className="my-1.5 h-px bg-gray-200 dark:bg-border" />
            <button
              type="button"
              className={cn(MENU_ITEM, "justify-between font-medium")}
              onClick={() => setPanel("custom")}
            >
              Custom range
              <ChevronRight className="h-4 w-4 opacity-50" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-0 sm:flex-row">
            <div className="expense-date-range-picker border-b border-gray-100 p-2 sm:border-b-0 sm:border-r dark:border-border">
              <DayPicker
                mode="range"
                month={month}
                onMonthChange={setMonth}
                numberOfMonths={2}
                selected={draft}
                onSelect={setDraft}
                showOutsideDays
                classNames={{
                  ...rdp,
                  months: cn(rdp.months, "flex flex-col gap-4 sm:flex-row sm:gap-6"),
                  month: cn(rdp.month, "space-y-2"),
                  month_caption: cn(
                    rdp.month_caption,
                    "flex items-center justify-center gap-1 pt-1 text-sm font-medium text-[#111827] dark:text-foreground"
                  ),
                  nav: cn(rdp.nav, "flex items-center gap-1"),
                  button_previous: cn(
                    rdp.button_previous,
                    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-100 bg-white hover:bg-gray-50 dark:border-border dark:bg-card"
                  ),
                  button_next: cn(
                    rdp.button_next,
                    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-100 bg-white hover:bg-gray-50 dark:border-border dark:bg-card"
                  ),
                  month_grid: cn(rdp.month_grid, "w-full"),
                  weekdays: cn(rdp.weekdays, "flex"),
                  weekday: cn(rdp.weekday, "w-9 text-[11px] font-medium text-[#6b7280]"),
                  week: cn(rdp.week, "flex w-full"),
                  day: cn(rdp.day, "p-0 text-center text-sm"),
                  day_button: cn(
                    rdp.day_button,
                    "h-9 w-9 rounded-md text-[#111827] hover:bg-gray-100 dark:text-foreground dark:hover:bg-muted/50"
                  ),
                  selected: cn(
                    rdp.selected,
                    "!bg-blue-600 font-medium !text-white hover:!bg-blue-600"
                  ),
                  range_start: cn(rdp.range_start, "rounded-r-none !bg-blue-600"),
                  range_end: cn(rdp.range_end, "rounded-l-none !bg-blue-600"),
                  range_middle: cn(
                    rdp.range_middle,
                    "rounded-none bg-blue-100 text-[#111827] dark:bg-blue-950/40 dark:text-foreground"
                  ),
                  today: cn(rdp.today, "font-semibold text-blue-600"),
                  outside: cn(rdp.outside, "text-gray-400 opacity-60"),
                  disabled: cn(rdp.disabled, "opacity-40"),
                }}
              />
            </div>
            <div className="flex w-full flex-col justify-between gap-3 p-3 sm:w-[148px] sm:shrink-0">
              <div className="flex flex-col gap-1">
                <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-[#6b7280]">
                  Quick select
                </p>
                <button
                  type="button"
                  className={cn(MENU_ITEM, "py-1.5 text-xs")}
                  onClick={() => applyShortcutInCustom("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={cn(MENU_ITEM, "py-1.5 text-xs")}
                  onClick={() => applyShortcutInCustom("last7")}
                >
                  Last 7 days
                </button>
                <button
                  type="button"
                  className={cn(MENU_ITEM, "py-1.5 text-xs")}
                  onClick={() => applyShortcutInCustom("last30")}
                >
                  Last 30 days
                </button>
                <button
                  type="button"
                  className={cn(MENU_ITEM, "py-1.5 text-xs")}
                  onClick={() => applyShortcutInCustom("thisMonth")}
                >
                  This month
                </button>
              </div>
              <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full rounded-lg border-gray-100 bg-white text-xs hover:bg-gray-50"
                  onClick={() => setPanel("menu")}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 rounded-lg border-gray-100 bg-white text-xs hover:bg-gray-50"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 flex-1 rounded-lg border-0 bg-black text-xs text-white hover:bg-gray-900"
                    disabled={!draft?.from}
                    onClick={applyCustom}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function expenseDateInFilter(
  expenseDate: string | undefined,
  filter: ExpenseDateFilterValue
): boolean {
  if (filter.kind === "all") return true;
  const d = (expenseDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d >= filter.start && d <= filter.end;
}

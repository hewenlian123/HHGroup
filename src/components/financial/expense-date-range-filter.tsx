"use client";

import * as React from "react";
import { format, startOfDay } from "date-fns";
import { DayPicker, type DateRange, getDefaultClassNames } from "react-day-picker";
import { ChevronLeft } from "lucide-react";

import { FilterSelect } from "@/components/financial/filter-select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { formatDateRange } from "@/lib/formatters";
import {
  addCalendarDaysYmd,
  calendarMonthStartYmd,
  hawaiiTodayYmd,
} from "@/lib/hawaii-calendar-date";
import { cn } from "@/lib/utils";
import calendarStyles from "@/components/ui/date-picker.module.css";

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
  const today = hawaiiTodayYmd();
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const yesterday = addCalendarDaysYmd(today, -1);
      return { start: yesterday, end: yesterday };
    }
    case "last7":
      return { start: addCalendarDaysYmd(today, -6), end: today };
    case "last30":
      return { start: addCalendarDaysYmd(today, -29), end: today };
    case "thisMonth":
      return { start: calendarMonthStartYmd(today), end: today };
    case "lastMonth": {
      const end = addCalendarDaysYmd(calendarMonthStartYmd(today), -1);
      return { start: calendarMonthStartYmd(end), end };
    }
    default:
      return { start: today, end: today };
  }
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
  return formatDateRange(startYmd, endYmd, "compact");
}

export function formatExpenseDateFilterTrigger(value: ExpenseDateFilterValue): string {
  if (value.kind === "all") return "All time";
  const pl = presetLabel(value.preset);
  if (pl && value.preset !== "custom") return pl;
  return formatRangeSpanLabel(value.start, value.end);
}

type Panel = "menu" | "custom";

const MENU_ITEM =
  "hh-focus-ring flex min-h-11 w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-[var(--hh-text-primary)] transition-colors hover:bg-[var(--hh-l3-hover)] focus:bg-[var(--hh-l3-hover)] lg:min-h-hh-row-dense";

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
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const openCustomAfterSelect = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<Panel>("menu");
  const [draft, setDraft] = React.useState<DateRange | undefined>(() =>
    value.kind === "range"
      ? { from: ymdToLocalDate(value.start), to: ymdToLocalDate(value.end) }
      : undefined
  );
  const [month, setMonth] = React.useState<Date>(() =>
    value.kind === "range" ? ymdToLocalDate(value.start) : ymdToLocalDate(hawaiiTodayYmd())
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
      <PopoverAnchor asChild>
        <div className={className}>
          <FilterSelect
            triggerRef={triggerRef}
            open={presetsOpen}
            onOpenChange={setPresetsOpen}
            onCloseAutoFocus={(event) => {
              if (!openCustomAfterSelect.current) return;
              event.preventDefault();
              openCustomAfterSelect.current = false;
              setPanel("custom");
              setOpen(true);
            }}
            label="Filter by date"
            value={
              value.kind === "all"
                ? "all"
                : value.preset && value.preset !== "custom"
                  ? value.preset
                  : "currentRange"
            }
            onValueChange={(next) => {
              if (next === "custom") {
                openCustomAfterSelect.current = true;
              } else if (next === "all") applyAll();
              else applyPreset(next as Exclude<ExpenseDateFilterPreset, "all" | "custom">);
            }}
            options={[
              ...(value.kind === "range" && (!value.preset || value.preset === "custom")
                ? [{ value: "currentRange", label, disabled: true }]
                : []),
              { value: "all", label: "All time" },
              { value: "today", label: "Today" },
              { value: "yesterday", label: "Yesterday" },
              { value: "last7", label: "Last 7 days" },
              { value: "last30", label: "Last 30 days" },
              { value: "thisMonth", label: "This month" },
              { value: "lastMonth", label: "Last month" },
              { value: "custom", label: "Custom range" },
            ]}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!presetsOpen) triggerRef.current?.focus();
        }}
        sideOffset={6}
        collisionPadding={2}
        data-expense-component-surface="date-filter"
        className={cn(
          "expenses-ui-dialog z-[130] p-0 [@media(pointer:coarse)]:[&_button]:min-h-11",
          panel === "menu"
            ? "w-[min(100vw-16px_260px)] overflow-visible"
            : "max-h-[var(--radix-popover-content-available-height)] w-max max-w-[calc(100vw-4px)] overflow-y-auto"
        )}
      >
        <div className="flex flex-col gap-0 lg:flex-row">
          <div className="expense-date-range-picker min-w-0 border-b border-[var(--hh-border)] p-0.5 lg:border-b-0 lg:border-r">
            <DayPicker
              className={calendarStyles.calendar}
              navLayout="around"
              style={
                {
                  "--rdp-accent-color": "var(--hh-action-primary)",
                  "--rdp-weekday-opacity": "1",
                  "--rdp-outside-opacity": "1",
                  "--rdp-range_middle-color": "var(--hh-action-primary-foreground)",
                  "--rdp-range_start-color": "var(--hh-action-primary-foreground)",
                  "--rdp-range_end-color": "var(--hh-action-primary-foreground)",
                } as React.CSSProperties
              }
              mode="range"
              today={ymdToLocalDate(hawaiiTodayYmd())}
              month={month}
              onMonthChange={setMonth}
              numberOfMonths={2}
              selected={draft}
              onSelect={setDraft}
              showOutsideDays
              classNames={{
                ...rdp,
                months: cn(rdp.months, "flex flex-col gap-4"),
                month: cn(rdp.month, "space-y-2"),
                month_caption: cn(
                  rdp.month_caption,
                  "flex items-center justify-center gap-1 pt-1 text-sm font-medium text-[var(--hh-text-primary)]"
                ),
                nav: cn(rdp.nav, "flex items-center gap-1"),
                button_previous: cn(
                  rdp.button_previous,
                  "inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] hover:bg-[var(--hh-l3-hover)] lg:h-8 lg:w-8"
                ),
                button_next: cn(
                  rdp.button_next,
                  "inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] hover:bg-[var(--hh-l3-hover)] lg:h-8 lg:w-8"
                ),
                month_grid: cn(rdp.month_grid, "w-full"),
                weekdays: cn(rdp.weekdays, "flex"),
                weekday: cn(
                  rdp.weekday,
                  "w-11 text-hh-status font-medium text-[var(--hh-text-secondary)] lg:w-9 [@media(pointer:coarse)]:w-11"
                ),
                week: cn(rdp.week, "flex w-full"),
                day: cn(rdp.day, "p-0 text-center text-sm"),
                day_button: cn(
                  rdp.day_button,
                  "h-11 w-11 rounded-md text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)] lg:h-9 lg:w-9"
                ),
                selected: cn(
                  rdp.selected,
                  "!bg-[var(--hh-action-primary)] font-medium !text-[var(--hh-action-primary-foreground)] [&>button]:!text-[var(--hh-action-primary-foreground)] hover:!bg-[var(--hh-action-primary)]"
                ),
                range_start: cn(rdp.range_start, "rounded-r-none !bg-[var(--hh-action-primary)]"),
                range_end: cn(rdp.range_end, "rounded-l-none !bg-[var(--hh-action-primary)]"),
                range_middle: cn(
                  rdp.range_middle,
                  "rounded-none bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                ),
                today: cn(rdp.today, "font-semibold text-[var(--hh-text-primary)]"),
                outside: cn(rdp.outside, "text-[var(--hh-text-secondary)]"),
                disabled: cn(rdp.disabled, "opacity-40"),
              }}
            />
          </div>
          <div className="flex w-full flex-col justify-between gap-3 p-3 lg:w-[148px] lg:shrink-0">
            <div className="flex flex-col gap-1">
              <p className="px-1 text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
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
            <div className="flex flex-col gap-2 border-t border-[var(--hh-border)] pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 min-h-11 w-full rounded-lg text-xs lg:h-8 lg:min-h-8"
                onClick={() => {
                  setOpen(false);
                  setPanel("menu");
                  setPresetsOpen(true);
                }}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 min-h-11 flex-1 rounded-lg text-xs lg:h-8 lg:min-h-8"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-11 min-h-11 flex-1 rounded-lg border-0 text-xs lg:h-8 lg:min-h-8"
                  disabled={!draft?.from}
                  onClick={applyCustom}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
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

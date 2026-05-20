"use client";

import * as React from "react";
import { format } from "date-fns";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const rdp = getDefaultClassNames();

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
  return format(d, "yyyy-MM-dd");
}

export type FinanceDatePickerProps = {
  value: string;
  onChange: (nextYmd: string) => void;
  disabled?: boolean;
  className?: string;
  /** When true, renders a 44px trigger for mobile. */
  size?: "sm" | "md";
  /** Show footer actions (Clear/Today). */
  showFooter?: boolean;
  /** If false, Clear is disabled (use for required dates). */
  allowClear?: boolean;
  /** Dark glass styling for estimate builder (popover + trigger). */
  appearance?: "default" | "glass";
};

export function FinanceDatePicker({
  value,
  onChange,
  disabled,
  className,
  size = "sm",
  showFooter = true,
  allowClear = false,
  appearance = "default",
}: FinanceDatePickerProps) {
  const isGlass = appearance === "glass";
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => ymdToLocalDate(value), [value]);
  const label = selected ? format(selected, "MMM dd \u00b7 yyyy") : "Select date";
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex w-full items-center justify-between gap-2 rounded-md border px-3 text-left font-medium tracking-tight transition-colors focus-visible:outline-none",
            isGlass
              ? "eb-date-field border-white/[0.06] bg-white/[0.02] text-zinc-100 hover:border-white/[0.09] hover:bg-white/[0.035] focus-visible:border-white/[0.14] focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.05)]"
              : "border-border/60 bg-transparent text-zinc-800 hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-emerald-400/30",
            size === "md" ? "h-11 min-h-[44px] text-sm" : "h-9 text-sm",
            disabled && "pointer-events-none opacity-60",
            className
          )}
          aria-label="Choose date"
        >
          <span className="truncate tabular-nums">{label}</span>
          <CalendarDays
            className={cn("h-4 w-4 shrink-0", isGlass ? "text-zinc-400/80" : "text-zinc-400/70")}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          "z-[130] p-3",
          "w-[280px] max-w-[calc(100vw-16px)]",
          isGlass
            ? "rounded-xl border border-white/10 bg-[rgba(18,22,34,0.96)] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_48px_rgba(0,0,0,0.42)] backdrop-blur-[28px] backdrop-saturate-[175%]"
            : "rounded-2xl border border-border/35 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.10)] dark:bg-popover dark:shadow-none"
        )}
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
              "flex items-center justify-between gap-2 px-0.5 py-0",
              "min-h-8"
            ),
            caption_label: cn(
              rdp.caption_label,
              "flex items-center justify-center text-sm font-semibold leading-none",
              isGlass ? "text-zinc-50" : "text-zinc-900"
            ),
            nav: cn(rdp.nav, "gap-1 items-center"),
            button_previous: cn(
              rdp.button_previous,
              "flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent transition-colors",
              isGlass ? "hover:bg-white/[0.08]" : "hover:bg-zinc-100 dark:hover:bg-muted/40"
            ),
            button_next: cn(
              rdp.button_next,
              "flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent transition-colors",
              isGlass ? "hover:bg-white/[0.08]" : "hover:bg-zinc-100 dark:hover:bg-muted/40"
            ),
            weekdays: cn(
              rdp.weekdays,
              "text-[10px] font-medium",
              isGlass ? "text-zinc-500" : "text-zinc-400"
            ),
            weekday: cn(rdp.weekday, "w-8 text-center"),
            week: cn(rdp.week, "gap-1"),
            day: cn(
              rdp.day,
              "h-8 w-8 rounded-md text-sm transition-colors",
              isGlass ? "hover:bg-white/[0.08]" : "hover:bg-zinc-100 dark:hover:bg-muted/30"
            ),
            day_button: cn(
              (rdp as unknown as Record<string, string>).day_button ?? "",
              "flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium leading-none",
              isGlass ? "text-zinc-300" : "text-zinc-800"
            ),
            today: cn(
              rdp.today,
              isGlass
                ? "ring-1 ring-inset ring-amber-300/30"
                : "ring-1 ring-inset ring-emerald-500/25 dark:ring-emerald-400/25"
            ),
            selected: cn(
              rdp.selected,
              isGlass
                ? "bg-amber-200/20 ring-0 hover:bg-amber-200/20 [&_button]:border [&_button]:border-amber-200/35 [&_button]:text-amber-50"
                : "bg-emerald-600 text-white ring-0 hover:bg-emerald-600 dark:bg-emerald-500 dark:text-slate-950"
            ),
            outside: cn(
              rdp.outside,
              isGlass ? "text-zinc-600" : "text-zinc-300 dark:text-zinc-600"
            ),
          }}
          components={{
            Chevron: (props) =>
              props.orientation === "left" ? (
                <ChevronLeft
                  className={cn("h-4 w-4", isGlass ? "text-zinc-400" : "text-zinc-600")}
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  className={cn("h-4 w-4", isGlass ? "text-zinc-400" : "text-zinc-600")}
                  aria-hidden
                />
              ),
          }}
          footer={
            showFooter ? (
              <div
                className={cn(
                  "mt-2 flex items-center justify-between border-t pt-2",
                  isGlass ? "border-white/10" : "border-border/30"
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
                    isGlass
                      ? "text-amber-200/80 hover:text-amber-100"
                      : "text-emerald-700 hover:text-emerald-800"
                  )}
                  disabled={!allowClear}
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className={cn(
                    "text-xs font-medium transition-colors",
                    isGlass
                      ? "text-amber-200/80 hover:text-amber-100"
                      : "text-emerald-700 hover:text-emerald-800"
                  )}
                  onClick={() => {
                    const today = new Date();
                    onChange(toYmd(today));
                    setMonth(today);
                    setOpen(false);
                  }}
                >
                  Today
                </button>
              </div>
            ) : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

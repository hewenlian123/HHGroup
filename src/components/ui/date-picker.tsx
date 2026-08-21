"use client";

import * as React from "react";
import { format } from "date-fns";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { cn } from "@/lib/utils";
import styles from "./date-picker.module.css";

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
  id?: string;
  ariaLabel?: string;
  displayFormat?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Optional theme scope for the portaled calendar surface. */
  contentClassName?: string;
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
  id,
  ariaLabel = "Choose date",
  displayFormat = "MMM dd \u00b7 yyyy",
  placeholder = "Select date",
  disabled,
  className,
  contentClassName,
  size = "sm",
  showFooter = true,
  allowClear = false,
  appearance = "default",
}: FinanceDatePickerProps) {
  const isGlass = appearance === "glass";
  const [open, setOpen] = React.useState(false);
  const [isDarkSurface, setIsDarkSurface] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const selected = React.useMemo(() => ymdToLocalDate(value), [value]);
  const label = selected ? format(selected, displayFormat) : placeholder;
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
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setIsDarkSurface(
            Boolean(
              triggerRef.current?.closest(".dark") ||
              document.documentElement.classList.contains("dark")
            )
          );
        }
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex w-full items-center justify-between gap-2 rounded-md border px-3 text-left font-medium tracking-normal transition-[background-color,border-color,box-shadow,color] duration-120 ease-out focus-visible:outline-none motion-reduce:transition-none",
            isGlass
              ? "eb-date-field border-white/[0.06] bg-white/[0.02] text-zinc-100 hover:border-white/[0.09] hover:bg-white/[0.035] focus-visible:border-white/[0.14] focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.05)]"
              : "border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--neo-text-primary)] hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] focus-visible:border-[var(--neo-text-tertiary)] focus-visible:ring-2 focus-visible:ring-[var(--hh-border-strong)]",
            size === "md" ? "h-11 min-h-[44px] text-sm" : "h-9 text-sm",
            disabled && "pointer-events-none opacity-60",
            className
          )}
          aria-label={ariaLabel}
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
        collisionPadding={8}
        themeScope={isGlass || isDarkSurface ? "dark" : "light"}
        data-finance-date-picker-content="true"
        data-finance-date-picker-appearance={appearance}
        data-expense-component-surface={
          contentClassName?.includes("expenses-ui-dialog") ? "date-picker" : undefined
        }
        className={cn(
          "z-[130] max-h-[var(--radix-popover-content-available-height)] w-[332px] max-w-[calc(100vw-16px)] overflow-y-auto p-3 sm:w-[280px]",
          styles.content,
          isGlass
            ? "rounded-[10px] border border-white/10 bg-[rgba(18,22,34,0.96)] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur-[28px] backdrop-saturate-[175%]"
            : "rounded-[10px] border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] text-[var(--neo-text-primary)] shadow-[var(--hh-shadow-floating)]",
          contentClassName
        )}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <DayPicker
          mode="single"
          className={cn("hh-finance-date-picker", styles.calendar)}
          style={
            {
              "--rdp-accent-color": "transparent",
              "--rdp-selected-border": "1px solid transparent",
              "--rdp-today-color": "inherit",
            } as React.CSSProperties
          }
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
              "flex min-h-10 items-center justify-between gap-2 px-0.5 py-0 sm:min-h-8"
            ),
            caption_label: cn(
              rdp.caption_label,
              "flex items-center justify-center text-[13px] font-semibold leading-none tracking-[-0.01em]",
              isGlass ? "text-zinc-50" : "text-[var(--neo-text-primary)]"
            ),
            nav: cn(rdp.nav, "gap-1 items-center"),
            button_previous: cn(
              rdp.button_previous,
              "flex h-10 w-10 items-center justify-center rounded-md border-0 bg-transparent transition-colors duration-120 ease-out focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none sm:h-8 sm:w-8",
              isGlass
                ? "text-zinc-400 hover:bg-white/[0.08] focus-visible:ring-white/20"
                : "text-[var(--neo-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] focus-visible:ring-[var(--hh-border-strong)]"
            ),
            button_next: cn(
              rdp.button_next,
              "flex h-10 w-10 items-center justify-center rounded-md border-0 bg-transparent transition-colors duration-120 ease-out focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none sm:h-8 sm:w-8",
              isGlass
                ? "text-zinc-400 hover:bg-white/[0.08] focus-visible:ring-white/20"
                : "text-[var(--neo-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] focus-visible:ring-[var(--hh-border-strong)]"
            ),
            weekdays: cn(
              rdp.weekdays,
              "text-[10px] font-medium uppercase tracking-[0.04em]",
              isGlass ? "text-zinc-500" : "text-[var(--neo-text-tertiary)]"
            ),
            weekday: cn(rdp.weekday, "w-10 py-1 text-center sm:w-8"),
            week: cn(rdp.week, "gap-1"),
            day: cn(
              rdp.day,
              "h-10 w-10 rounded-md bg-transparent text-sm shadow-none sm:h-8 sm:w-8"
            ),
            day_button: cn(
              (rdp as unknown as Record<string, string>).day_button ?? "",
              "flex h-10 w-10 items-center justify-center rounded-md border border-transparent text-sm font-medium leading-none shadow-none transition-[background-color,border-color,color,box-shadow,opacity] duration-120 ease-out active:duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none sm:h-8 sm:w-8",
              isGlass
                ? "text-zinc-300 hover:bg-white/[0.08] active:bg-white/[0.12] focus-visible:ring-white/30 focus-visible:ring-offset-[#121622]"
                : "text-[var(--neo-text-primary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] focus-visible:ring-[var(--neo-text-tertiary)] focus-visible:ring-offset-[var(--hh-l4-floating-surface)]"
            ),
            today: cn(
              rdp.today,
              isGlass
                ? "font-semibold [&:not([data-selected=true])_button]:border-white/20"
                : "font-semibold [&:not([data-selected=true])_button]:border-[var(--hh-border-strong)]"
            ),
            selected: cn(
              rdp.selected,
              isGlass
                ? "bg-transparent shadow-none [&_button]:border-transparent [&_button]:bg-zinc-100 [&_button]:text-zinc-950 [&_button:hover]:bg-white"
                : "bg-transparent shadow-none [&_button]:border-[var(--hh-border-strong)] [&_button]:bg-[var(--hh-l3-selected)] [&_button]:text-[var(--neo-text-primary)] [&_button:hover]:bg-[var(--hh-l3-selected)]"
            ),
            outside: cn(
              rdp.outside,
              isGlass ? "text-zinc-600 opacity-55" : "text-[var(--neo-text-tertiary)] opacity-50"
            ),
            disabled: cn(rdp.disabled, "pointer-events-none cursor-not-allowed opacity-30"),
          }}
          components={{
            Chevron: (props) =>
              props.orientation === "left" ? (
                <ChevronLeft
                  className={cn(
                    "h-4 w-4",
                    isGlass ? "text-zinc-400" : "text-[var(--neo-text-secondary)]"
                  )}
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  className={cn(
                    "h-4 w-4",
                    isGlass ? "text-zinc-400" : "text-[var(--neo-text-secondary)]"
                  )}
                  aria-hidden
                />
              ),
          }}
          footer={
            showFooter ? (
              <div className="mt-2 flex items-center justify-between pt-1">
                <button
                  type="button"
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-md px-2 text-xs font-medium transition-colors duration-120 ease-out focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-35 motion-reduce:transition-none sm:min-h-8",
                    isGlass
                      ? "text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 focus-visible:ring-white/20"
                      : "text-[var(--neo-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] hover:text-[var(--neo-text-primary)] focus-visible:ring-[var(--hh-border-strong)]"
                  )}
                  disabled={!allowClear || !selected}
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
                    "inline-flex min-h-10 items-center rounded-md px-2 text-xs font-medium transition-colors duration-120 ease-out focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none sm:min-h-8",
                    isGlass
                      ? "text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 focus-visible:ring-white/20"
                      : "text-[var(--neo-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] hover:text-[var(--neo-text-primary)] focus-visible:ring-[var(--hh-border-strong)]"
                  )}
                  onClick={() => {
                    const todayYmd = hawaiiTodayYmd();
                    const today = ymdToLocalDate(todayYmd);
                    onChange(todayYmd);
                    if (today) setMonth(today);
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

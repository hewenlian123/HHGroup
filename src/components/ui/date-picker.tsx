"use client";

import * as React from "react";
import { format } from "date-fns";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { TYPO } from "@/lib/typography";
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
  /** @deprecated Retained for call-site compatibility; runtime is always V2 Light. */
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
}: FinanceDatePickerProps) {
  const [open, setOpen] = React.useState(false);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "hh-focus-ring hh-fin hh-touch-min inline-flex w-full items-center justify-between gap-hh-2 rounded-hh-standard border px-hh-3 text-left transition-[background-color,border-color,box-shadow,color] duration-150 ease-out motion-reduce:transition-none",
            TYPO.button,
            "border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]",
            size === "md" ? "h-hh-control-touch min-h-hh-touch" : "h-hh-control-standard",
            disabled && "pointer-events-none opacity-60",
            className
          )}
          aria-label={ariaLabel}
        >
          <span className="truncate tabular-nums">{label}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--hh-text-tertiary)]" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={8}
        themeScope="inherit"
        data-finance-date-picker-content="true"
        data-finance-date-picker-appearance="default"
        data-expense-component-surface={
          contentClassName?.includes("expenses-ui-dialog") ? "date-picker" : undefined
        }
        className={cn(
          "z-[130] max-h-[var(--radix-popover-content-available-height)] w-[332px] max-w-[calc(100vw-16px)] overflow-y-auto p-3 sm:w-[280px]",
          styles.content,
          "rounded-hh-standard border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] text-[var(--hh-text-primary)] shadow-floating",
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
              "flex items-center justify-center",
              TYPO.panelTitle,
              "text-[var(--hh-text-primary)]"
            ),
            nav: cn(rdp.nav, "gap-1 items-center"),
            button_previous: cn(
              rdp.button_previous,
              "hh-focus-ring flex h-10 w-10 items-center justify-center rounded-hh-compact border-0 bg-transparent transition-colors duration-150 ease-out motion-reduce:transition-none sm:h-8 sm:w-8",
              "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]"
            ),
            button_next: cn(
              rdp.button_next,
              "hh-focus-ring flex h-10 w-10 items-center justify-center rounded-hh-compact border-0 bg-transparent transition-colors duration-150 ease-out motion-reduce:transition-none sm:h-8 sm:w-8",
              "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]"
            ),
            weekdays: cn(rdp.weekdays, TYPO.tableHeader, "text-[var(--hh-text-tertiary)]"),
            weekday: cn(rdp.weekday, "w-10 py-1 text-center sm:w-8"),
            week: cn(rdp.week, "gap-1"),
            day: cn(
              rdp.day,
              "h-10 w-10 rounded-hh-compact bg-transparent shadow-none sm:h-8 sm:w-8",
              TYPO.metadata,
              "hh-fin"
            ),
            day_button: cn(
              (rdp as unknown as Record<string, string>).day_button ?? "",
              "hh-focus-ring hh-fin flex h-10 w-10 items-center justify-center rounded-hh-compact border border-transparent shadow-none transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out active:duration-100 motion-reduce:transition-none sm:h-8 sm:w-8",
              TYPO.metadata,
              "text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]"
            ),
            today: cn(
              rdp.today,
              "font-semibold [&:not([data-selected=true])_button]:border-[var(--hh-border-strong)]"
            ),
            selected: cn(
              rdp.selected,
              "bg-transparent shadow-none [&_button]:border-[var(--hh-border-strong)] [&_button]:bg-[var(--hh-l3-selected)] [&_button]:text-[var(--hh-text-primary)] [&_button:hover]:bg-[var(--hh-l3-selected)]"
            ),
            outside: cn(rdp.outside, "text-[var(--hh-text-tertiary)] opacity-50"),
            disabled: cn(rdp.disabled, "pointer-events-none cursor-not-allowed opacity-30"),
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
            showFooter ? (
              <div className="mt-2 flex items-center justify-between pt-1">
                <button
                  type="button"
                  className={cn(
                    "hh-focus-ring hh-touch-min inline-flex min-h-hh-control-comfortable items-center rounded-hh-compact px-hh-2 transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-35 motion-reduce:transition-none lg:min-h-hh-control-compact",
                    TYPO.button,
                    "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] hover:text-[var(--hh-text-primary)]"
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
                    "hh-focus-ring hh-touch-min inline-flex min-h-hh-control-comfortable items-center rounded-hh-compact px-hh-2 transition-colors duration-150 ease-out motion-reduce:transition-none lg:min-h-hh-control-compact",
                    TYPO.button,
                    "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] hover:text-[var(--hh-text-primary)]"
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

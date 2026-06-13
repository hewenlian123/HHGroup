"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ExpenseSearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
};

export type ExpenseSearchableSelectAction = {
  value: string;
  label: string;
  searchText?: string;
  onSelect: () => void;
};

export type ExpenseSearchableSelectProps = {
  value: string;
  options: ExpenseSearchableSelectOption[];
  onValueChange: (value: string) => void;
  actions?: ExpenseSearchableSelectAction[];
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  fallbackLabel?: string;
  "aria-label"?: string;
  "data-queue-row-id"?: string;
  "data-queue-field"?: string;
};

type VisibleEntry =
  | { kind: "option"; option: ExpenseSearchableSelectOption }
  | { kind: "action"; action: ExpenseSearchableSelectAction };

function searchableText(label: string, searchText?: string): string {
  return `${label} ${searchText ?? ""}`.trim().toLowerCase();
}

function entryKey(entry: VisibleEntry): string {
  return entry.kind === "option" ? `option-${entry.option.value}` : `action-${entry.action.value}`;
}

export function ExpenseSearchableSelect({
  value,
  options,
  onValueChange,
  actions = [],
  disabled,
  loading,
  className,
  id,
  autoFocus,
  onKeyDown,
  placeholder = "Select…",
  emptyText = "No results",
  searchPlaceholder = "Search…",
  fallbackLabel,
  "aria-label": ariaLabel,
  "data-queue-row-id": dataQueueRowId,
  "data-queue-field": dataQueueField,
}: ExpenseSearchableSelectProps) {
  const reactId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const selected = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );
  const selectedLabel = selected?.label ?? fallbackLabel ?? "";
  const listboxId = `${reactId}-listbox`;

  const visibleEntries = React.useMemo<VisibleEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const filteredOptions = q
      ? options.filter((option) => searchableText(option.label, option.searchText).includes(q))
      : options;
    const filteredActions =
      actions.length === 0
        ? []
        : q
          ? actions.filter((action) => searchableText(action.label, action.searchText).includes(q))
          : actions;
    return [
      ...filteredOptions.map((option) => ({ kind: "option" as const, option })),
      ...filteredActions.map((action) => ({ kind: "action" as const, action })),
    ];
  }, [actions, options, query]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (activeIndex < visibleEntries.length) return;
    setActiveIndex(Math.max(0, visibleEntries.length - 1));
  }, [activeIndex, visibleEntries.length]);

  const close = React.useCallback(() => {
    setOpen(false);
  }, []);

  const chooseEntry = React.useCallback(
    (entry: VisibleEntry | undefined) => {
      if (!entry) return;
      if (entry.kind === "option") {
        if (entry.option.disabled) return;
        flushSync(() => {
          onValueChange(entry.option.value);
        });
      } else {
        entry.action.onSelect();
      }
      close();
    },
    [close, onValueChange]
  );

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (visibleEntries.length === 0) return;
        setActiveIndex((current) => (current + 1) % visibleEntries.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (visibleEntries.length === 0) return;
        setActiveIndex((current) => (current - 1 + visibleEntries.length) % visibleEntries.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        chooseEntry(visibleEntries[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    },
    [activeIndex, chooseEntry, close, visibleEntries]
  );

  const handleTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setQuery(event.key);
        setOpen(true);
      }
    },
    [onKeyDown]
  );

  const activeEntry = visibleEntries[activeIndex];
  const activeDescendant = activeEntry ? `${reactId}-${entryKey(activeEntry)}` : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel ?? placeholder}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-busy={loading || undefined}
          disabled={disabled || loading}
          autoFocus={autoFocus}
          data-queue-row-id={dataQueueRowId}
          data-queue-field={dataQueueField}
          data-expense-combobox-trigger="true"
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            "flex h-10 min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-sm border border-border/60 bg-background px-3 text-left text-sm text-foreground shadow-none transition-colors duration-150",
            "hover:bg-muted/50 focus-visible:border-[var(--neo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]",
            "disabled:cursor-not-allowed disabled:opacity-55 max-md:h-11 max-md:min-h-11 max-md:text-base",
            className
          )}
        >
          <span
            className={cn("min-w-0 flex-1 truncate", !selectedLabel && "text-muted-foreground")}
          >
            {selectedLabel || (loading ? "Loading…" : placeholder)}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        data-expense-combobox-content="true"
        className={cn(
          "z-[220] w-[min(var(--radix-popover-trigger-width),calc(100vw-1rem))] min-w-[min(16rem,calc(100vw-1rem))] overflow-hidden rounded-sm border-border/70 bg-popover p-0 text-popover-foreground shadow-xl",
          "max-md:max-h-[min(22rem,calc(100svh-8rem))]"
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="border-b border-border/60 p-2">
          <div className="flex h-10 items-center gap-2 rounded-sm border border-border/60 bg-background px-2.5 focus-within:border-[var(--neo-gold)] focus-within:ring-2 focus-within:ring-[var(--neo-gold-ring)] max-md:h-11">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              role="searchbox"
              aria-label="Search options"
              aria-controls={listboxId}
              aria-activedescendant={activeDescendant}
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={searchPlaceholder}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground max-md:text-base"
            />
          </div>
        </div>
        <div id={listboxId} role="listbox" className="max-h-64 overflow-y-auto py-1">
          {visibleEntries.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            visibleEntries.map((entry, index) => {
              const key = entryKey(entry);
              const isActive = index === activeIndex;
              if (entry.kind === "action") {
                return (
                  <button
                    key={key}
                    id={`${reactId}-${key}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={cn(
                      "flex min-h-10 w-full items-center px-3 py-2 text-left text-sm text-[var(--neo-gold-soft)] transition-colors max-md:min-h-11 max-md:text-base",
                      isActive && "bg-[rgb(184_137_45_/_0.12)] text-[var(--neo-gold)]"
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseEntry(entry)}
                  >
                    {entry.action.label}
                  </button>
                );
              }
              const selectedOption = entry.option.value === value;
              return (
                <button
                  key={key}
                  id={`${reactId}-${key}`}
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  disabled={entry.option.disabled}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors max-md:min-h-11 max-md:text-base",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    isActive
                      ? "bg-[rgb(184_137_45_/_0.12)] text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    selectedOption && "text-foreground"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseEntry(entry)}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.option.label}</span>
                  {selectedOption ? (
                    <Check className="h-4 w-4 shrink-0 text-[var(--neo-gold)]" aria-hidden />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

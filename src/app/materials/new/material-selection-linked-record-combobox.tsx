"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MaterialSelectionLinkedRecordOption = {
  value: string;
  label: string;
  searchText?: string;
};

export function MaterialSelectionLinkedRecordCombobox({
  id,
  name,
  label,
  options,
  optionalLabel,
  placeholder,
  searchLabel,
  searchPlaceholder,
  emptyText,
}: {
  id: string;
  name: string;
  label: string;
  options: MaterialSelectionLinkedRecordOption[];
  optionalLabel: string;
  placeholder: string;
  searchLabel: string;
  searchPlaceholder: string;
  emptyText: string;
}) {
  const reactId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [value, setValue] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const selected = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );
  const queryText = query.trim().toLowerCase();
  const filteredOptions = React.useMemo(() => {
    if (!queryText) return options;
    return options.filter((option) =>
      `${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(queryText)
    );
  }, [options, queryText]);

  const visibleOptions = React.useMemo(
    () => [{ value: "", label: optionalLabel }, ...filteredOptions],
    [filteredOptions, optionalLabel]
  );

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
    if (activeIndex < visibleOptions.length) return;
    setActiveIndex(Math.max(0, visibleOptions.length - 1));
  }, [activeIndex, visibleOptions.length]);

  const selectOption = React.useCallback((nextValue: string) => {
    setValue(nextValue);
    setOpen(false);
  }, []);

  const chooseActiveOption = React.useCallback(() => {
    selectOption(visibleOptions[activeIndex]?.value ?? "");
  }, [activeIndex, selectOption, visibleOptions]);

  const handleSearchKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % visibleOptions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + visibleOptions.length) % visibleOptions.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        chooseActiveOption();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    },
    [chooseActiveOption, visibleOptions.length]
  );

  const handleTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
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
    []
  );

  const selectedLabel = selected?.label ?? (value ? placeholder : optionalLabel);
  const activeOption = visibleOptions[activeIndex];
  const listboxId = `${reactId}-listbox`;
  const activeDescendant = activeOption
    ? `${reactId}-option-${activeOption.value || "none"}`
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={value} readOnly />
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            "flex h-10 min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-left text-hh-body text-[var(--hh-text-primary)] shadow-none transition-colors duration-150 md:min-h-10",
            "hh-focus-ring hover:bg-[var(--hh-l3-hover)]",
            "max-md:text-base"
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !selected && !value && "text-[var(--hh-text-secondary)]"
            )}
          >
            {selectedLabel}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--hh-text-tertiary)]" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={5}
        className="z-[220] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-hh-compact border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-0 shadow-operational"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="border-b border-[var(--hh-border)] p-2">
          <div className="flex h-10 items-center gap-2 rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l3-selected)] px-2.5 transition-colors focus-within:border-[var(--hh-focus-ring)] focus-within:ring-2 focus-within:ring-[var(--hh-focus-ring)] max-md:h-11">
            <Search className="h-4 w-4 shrink-0 text-[var(--hh-text-tertiary)]" aria-hidden />
            <input
              ref={inputRef}
              role="searchbox"
              aria-label={searchLabel}
              aria-controls={listboxId}
              aria-activedescendant={activeDescendant}
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--hh-text-primary)] outline-none placeholder:text-[var(--hh-text-tertiary)] max-md:text-base"
            />
          </div>
        </div>
        <div id={listboxId} role="listbox" className="max-h-64 overflow-y-auto py-1">
          {filteredOptions.length === 0 && queryText ? (
            <div className="px-3 py-2 text-sm text-[var(--hh-text-tertiary)]">{emptyText}</div>
          ) : null}
          {visibleOptions.map((option, index) => {
            const selectedOption = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={option.value || "__none"}
                id={`${reactId}-option-${option.value || "none"}`}
                type="button"
                role="option"
                aria-selected={selectedOption}
                className={cn(
                  "flex min-h-10 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm transition-colors max-md:min-h-11 max-md:text-base",
                  active
                    ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                    : "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]",
                  selectedOption && "text-[var(--hh-text-primary)]"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option.value)}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selectedOption ? (
                  <Check className="h-4 w-4 shrink-0 text-[var(--hh-text-primary)]" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

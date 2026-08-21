"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export interface ComboboxOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface ComboboxProps {
  "aria-label"?: string;
  className?: string;
  controlClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  emptyText?: string;
  label?: React.ReactNode;
  mode?: "select" | "creatable";
  onCreate?: (value: string) => void | Promise<void>;
  onQueryChange?: (query: string) => void;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  selectedOptionClassName?: string;
  value: string;
}

type PortalPosition = { above: boolean; left: number; top: number; width: number };

/** Canonical portaled combobox for selection and bounded creatable composition. */
export function Combobox({
  "aria-label": ariaLabel = "Select option",
  className,
  controlClassName,
  contentClassName,
  disabled = false,
  emptyText = "No options",
  label,
  mode = "select",
  onCreate,
  onQueryChange,
  onValueChange,
  options,
  placeholder = mode === "creatable" ? "Search or select…" : "Select…",
  searchPlaceholder = "Search…",
  selectedOptionClassName,
  value,
}: ComboboxProps) {
  const baseId = React.useId();
  const listboxId = `${baseId}-listbox`;
  const inputId = `${baseId}-input`;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<PortalPosition>({
    above: false,
    left: 0,
    top: 0,
    width: 0,
  });
  const [query, setQuery] = React.useState("");

  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options;
  const canCreate =
    mode === "creatable" &&
    Boolean(onCreate) &&
    normalizedQuery.length > 0 &&
    !options.some((option) => option.label.toLowerCase() === normalizedQuery);
  const entryCount = filtered.length + (canCreate ? 1 : 0);
  const activeDescendant =
    open && entryCount > 0
      ? `${baseId}-option-${Math.min(activeIndex, entryCount - 1)}`
      : undefined;

  const focusOwner = React.useCallback(() => {
    (mode === "select" ? triggerRef.current : inputRef.current)?.focus({ preventScroll: true });
  }, [mode]);

  const close = React.useCallback(
    (restoreFocus = false) => {
      setOpen(false);
      setActiveIndex(0);
      if (mode === "select") setQuery("");
      if (restoreFocus) window.setTimeout(focusOwner, 0);
    },
    [focusOwner, mode]
  );

  const updatePosition = React.useCallback(() => {
    const owner = mode === "select" ? triggerRef.current : inputRef.current;
    const rect = owner?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 260 && rect.top > spaceBelow;
    setPosition({
      above,
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - rect.width - 8)),
      top: above ? rect.top - 4 : rect.bottom + 4,
      width: Math.max(200, Math.min(rect.width, window.innerWidth - 16)),
    });
  }, [mode]);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [close, open, updatePosition]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (!open || mode !== "select") return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [mode, open]);

  const chooseOption = (option: ComboboxOption) => {
    if (option.disabled) return;
    onValueChange(option.value);
    close(true);
  };

  const createOption = async () => {
    const nextValue = query.trim();
    if (!canCreate || !nextValue || creating || !onCreate) return;
    setCreating(true);
    try {
      await Promise.resolve(onCreate(nextValue));
      onValueChange(nextValue);
      close(true);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (entryCount > 0) setActiveIndex((index) => (index + 1) % entryCount);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (entryCount > 0) setActiveIndex((index) => (index - 1 + entryCount) % entryCount);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex < filtered.length) chooseOption(filtered[activeIndex]);
      else void createOption();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  const openCombobox = () => {
    if (disabled) return;
    if (!open) setQuery(mode === "creatable" ? value : "");
    setOpen(true);
  };

  const portal =
    mounted && open
      ? createPortal(
          <div
            ref={contentRef}
            className={cn(
              "fixed z-[200] max-h-[min(22rem,calc(100dvh-1rem))] overflow-hidden rounded-hh-standard border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] text-[var(--neo-text-primary)] shadow-floating",
              contentClassName
            )}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              transform: position.above ? "translateY(-100%)" : undefined,
            }}
          >
            {mode === "select" ? (
              <div className="border-b border-[var(--hh-border)] p-hh-2">
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  role="searchbox"
                  aria-label={searchPlaceholder}
                  aria-controls={listboxId}
                  aria-activedescendant={activeDescendant}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                />
              </div>
            ) : null}
            <div id={listboxId} role="listbox" className="max-h-64 overflow-y-auto py-hh-1">
              {entryCount === 0 ? (
                <p className={cn("px-hh-3 py-hh-3", TYPO.body, "text-[var(--neo-text-secondary)]")}>
                  {emptyText}
                </p>
              ) : null}
              {filtered.map((option, index) => {
                const selectedOption = option.value === value;
                const active = index === activeIndex;
                return (
                  <button
                    key={option.value}
                    id={`${baseId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selectedOption}
                    disabled={option.disabled}
                    className={cn(
                      "hh-touch-row flex min-h-hh-row-dense w-full items-center gap-hh-2 px-hh-3 py-hh-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      TYPO.body,
                      active && "bg-[var(--hh-l3-hover)]",
                      selectedOption &&
                        (selectedOptionClassName ??
                          "bg-[var(--hh-l3-selected)] text-[var(--neo-text-primary)]")
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseOption(option)}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {selectedOption ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
              {canCreate ? (
                <button
                  id={`${baseId}-option-${filtered.length}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={creating}
                  className={cn(
                    "hh-touch-row flex min-h-hh-row-dense w-full items-center px-hh-3 py-hh-2 text-left text-[var(--neo-text-secondary)] transition-colors",
                    TYPO.body,
                    activeIndex === filtered.length && "bg-[var(--hh-l3-hover)]"
                  )}
                  onMouseEnter={() => setActiveIndex(filtered.length)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void createOption()}
                >
                  {creating ? "Adding…" : `+ Add "${query.trim()}"`}
                </button>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {label ? <Label htmlFor={inputId}>{label}</Label> : null}
      {mode === "select" ? (
        <button
          ref={triggerRef}
          id={inputId}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          disabled={disabled}
          onClick={openCombobox}
          onKeyDown={handleKeyDown}
          className={cn(
            "hh-focus-ring hh-type-text-entry hh-touch-min flex h-hh-control-standard w-full min-w-[140px] items-center justify-between rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-hh-3 text-left text-[var(--neo-text-primary)] transition-colors hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] disabled:cursor-not-allowed disabled:opacity-50",
            controlClassName
          )}
        >
          <span className={cn("truncate", !selected && "text-[var(--neo-text-tertiary)]")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      ) : (
        <Input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          disabled={disabled}
          value={open ? query : (selected?.label ?? value)}
          onFocus={openCombobox}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            onQueryChange?.(nextQuery);
            if (!open) setOpen(true);
          }}
          placeholder={value ? undefined : placeholder}
          autoComplete="off"
          className={cn(label && "mt-hh-1", controlClassName)}
        />
      )}
      {portal}
    </div>
  );
}

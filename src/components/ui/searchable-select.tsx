"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { motionPopoverLayer } from "@/lib/motion-system";

export interface SearchableSelectOption {
  id: string;
  label: string;
}

export interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  className,
  "aria-label": ariaLabel = "Select option",
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered =
    q === "" ? options : options.filter((opt) => opt.label.toLowerCase().includes(q));

  const selectedOption = options.find((o) => o.id === value);
  const displayLabel = selectedOption?.label ?? "";

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-10 w-full min-w-[140px] items-center justify-between rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 text-left text-sm text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-control)] transition-all duration-150 ease-out",
          "hover:bg-[var(--neo-surface-hover)] focus-visible:border-[var(--neo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
        )}
      >
        <span className={!displayLabel ? "text-muted-foreground/70" : ""}>
          {displayLabel || placeholder}
        </span>
        <svg
          className="h-4 w-4 shrink-0 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className={cn(
            "dark absolute z-[100] mt-1 w-full min-w-[200px] origin-top overflow-hidden rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] py-2 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]",
            motionPopoverLayer
          )}
        >
          <div className="border-b border-[var(--neo-border)] px-2 pb-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-9 w-full rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-2 text-sm text-[var(--neo-text-primary)] shadow-none placeholder:text-[var(--neo-text-tertiary)] focus:border-[var(--neo-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--neo-gold-ring)]"
            />
          </div>
          <ul className="max-h-48 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[var(--neo-text-secondary)]">No options</li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={opt.id === value}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm text-[var(--neo-text-secondary)] transition-colors hover:bg-[var(--neo-surface-hover)] hover:text-[var(--neo-text-primary)]",
                    opt.id === value &&
                      "bg-[rgb(184_147_90_/_0.12)] font-medium text-[var(--neo-gold-soft)]"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt.id);
                  }}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

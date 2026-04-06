"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

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
          "flex h-10 w-full min-w-[140px] items-center justify-between rounded-lg border border-gray-100 bg-white px-3 text-left text-sm text-text-primary shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]/10 dark:border-border dark:bg-card dark:text-foreground dark:focus-visible:ring-ring/30"
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
          className="absolute z-[100] mt-1 w-full min-w-[200px] overflow-hidden rounded-md border border-border/60 bg-popover py-1 shadow-[var(--shadow-popover)]"
        >
          <div className="border-b border-gray-100 px-2 pb-2 dark:border-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 w-full rounded-lg border border-gray-100 bg-white px-2 text-sm text-text-primary shadow-sm focus:outline-none focus:ring-2 focus:ring-[#111827]/10 dark:border-border dark:bg-card dark:focus:ring-ring/30"
            />
          </div>
          <ul className="max-h-48 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No options</li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={opt.id === value}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    opt.id === value && "bg-accent/50 text-foreground font-medium"
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

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CreatableSelectProps {
  label?: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  onCreate: (newValue: string) => void | Promise<void>;
  /** Optional theme scope for the dropdown surface. */
  contentClassName?: string;
  /** Optional selected-option treatment for a scoped visual system. */
  selectedOptionClassName?: string;
}

export function CreatableSelect({
  label,
  value,
  options,
  placeholder = "Search or select…",
  onChange,
  onCreate,
  contentClassName,
  selectedOptionClassName,
}: CreatableSelectProps) {
  const [query, setQuery] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q === "" ? options : options.filter((opt) => opt.toLowerCase().includes(q));
  const hasExactMatch = q !== "" && options.some((opt) => opt.toLowerCase() === q);
  const showAddOption = q !== "" && !hasExactMatch;

  React.useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const handleAdd = async () => {
    const toAdd = query.trim();
    if (!toAdd) return;
    setIsCreating(true);
    try {
      await Promise.resolve(onCreate(toAdd));
      setIsOpen(false);
      setQuery("");
      inputRef.current?.blur();
    } finally {
      setIsCreating(false);
    }
  };

  const displayValue = isOpen ? query : value;

  const openDropdown = () => {
    if (!isOpen) setQuery(value);
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    if (!isOpen) setIsOpen(true);
  };

  const handleBlur = () => {
    if (!showAddOption && filtered.length === 0) {
      setIsOpen(false);
      setQuery(value);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {label ? (
        <label className="text-[10px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={openDropdown}
        onBlur={handleBlur}
        placeholder={value ? undefined : placeholder}
        className={cn(
          "flex h-10 min-h-[44px] w-full rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-sm text-[var(--neo-text-primary)] shadow-none transition-all duration-150 ease-out placeholder:text-[var(--neo-text-tertiary)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] focus-visible:border-[var(--neo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] lg:min-h-10",
          label ? "mt-1" : ""
        )}
        aria-autocomplete="list"
      />
      {isOpen && (
        <ul
          role="listbox"
          className={cn(
            "absolute z-[100] mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] py-2 text-[var(--neo-text-primary)] shadow-[var(--hh-shadow-floating)]",
            contentClassName
          )}
        >
          {filtered.map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={cn(
                "min-h-[44px] flex cursor-pointer items-center px-3 py-2.5 text-sm transition-colors hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] hover:text-[var(--neo-text-primary)]",
                opt === value &&
                  (selectedOptionClassName ??
                    "bg-[var(--hh-l3-selected)] text-[var(--neo-text-primary)]")
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(opt);
              }}
            >
              {opt}
            </li>
          ))}
          {showAddOption && (
            <li
              role="option"
              aria-selected={false}
              className="min-h-[44px] flex cursor-pointer items-center px-3 py-2.5 text-sm text-[var(--neo-text-secondary)] transition-colors hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)] hover:text-[var(--neo-text-primary)]"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              {isCreating ? "Adding…" : `+ Add "${query.trim()}"`}
            </li>
          )}
          {filtered.length === 0 && !showAddOption && (
            <li className="px-3 py-2.5 text-sm text-[var(--neo-text-secondary)]">No options</li>
          )}
        </ul>
      )}
    </div>
  );
}

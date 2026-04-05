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
}

export function CreatableSelect({
  label,
  value,
  options,
  placeholder = "Search or select…",
  onChange,
  onCreate,
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
        <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
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
          "flex h-10 min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]/10 dark:border-border dark:bg-card dark:text-foreground dark:focus-visible:ring-ring/30 lg:min-h-10",
          label ? "mt-1" : ""
        )}
        aria-autocomplete="list"
      />
      {isOpen && (
        <ul
          role="listbox"
          className="absolute z-[100] mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-300 bg-white py-2 shadow-lg dark:border-border dark:bg-popover dark:shadow-md"
        >
          {filtered.map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={cn(
                "min-h-[44px] flex cursor-pointer items-center px-3 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground",
                opt === value && "bg-accent/50"
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
              className="min-h-[44px] flex cursor-pointer items-center px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              {isCreating ? "Adding…" : `+ Add "${query.trim()}"`}
            </li>
          )}
          {filtered.length === 0 && !showAddOption && (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No options</li>
          )}
        </ul>
      )}
    </div>
  );
}

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
  const filtered =
    q === ""
      ? options
      : options.filter((opt) => opt.toLowerCase().includes(q));
  const hasExactMatch =
    q !== "" && options.some((opt) => opt.toLowerCase() === q);
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

  return (
    <div ref={containerRef} className="relative">
      {label ? (
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={openDropdown}
        onBlur={() => {
          if (!showAddOption && filtered.length === 0) setIsOpen(false);
        }}
        placeholder={value ? undefined : placeholder}
        className={cn(
          "flex h-9 min-h-[44px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          label ? "mt-1" : ""
        )}
        aria-autocomplete="list"
      />
      {isOpen && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-input bg-popover py-1 shadow-md"
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

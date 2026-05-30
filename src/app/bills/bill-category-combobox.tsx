"use client";

import * as React from "react";
import { NeoInput } from "@/components/base";
import { cn } from "@/lib/utils";
import { mergeBillCategoryOptions, persistBillCategory } from "./bill-categories";
import {
  billsCategoryAddItemClass,
  billsCategoryDropdownClass,
  billsCategoryOptionClass,
} from "./bills-ui-styles";

export type BillCategoryComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  /** Categories from bills already loaded on the page (no extra API). */
  learnedCategories?: string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export function BillCategoryCombobox({
  value,
  onChange,
  learnedCategories = [],
  placeholder = "Category",
  className,
  inputClassName,
}: BillCategoryComboboxProps): React.ReactElement {
  const [query, setQuery] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);
  const [optionsVersion, setOptionsVersion] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const allOptions = React.useMemo(() => {
    void optionsVersion;
    return mergeBillCategoryOptions(learnedCategories, value);
  }, [learnedCategories, value, optionsVersion]);

  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!q) return allOptions;
    return allOptions.filter((opt) => opt.toLowerCase().includes(q));
  }, [allOptions, q]);

  const hasExactMatch = q !== "" && allOptions.some((opt) => opt.toLowerCase() === q);
  const showAddOption = q !== "" && !hasExactMatch;
  const addLabel = query.trim();

  React.useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  React.useEffect(() => {
    function handlePointerDown(e: MouseEvent): void {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setQuery(value);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, value]);

  const openDropdown = (): void => {
    if (!isOpen) setQuery(value);
    setIsOpen(true);
  };

  const handleSelect = (option: string): void => {
    onChange(option);
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const handleAdd = (): void => {
    const toAdd = query.trim();
    if (!toAdd) return;
    setIsAdding(true);
    try {
      const saved = persistBillCategory(toAdd);
      onChange(saved);
      setOptionsVersion((v) => v + 1);
      setIsOpen(false);
      setQuery("");
      inputRef.current?.blur();
    } finally {
      setIsAdding(false);
    }
  };

  const displayValue = isOpen ? query : value;

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <NeoInput
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange(v);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={openDropdown}
        onBlur={() => {
          window.setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement)) {
              setIsOpen(false);
            }
          }, 120);
        }}
        placeholder={value ? undefined : placeholder}
        aria-label={placeholder}
        className={inputClassName}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        role="combobox"
      />
      {isOpen ? (
        <ul role="listbox" className={billsCategoryDropdownClass}>
          {filtered.map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={cn(
                billsCategoryOptionClass,
                opt === value && "bg-[rgb(184_147_90_/_0.10)] text-[var(--neo-gold-soft)]"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(opt);
              }}
            >
              {opt}
            </li>
          ))}
          {showAddOption ? (
            <li
              role="option"
              aria-selected={false}
              className={billsCategoryAddItemClass}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              {isAdding ? "Adding…" : `Add “${addLabel}”`}
            </li>
          ) : null}
          {filtered.length === 0 && !showAddOption ? (
            <li className="px-3 py-2.5 text-[13px] text-[var(--neo-text-secondary)]">
              No matching categories
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

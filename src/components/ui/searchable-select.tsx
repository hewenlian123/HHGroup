"use client";

import { Combobox } from "@/components/ui/combobox";
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

/** Compatibility wrapper over the canonical Combobox selection mode. */
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  className,
  "aria-label": ariaLabel = "Select option",
}: SearchableSelectProps) {
  return (
    <Combobox
      mode="select"
      value={value}
      options={options.map((option) => ({ value: option.id, label: option.label }))}
      onValueChange={onChange}
      placeholder={placeholder}
      className={cn("hh-type-text-entry hh-touch-min", className)}
      controlClassName="transition-colors shadow-operational"
      contentClassName="overflow-hidden shadow-floating"
      aria-label={ariaLabel}
    />
  );
}

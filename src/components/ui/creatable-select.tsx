"use client";

import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export interface CreatableSelectProps {
  label?: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  onCreate: (newValue: string) => void | Promise<void>;
  contentClassName?: string;
  selectedOptionClassName?: string;
}

/** Compatibility wrapper over the canonical Combobox creatable mode. */
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
  return (
    <Combobox
      mode="creatable"
      className="hh-type-text-entry hh-touch-min"
      label={label}
      value={value}
      options={options.map((option) => ({ value: option, label: option }))}
      placeholder={placeholder}
      onQueryChange={onChange}
      onValueChange={onChange}
      onCreate={onCreate}
      contentClassName={cn("overflow-hidden shadow-floating", contentClassName)}
      selectedOptionClassName={selectedOptionClassName}
      aria-label={label ?? placeholder}
    />
  );
}

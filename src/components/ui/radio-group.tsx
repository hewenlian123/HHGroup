"use client";

import * as React from "react";

import { FieldMessage } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export interface RadioOption {
  description?: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
}

export interface RadioGroupProps {
  className?: string;
  disabled?: boolean;
  error?: React.ReactNode;
  legend: React.ReactNode;
  name: string;
  onValueChange?: (value: string) => void;
  options: RadioOption[];
  value?: string;
}

export function RadioGroup({
  className,
  disabled,
  error,
  legend,
  name,
  onValueChange,
  options,
  value,
}: RadioGroupProps) {
  const errorId = React.useId();
  return (
    <fieldset
      className={cn("grid gap-hh-2", className)}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className={TYPO.label}>{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex min-h-hh-touch cursor-pointer items-center gap-hh-3 rounded-hh-compact",
            (disabled || option.disabled) && "cursor-not-allowed opacity-50"
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={(event) => onValueChange?.(event.currentTarget.value)}
            className="hh-focus-ring size-4 shrink-0 accent-[var(--hh-action-primary)]"
          />
          <span>
            <span className={TYPO.body}>{option.label}</span>
            {option.description ? (
              <span className={cn("block", TYPO.helper)}>{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
      {error ? (
        <FieldMessage id={errorId} tone="danger">
          {error}
        </FieldMessage>
      ) : null}
    </fieldset>
  );
}

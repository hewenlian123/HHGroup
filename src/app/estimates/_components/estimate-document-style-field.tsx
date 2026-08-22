"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_ESTIMATE_DOCUMENT_STYLE,
  type EstimateDocumentStyle,
} from "@/lib/estimate-document-style";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";

const OPTIONS: Array<{ value: EstimateDocumentStyle; label: string; hint: string }> = [
  {
    value: "proposal",
    label: "Proposal",
    hint: "Scope narrative and contract price — no line-item pricing.",
  },
  {
    value: "itemized",
    label: "Itemized",
    hint: "Show qty, unit, unit price, and line totals.",
  },
];

export function EstimateDocumentStyleField({
  value,
  onChange,
  name = "documentStyle",
  disabled = false,
  className,
}: {
  value?: EstimateDocumentStyle;
  onChange?: (next: EstimateDocumentStyle) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  const current = value ?? DEFAULT_ESTIMATE_DOCUMENT_STYLE;

  return (
    <fieldset
      className={cn(EB.sheetField, "eb-estimate-style-field", className)}
      disabled={disabled}
    >
      <legend className={cn(EB.sheetLabel, "mb-2")}>Estimate style</legend>
      <p className="eb-estimate-style-helper mb-3 text-xs leading-snug text-[var(--hh-text-tertiary)]">
        Controls customer preview, print, and PDF output only.
      </p>
      <div className="eb-estimate-style-options grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const id = `${name}-${option.value}`;
          const checked = current === option.value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "eb-estimate-style-option flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 transition-colors",
                checked ? "is-selected" : undefined
              )}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={disabled}
                aria-label={option.label}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--hh-text-primary)]"
                onChange={() => onChange?.(option.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--hh-text-primary)]">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-[var(--hh-text-tertiary)]">
                  {option.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function EstimateDocumentStyleReadOnly({
  value,
}: {
  value?: EstimateDocumentStyle;
}): React.ReactElement {
  const label = normalizeEstimateDocumentStyleLabel(value);
  return (
    <div className="min-w-0">
      <Label className="eb-estimate-context-label mb-0.5 block text-[12px] font-medium leading-tight text-[var(--hh-text-tertiary)]">
        Estimate style
      </Label>
      <p className="text-[14px] font-medium leading-snug text-[var(--hh-text-primary)]">{label}</p>
    </div>
  );
}

function normalizeEstimateDocumentStyleLabel(value: EstimateDocumentStyle | undefined): string {
  return value === "itemized" ? "Itemized" : "Proposal";
}

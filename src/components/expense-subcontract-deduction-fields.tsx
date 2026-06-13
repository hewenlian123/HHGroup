"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExpenseSearchableSelect } from "@/components/expense-searchable-select";
import type { SubcontractDeductionOption } from "@/lib/data";
import { cn } from "@/lib/utils";

const EMPTY_VALUE = "__hh_subcontract_deduction_none__";

type Props = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  projectId: string | null;
  subcontractId: string;
  onSubcontractIdChange: (subcontractId: string) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  options: SubcontractDeductionOption[];
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  inputClassName?: string;
  idPrefix?: string;
};

export function ExpenseSubcontractDeductionFields({
  enabled,
  onEnabledChange,
  projectId,
  subcontractId,
  onSubcontractIdChange,
  amount,
  onAmountChange,
  note,
  onNoteChange,
  options,
  disabled,
  className,
  triggerClassName,
  inputClassName,
  idPrefix = "expense-subcontract-deduction",
}: Props) {
  const trimmedProjectId = projectId?.trim() || null;
  const visibleOptions = React.useMemo(() => {
    if (!trimmedProjectId) return options;
    const filtered = options.filter((option) => option.projectId === trimmedProjectId);
    if (subcontractId && !filtered.some((option) => option.subcontractId === subcontractId)) {
      const selected = options.find((option) => option.subcontractId === subcontractId);
      return selected ? [selected, ...filtered] : filtered;
    }
    return filtered;
  }, [options, subcontractId, trimmedProjectId]);

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-muted/15 p-3",
        enabled && "border-amber-500/40 bg-amber-500/5",
        className
      )}
      data-testid={`${idPrefix}-section`}
    >
      <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-border accent-[var(--neo-gold)]"
          data-testid={`${idPrefix}-checkbox`}
        />
        <span>Deduct from subcontractor</span>
      </label>
      {enabled ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Subcontractor
            </label>
            <ExpenseSearchableSelect
              id={`${idPrefix}-subcontractor-select`}
              value={subcontractId || EMPTY_VALUE}
              onValueChange={(value) => onSubcontractIdChange(value === EMPTY_VALUE ? "" : value)}
              disabled={disabled}
              className={triggerClassName}
              placeholder="Choose subcontractor"
              searchPlaceholder="Search subcontractors..."
              emptyText={
                trimmedProjectId
                  ? "No subcontractors on this project"
                  : "Choose a project before selecting"
              }
              options={[
                {
                  value: EMPTY_VALUE,
                  label: "Choose subcontractor",
                  searchText: "none",
                },
                ...visibleOptions.map((option) => ({
                  value: option.subcontractId,
                  label: option.label,
                  searchText: `${option.subcontractorName} ${option.projectName} ${
                    option.costCode ?? ""
                  }`,
                })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Deduction amount
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              disabled={disabled}
              className={inputClassName}
              data-testid={`${idPrefix}-amount`}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Deduction note
            </label>
            <Textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              disabled={disabled}
              className={cn(inputClassName, "min-h-[68px] py-2")}
              placeholder="Optional"
              data-testid={`${idPrefix}-note`}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

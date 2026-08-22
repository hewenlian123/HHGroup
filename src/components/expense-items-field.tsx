"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EXPENSE_FORM_FIELDS, normalizeExpenseItems } from "@/lib/expense-form-system";
import { EXPENSE_COMMON_ITEM_NONE } from "@/lib/expense-workflow-status";
import { cn } from "@/lib/utils";

const ITEM_CATALOG = [
  "Paint",
  "Lumber",
  "Concrete",
  "Plumbing",
  "Electrical",
  "Materials",
] as const;

type ExpenseItemsFieldProps = {
  items: readonly string[];
  onItemsChange: (items: string[]) => void;
  disabled?: boolean;
  idPrefix: string;
  labelClassName?: string;
  inputClassName?: string;
  selectTriggerClassName?: string;
  selectContentClassName?: string;
  className?: string;
};

export function ExpenseItemsField({
  items,
  onItemsChange,
  disabled,
  idPrefix,
  labelClassName,
  inputClassName,
  selectTriggerClassName,
  selectContentClassName,
  className,
}: ExpenseItemsFieldProps) {
  const [draft, setDraft] = React.useState("");
  const [catalogPick, setCatalogPick] = React.useState(EXPENSE_COMMON_ITEM_NONE);
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const catalogTriggerRef = React.useRef<HTMLButtonElement>(null);
  const normalizedItems = React.useMemo(() => normalizeExpenseItems(items), [items]);

  const addItem = React.useCallback(
    (value: string) => {
      const next = normalizeExpenseItems([...normalizedItems, value]);
      if (next.length === normalizedItems.length) return;
      onItemsChange(next);
    },
    [normalizedItems, onItemsChange]
  );

  return (
    <div data-expense-items-field className={className}>
      <label htmlFor={`${idPrefix}-item-input`} className={labelClassName}>
        {EXPENSE_FORM_FIELDS.items.label}
      </label>
      {normalizedItems.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1" aria-label="Expense items">
          {normalizedItems.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-sm border border-[var(--hh-border)] px-1.5 py-0.5 text-hh-status"
            >
              {item}
              <button
                type="button"
                className="-mr-1 inline-flex h-7 w-7 touch-manipulation items-center justify-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-[var(--hh-l3-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] max-md:h-11 max-md:w-11"
                onClick={() =>
                  onItemsChange(
                    normalizedItems.filter(
                      (candidate) => candidate.toLowerCase() !== item.toLowerCase()
                    )
                  )
                }
                disabled={disabled}
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          id={`${idPrefix}-item-input`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (!draft.trim()) return;
            addItem(draft);
            setDraft("");
          }}
          className={cn("h-10 text-xs", inputClassName)}
          placeholder="Add item"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 touch-manipulation max-md:min-h-11"
          disabled={disabled || !draft.trim()}
          onClick={() => {
            if (!draft.trim()) return;
            addItem(draft);
            setDraft("");
          }}
        >
          Add
        </Button>
      </div>
      <Select
        open={catalogOpen}
        onOpenChange={(nextOpen) => {
          setCatalogOpen(nextOpen);
          if (!nextOpen) {
            window.setTimeout(() => catalogTriggerRef.current?.focus({ preventScroll: true }), 220);
          }
        }}
        disabled={disabled}
        value={catalogPick}
        onValueChange={(value) => {
          if (value !== EXPENSE_COMMON_ITEM_NONE) addItem(value);
          setCatalogPick(EXPENSE_COMMON_ITEM_NONE);
        }}
      >
        <SelectTrigger
          ref={catalogTriggerRef}
          id={`${idPrefix}-common-items-select`}
          aria-label="Common items"
          className={cn("mt-1.5 text-xs", selectTriggerClassName)}
        >
          <SelectValue placeholder="Common items…" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={4}
          onEscapeKeyDown={(event) => {
            event.stopPropagation();
          }}
          className={cn(
            "expenses-ui-dialog z-[200] max-h-[min(280px,var(--radix-select-content-available-height))]",
            selectContentClassName
          )}
          data-expense-component-surface="select"
        >
          <SelectItem value={EXPENSE_COMMON_ITEM_NONE}>Common items…</SelectItem>
          {ITEM_CATALOG.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

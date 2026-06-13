"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpenseSearchableSelect } from "@/components/expense-searchable-select";
import { addExpenseCategory } from "@/lib/data";
import { pickerItemsByStoredName, type ExpenseOptionPickerItem } from "@/lib/expense-options-db";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

const ADD_NEW_VALUE = "__hh_add_expense_category__";

export type ExpenseCategorySelectProps = {
  value: string;
  onValueChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  /** Notified with refreshed names after load or after creating a category */
  onCategoriesUpdated?: (names: string[]) => void;
  /** Existing expense forms preserve old archived values; new-expense forms should pick active values only. */
  preserveArchivedValue?: boolean;
  /** Forwarded to the native select for keyboard / focus navigation (e.g. receipt queue). */
  "data-queue-row-id"?: string;
  "data-queue-field"?: string;
};

export function ExpenseCategorySelect({
  value,
  onValueChange,
  disabled,
  className,
  id,
  autoFocus,
  onKeyDown,
  onCategoriesUpdated,
  preserveArchivedValue = true,
  "data-queue-row-id": dataQueueRowId,
  "data-queue-field": dataQueueField,
}: ExpenseCategorySelectProps) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<ExpenseOptionPickerItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const newInputRef = React.useRef<HTMLInputElement>(null);
  const loadSeqRef = React.useRef(0);
  const onCategoriesUpdatedRef = React.useRef(onCategoriesUpdated);
  onCategoriesUpdatedRef.current = onCategoriesUpdated;

  const refresh = React.useCallback(async () => {
    const loadSeq = loadSeqRef.current + 1;
    loadSeqRef.current = loadSeq;
    setLoading(true);
    try {
      const next = await pickerItemsByStoredName("category", preserveArchivedValue ? value : null);
      if (loadSeq !== loadSeqRef.current) return;
      setItems(next);
      onCategoriesUpdatedRef.current?.(
        next.filter((item) => !item.archived).map((item) => item.value)
      );
      const current = value.trim().toLowerCase();
      if (
        !preserveArchivedValue &&
        current &&
        !next.some((item) => item.value.toLowerCase() === current) &&
        next[0]?.value
      ) {
        onValueChange(next[0].value);
      }
    } catch (e) {
      if (loadSeq !== loadSeqRef.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load categories";
      toast({ title: "Categories", description: msg, variant: "error" });
      setItems([]);
    } finally {
      if (loadSeq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [onValueChange, preserveArchivedValue, toast, value]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (addOpen) {
      setNewName("");
      setCreateError(null);
      const t = window.setTimeout(() => newInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [addOpen]);

  const knownValues = new Set(items.map((item) => item.value));
  const radixValue = knownValues.has(value)
    ? value
    : value.trim() && preserveArchivedValue
      ? value
      : (items[0]?.value ?? "");
  const fallbackLabel = knownValues.has(value) ? undefined : value.trim() || undefined;

  const handleCreate = async () => {
    const trimmed = newName.trim();
    setCreateError(null);
    if (!trimmed) {
      setCreateError("Enter a category name.");
      return;
    }
    loadSeqRef.current += 1;
    setLoading(false);
    const lower = trimmed.toLowerCase();
    const existingActive = items.find(
      (item) => item.value.toLowerCase() === lower && !item.archived
    );
    if (existingActive) {
      onValueChange(existingActive.value);
      setAddOpen(false);
      toast({
        title: "Category already exists",
        description: `Selected “${existingActive.value}”.`,
        variant: "default",
      });
      return;
    }
    setCreating(true);
    try {
      const created = await addExpenseCategory(trimmed);
      if (!created) {
        setCreateError("Category was not returned by the server.");
        return;
      }
      if (created.toLowerCase() !== trimmed.toLowerCase()) {
        toast({
          title: "Using existing category",
          description: `“${created}” matches an existing name.`,
          variant: "default",
        });
      }
      const next = await pickerItemsByStoredName("category", created);
      const selected = next.find((item) => item.value.toLowerCase() === created.toLowerCase());
      const nextWithCreated = selected ? next : [...next, { value: created, label: created }];
      setItems(nextWithCreated);
      onCategoriesUpdatedRef.current?.(
        nextWithCreated.filter((item) => !item.archived).map((item) => item.value)
      );
      onValueChange(selected?.value ?? created);
      setAddOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Create failed";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <ExpenseSearchableSelect
        value={radixValue}
        disabled={disabled}
        loading={loading}
        options={items.map((item) => ({
          value: item.value,
          label: item.label,
          searchText: item.value,
        }))}
        actions={[
          {
            value: ADD_NEW_VALUE,
            label: "+ Add new category",
            searchText: "add new category",
            onSelect: () => setAddOpen(true),
          },
        ]}
        fallbackLabel={fallbackLabel}
        placeholder="Category"
        emptyText="No matching categories"
        searchPlaceholder="Search categories…"
        id={id}
        className={cn("h-9", className)}
        aria-label="Category"
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        data-queue-row-id={dataQueueRowId}
        data-queue-field={dataQueueField}
        onValueChange={(v) => {
          if (!v.trim()) return;
          onValueChange(v);
        }}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-sm border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New category</DialogTitle>
          </DialogHeader>
          <Input
            ref={newInputRef}
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (createError) setCreateError(null);
            }}
            placeholder="Category name"
            className="h-9"
            disabled={creating}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
          {createError ? (
            <p
              data-testid="expense-category-create-error"
              role="alert"
              className="text-xs leading-snug text-destructive"
            >
              {createError}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={creating}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              {creating ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

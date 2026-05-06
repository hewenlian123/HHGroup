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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [creating, setCreating] = React.useState(false);
  const newInputRef = React.useRef<HTMLInputElement>(null);
  const onCategoriesUpdatedRef = React.useRef(onCategoriesUpdated);
  onCategoriesUpdatedRef.current = onCategoriesUpdated;

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const next = await pickerItemsByStoredName("category", preserveArchivedValue ? value : null);
      setItems(next);
      onCategoriesUpdatedRef.current?.(
        next.filter((item) => !item.archived).map((item) => item.value)
      );
      const current = value.trim().toLowerCase();
      if (
        !preserveArchivedValue &&
        current &&
        !next.some((item) => item.value.toLowerCase() === current)
      ) {
        onValueChange(next[0]?.value ?? "");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load categories";
      toast({ title: "Categories", description: msg, variant: "error" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [onValueChange, preserveArchivedValue, toast, value]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (addOpen) {
      setNewName("");
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

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast({ title: "Category name required", variant: "error" });
      return;
    }
    const lower = trimmed.toLowerCase();
    if (items.some((item) => item.value.toLowerCase() === lower && !item.archived)) {
      toast({
        title: "Duplicate category",
        description: `“${trimmed}” already exists.`,
        variant: "error",
      });
      return;
    }
    setCreating(true);
    try {
      const created = await addExpenseCategory(trimmed);
      if (!created) {
        toast({ title: "Could not create category", variant: "error" });
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
      setItems(next);
      onCategoriesUpdatedRef.current?.(
        next.filter((item) => !item.archived).map((item) => item.value)
      );
      onValueChange(created);
      setAddOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Create failed";
      toast({ title: "Category", description: msg, variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Select
        value={radixValue}
        disabled={disabled || loading}
        onValueChange={(v) => {
          if (v === ADD_NEW_VALUE) {
            setAddOpen(true);
            return;
          }
          onValueChange(v);
        }}
      >
        <SelectTrigger
          id={id}
          className={cn("h-9", className)}
          aria-busy={loading}
          data-queue-row-id={dataQueueRowId}
          data-queue-field={dataQueueField}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLButtonElement>}
        >
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={`${item.value}-${item.archived ? "a" : "x"}`} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW_VALUE}>+ Add new category</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-sm border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New category</DialogTitle>
          </DialogHeader>
          <Input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
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

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
import { addExpenseCategory, getExpenseCategories } from "@/lib/data";
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
  /** Forwarded to the native select for keyboard / focus navigation (e.g. receipt queue). */
  "data-queue-row-id"?: string;
  "data-queue-field"?: string;
};

function mergeOptions(names: string[], current: string): string[] {
  const s = new Set(names.map((n) => n.trim()).filter(Boolean));
  const cur = current.trim();
  if (cur) s.add(cur);
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function ExpenseCategorySelect({
  value,
  onValueChange,
  disabled,
  className,
  id,
  autoFocus,
  onKeyDown,
  onCategoriesUpdated,
  "data-queue-row-id": dataQueueRowId,
  "data-queue-field": dataQueueField,
}: ExpenseCategorySelectProps) {
  const { toast } = useToast();
  const [options, setOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const newInputRef = React.useRef<HTMLInputElement>(null);
  const onCategoriesUpdatedRef = React.useRef(onCategoriesUpdated);
  onCategoriesUpdatedRef.current = onCategoriesUpdated;

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const names = await getExpenseCategories();
        if (cancelled) return;
        setOptions(names);
        onCategoriesUpdatedRef.current?.(names);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load categories";
        toast({ title: "Categories", description: msg, variant: "error" });
        setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  React.useEffect(() => {
    if (addOpen) {
      setNewName("");
      const t = window.setTimeout(() => newInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [addOpen]);

  const merged = React.useMemo(() => mergeOptions(options, value), [options, value]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast({ title: "Category name required", variant: "error" });
      return;
    }
    const lower = trimmed.toLowerCase();
    if (merged.some((n) => n.toLowerCase() === lower)) {
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
      const names = await getExpenseCategories();
      setOptions(names);
      onCategoriesUpdatedRef.current?.(names);
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
        value={value}
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
          {merged.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
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

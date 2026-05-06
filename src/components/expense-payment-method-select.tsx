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
import { addPaymentMethod } from "@/lib/data";
import { pickerItemsByStoredName } from "@/lib/expense-options-db";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

const ADD_NEW_VALUE = "__hh_add_payment_method__";

export type ExpensePaymentMethodSelectProps = {
  value: string;
  onValueChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function ExpensePaymentMethodSelect({
  value,
  onValueChange,
  disabled,
  className,
  id,
}: ExpensePaymentMethodSelectProps) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<{ value: string; label: string; archived?: boolean }[]>(
    []
  );
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const newInputRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const next = await pickerItemsByStoredName("payment_method", value);
      setItems(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load payment methods";
      toast({ title: "Payment method", description: msg, variant: "error" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast, value]);

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

  const selectItems = React.useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed || items.some((item) => item.value.toLowerCase() === trimmed.toLowerCase())) {
      return items;
    }
    return [...items, { value: trimmed, label: trimmed }];
  }, [items, value]);
  const knownValues = new Set(selectItems.map((i) => i.value));
  const radixValue = knownValues.has(value)
    ? value
    : value.trim()
      ? value
      : (selectItems[0]?.value ?? "");

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast({ title: "Name required", variant: "error" });
      return;
    }
    if (items.some((i) => i.value.toLowerCase() === trimmed.toLowerCase() && !i.archived)) {
      toast({ title: "Duplicate", description: `"${trimmed}" already exists.`, variant: "error" });
      return;
    }
    setCreating(true);
    const previousValue = value;
    setItems((prev) =>
      prev.some((item) => item.value.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, { value: trimmed, label: trimmed }]
    );
    onValueChange(trimmed);
    try {
      const created = await addPaymentMethod(trimmed);
      if (!created) {
        onValueChange(previousValue);
        toast({ title: "Could not add payment method", variant: "error" });
        return;
      }
      const next = await pickerItemsByStoredName("payment_method", created);
      setItems(next);
      onValueChange(created);
      setAddOpen(false);
    } catch (e) {
      onValueChange(previousValue);
      const msg = e instanceof Error ? e.message : "Create failed";
      toast({ title: "Payment method", description: msg, variant: "error" });
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
          className={cn(
            "h-10 rounded-sm border-border/60 text-sm [&>span]:line-clamp-1",
            className
          )}
          aria-busy={loading}
        >
          <SelectValue placeholder="Method" />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="z-[200] max-h-56">
          {selectItems.map((it) => (
            <SelectItem key={`${it.value}-${it.archived ? "a" : "x"}`} value={it.value}>
              {it.label}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW_VALUE}>+ Add new</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-sm border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New payment method</DialogTitle>
          </DialogHeader>
          <Input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="h-9 rounded-sm"
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
              className="h-8 rounded-sm"
              disabled={creating}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-sm"
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

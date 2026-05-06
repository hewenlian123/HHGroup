"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Expense } from "@/lib/data";
import { pickerItemsPaymentSource } from "@/lib/expense-options-db";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

export type ExpensePaymentSourceSelectProps = {
  value: NonNullable<Expense["sourceType"]>;
  onValueChange: (next: NonNullable<Expense["sourceType"]>) => void;
  disabled?: boolean;
  className?: string;
};

export function ExpensePaymentSourceSelect({
  value,
  onValueChange,
  disabled,
  className,
}: ExpensePaymentSourceSelectProps) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<{ value: string; label: string; archived?: boolean }[]>(
    []
  );
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const next = await pickerItemsPaymentSource(value ?? "company");
        if (!cancelled) setItems(next);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load sources";
          toast({ title: "Payment source", description: msg, variant: "error" });
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast, value]);

  const raw = (value ?? "company")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const normalized =
    raw === "receipt" || raw === "upload"
      ? "receipt_upload"
      : raw === "reimburse" || raw === "worker_reimbursement"
        ? "reimbursement"
        : raw === "bank"
          ? "bank_import"
          : raw === "manual"
            ? "company"
            : raw;

  const knownValues = new Set(items.map((i) => i.value));
  const radixValue = knownValues.has(normalized)
    ? normalized
    : (items[0]?.value ?? normalized ?? "company");

  return (
    <Select
      value={radixValue}
      disabled={disabled || loading}
      onValueChange={(v) => onValueChange(v as NonNullable<Expense["sourceType"]>)}
    >
      <SelectTrigger
        className={cn("h-10 rounded-sm border-border/60 text-sm [&>span]:line-clamp-1", className)}
        aria-busy={loading}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={4} className="z-[200] max-h-56">
        {items.map((it) => (
          <SelectItem key={`${it.value}-${it.archived ? "a" : "x"}`} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

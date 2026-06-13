"use client";

import * as React from "react";
import { ExpenseSearchableSelect } from "@/components/expense-searchable-select";
import type { Expense } from "@/lib/data";
import { pickerItemsPaymentSource } from "@/lib/expense-options-db";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

export type ExpensePaymentSourceSelectProps = {
  value: NonNullable<Expense["sourceType"]>;
  onValueChange: (next: NonNullable<Expense["sourceType"]>) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
};

export function ExpensePaymentSourceSelect({
  value,
  onValueChange,
  id,
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
  const fallbackLabel = items.find((item) => item.value === radixValue)?.label ?? radixValue;

  return (
    <ExpenseSearchableSelect
      value={radixValue}
      disabled={disabled}
      loading={loading}
      options={items.map((it) => ({
        value: it.value,
        label: it.label,
        searchText: it.value,
      }))}
      fallbackLabel={fallbackLabel}
      placeholder="Payment source"
      emptyText="No matching sources"
      searchPlaceholder="Search payment sources…"
      id={id}
      className={cn("h-10 rounded-sm border-border/60 text-sm [&>span]:line-clamp-1", className)}
      aria-label="Payment source"
      onValueChange={(v) => onValueChange(v as NonNullable<Expense["sourceType"]>)}
    />
  );
}

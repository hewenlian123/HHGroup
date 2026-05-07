"use client";

import * as React from "react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";

export type WorkerAdvanceOption = {
  id: string;
  amount: number;
  advanceDate: string;
  projectName: string | null;
  notes: string | null;
  status: "pending" | "deducted" | "cancelled";
};

type Props = {
  advances: WorkerAdvanceOption[];
  selectedIds: string[];
  onChange: (nextSelectedIds: string[]) => void;
  disabled?: boolean;
};

export function WorkerAdvanceSelector({
  advances,
  selectedIds,
  onChange,
  disabled = false,
}: Props) {
  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (!advances.length) {
    return <p className="text-xs text-muted-foreground">No pending advances for this worker.</p>;
  }

  const totalSelected = advances
    .filter((a) => selectedIds.includes(a.id))
    .reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border/60">
        {advances.map((a) => {
          const checked = selectedIds.includes(a.id);
          return (
            <label
              key={a.id}
              className="flex items-start gap-2 px-3 py-2 text-xs hover:bg-muted/40 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <input
                type="checkbox"
                className="mt-[2px] h-3.5 w-3.5 rounded border border-border/70"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(a.id)}
              />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className={TYPO.amount}>{formatCurrency(a.amount)}</span>
                  <span className={TYPO.date}>{formatDate(a.advanceDate)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate max-w-[160px]">{a.projectName ?? "No project"}</span>
                  {a.notes ? <span className="truncate max-w-[160px]">{a.notes}</span> : null}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Total to deduct</span>
        <span className={TYPO.amount}>{formatCurrency(totalSelected)}</span>
      </div>
    </div>
  );
}

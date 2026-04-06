"use client";

import { cn } from "@/lib/utils";

/** Semantic colors for ledger / reconciliation / OCR review flows. */
export type MatchStatusKind = "matched" | "unmatched" | "suggested" | "ignored";

const KIND_META: Record<MatchStatusKind, { label: string; dot: string; text: string }> = {
  matched: {
    label: "Matched",
    dot: "bg-emerald-600 dark:bg-emerald-400",
    text: "text-emerald-800 dark:text-emerald-200",
  },
  unmatched: {
    label: "Unmatched",
    dot: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-900 dark:text-amber-100",
  },
  suggested: {
    label: "Suggested",
    dot: "bg-blue-600 dark:bg-blue-400",
    text: "text-blue-900 dark:text-blue-100",
  },
  ignored: {
    label: "Ignored",
    dot: "bg-zinc-400 dark:bg-zinc-500",
    text: "text-zinc-600 dark:text-zinc-400",
  },
};

export interface MatchStatusBadgeProps {
  kind: MatchStatusKind;
  /** Override visible label (e.g. "Reconciled" → still use kind `matched` colors). */
  label?: string;
  className?: string;
}

/** Dot + label; use for bank rows, expense review, and suggestion lists. */
export function MatchStatusBadge({ kind, label, className }: MatchStatusBadgeProps) {
  const m = KIND_META[kind];
  const text = label ?? m.label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums",
        m.text,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} aria-hidden />
      {text}
    </span>
  );
}

/** Map bank import / reconcile API status to match badge kind + display label. */
export function bankTransactionMatchKind(status: "reconciled" | "unmatched"): {
  kind: MatchStatusKind;
  label: string;
} {
  if (status === "reconciled") return { kind: "matched", label: "Matched" };
  return { kind: "unmatched", label: "Unmatched" };
}

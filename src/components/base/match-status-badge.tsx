"use client";

import { StatusBadge, type StatusBadgeVariant } from "@/components/base/status-badge";
import { cn } from "@/lib/utils";

/** Semantic colors for ledger / reconciliation / OCR review flows. */
export type MatchStatusKind = "matched" | "unmatched" | "suggested" | "ignored";

const KIND_META: Record<MatchStatusKind, { label: string; variant: StatusBadgeVariant }> = {
  matched: { label: "Matched", variant: "success" },
  unmatched: { label: "Unmatched", variant: "warning" },
  suggested: { label: "Suggested", variant: "info" },
  ignored: { label: "Ignored", variant: "muted" },
};

export interface MatchStatusBadgeProps {
  kind: MatchStatusKind;
  /** Override visible label while retaining the domain mapping. */
  label?: string;
  className?: string;
}

export function MatchStatusBadge({ kind, label, className }: MatchStatusBadgeProps) {
  const metadata = KIND_META[kind];
  return (
    <StatusBadge
      label={label ?? metadata.label}
      variant={metadata.variant}
      className={cn("hh-fin", className)}
    />
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

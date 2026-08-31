"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type EstimateSaveStatus = "idle" | "unsaved" | "saving" | "saved" | "failed";

export function EstimateBuilderSaveStatus({
  status,
  className,
}: {
  status: EstimateSaveStatus;
  className?: string;
}): React.ReactElement | null {
  if (status === "idle") return null;

  const label =
    status === "unsaved"
      ? "Unsaved changes"
      : status === "saving"
        ? "Saving…"
        : status === "failed"
          ? "Save failed — try again"
          : "Saved";

  return (
    <span
      className={cn(
        "eb-estimate-save-status text-xs font-medium tabular-nums",
        status === "unsaved" && "text-[var(--hh-warning)]",
        status === "saving" && "text-muted-foreground",
        status === "saved" && "text-[var(--hh-success)]",
        status === "failed" && "text-[var(--hh-danger)]",
        className
      )}
      role="status"
      aria-live="polite"
      data-estimate-save-state={status}
    >
      {label}
    </span>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type EstimateSaveStatus = "idle" | "unsaved" | "saving" | "saved";

export function EstimateBuilderSaveStatus({
  status,
  className,
}: {
  status: EstimateSaveStatus;
  className?: string;
}): React.ReactElement | null {
  if (status === "idle") return null;

  const label =
    status === "unsaved" ? "Unsaved changes" : status === "saving" ? "Saving…" : "Saved";

  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        status === "unsaved" && "text-amber-700 dark:text-amber-500",
        status === "saving" && "text-muted-foreground",
        status === "saved" && "text-emerald-700 dark:text-emerald-500",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}

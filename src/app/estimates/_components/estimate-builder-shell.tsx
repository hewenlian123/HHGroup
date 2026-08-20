"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import "./estimate-builder-glass.css";
import "./estimate-builder-operational.css";

export type EstimateBuilderShellProps = {
  children: React.ReactNode;
  className?: string;
};

/** Shared Operational Compact canvas for new and existing Estimates. */
export function EstimateBuilderShell({
  children,
  className,
}: EstimateBuilderShellProps): React.ReactElement {
  return (
    <div className={cn("estimate-builder", className)}>
      <div className="eb-builder-content">{children}</div>
    </div>
  );
}

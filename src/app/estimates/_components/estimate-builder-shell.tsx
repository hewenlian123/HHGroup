"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import "./estimate-builder-glass.css";

export type EstimateBuilderShellProps = {
  children: React.ReactNode;
  className?: string;
};

/** Dark glass canvas for Estimate Builder (new + edit). */
export function EstimateBuilderShell({
  children,
  className,
}: EstimateBuilderShellProps): React.ReactElement {
  return (
    <div className={cn("estimate-builder", className)}>
      <div className="eb-ambient-top" aria-hidden />
      <div className="eb-ambient-gold" aria-hidden />
      <div className="eb-builder-content">{children}</div>
    </div>
  );
}

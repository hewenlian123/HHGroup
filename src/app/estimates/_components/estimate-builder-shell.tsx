"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import "./estimate-builder-glass.css";
import "./estimate-builder-operational.css";
import "./estimate-builder-stitch.css";
import { EstimateStitchInspectorProvider } from "./estimate-stitch-inspector";

export type EstimateBuilderShellProps = {
  children: React.ReactNode;
  className?: string;
};

/** Stitch workspace canvas for new and existing Estimates. */
export function EstimateBuilderShell({
  children,
  className,
}: EstimateBuilderShellProps): React.ReactElement {
  return (
    <div className={cn("estimate-builder", className)}>
      <EstimateStitchInspectorProvider>
        <div className="eb-builder-content">{children}</div>
      </EstimateStitchInspectorProvider>
    </div>
  );
}

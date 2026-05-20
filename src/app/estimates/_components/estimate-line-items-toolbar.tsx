"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { EB } from "./estimate-builder-ui";
import { cn } from "@/lib/utils";

export function EstimateLineItemsToolbar({
  onAddSection,
  disabled,
}: {
  onAddSection: () => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={cn(EB.composerAddSection)}
      onClick={onAddSection}
      disabled={disabled}
      aria-label="Add section"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Add Section
    </button>
  );
}

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ESTIMATE_LINE_ITEM_PRESETS } from "./estimate-line-item-presets";

export function EstimateLineItemsToolbar({
  onAddCategory,
  addCategoryDisabled,
  onApplyPreset,
  presetsDisabled,
  showPresets = true,
}: {
  onAddCategory: () => void;
  addCategoryDisabled?: boolean;
  onApplyPreset: (presetId: string) => void;
  presetsDisabled?: boolean;
  showPresets?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 rounded-sm"
        onClick={onAddCategory}
        disabled={addCategoryDisabled}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Category
      </Button>
      {showPresets ? (
        <select
          className="min-h-11 rounded-sm border border-input bg-background px-3 text-sm"
          defaultValue=""
          disabled={presetsDisabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onApplyPreset(v);
            e.target.value = "";
          }}
          aria-label="Add line from preset"
        >
          <option value="">Add preset…</option>
          {ESTIMATE_LINE_ITEM_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

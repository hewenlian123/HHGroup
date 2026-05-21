"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";
import type { StoredLineItemPreset } from "./estimate-builder-draft-storage";
import { LINE_ITEM_QUICK_PRESETS } from "./estimate-line-item-presets";
import type { LineItemPresetInput } from "./estimate-builder-draft-storage";

export type EstimateAddLineMenuProps = {
  disabled?: boolean;
  className?: string;
  align?: "start" | "end" | "center";
  recentItems: StoredLineItemPreset[];
  savedItems: StoredLineItemPreset[];
  onAddBlank: () => void;
  onAddPreset: (preset: LineItemPresetInput) => void;
};

export function EstimateAddLineMenu({
  disabled = false,
  className,
  align = "start",
  recentItems,
  savedItems,
  onAddBlank,
  onAddPreset,
}: EstimateAddLineMenuProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  const renderPresetItem = (preset: LineItemPresetInput, key: string): React.ReactElement => (
    <DropdownMenuItem
      key={key}
      className={EB.commandMenuItem}
      disabled={disabled}
      onSelect={() => {
        onAddPreset(preset);
        setOpen(false);
      }}
    >
      <span className="truncate">{preset.title.trim() || "Untitled"}</span>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(EB.addLineLink, className)}
          disabled={disabled}
          aria-label="Add line"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Add line
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn(EB.builderPickerMenu, EB.commandMenu)}>
        <DropdownMenuItem
          className={EB.commandMenuItem}
          disabled={disabled}
          onSelect={() => {
            onAddBlank();
            setOpen(false);
          }}
        >
          Blank line
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 bg-white/[0.06]" />
        <DropdownMenuLabel className={EB.builderPickerGroupLabel}>Examples</DropdownMenuLabel>
        {LINE_ITEM_QUICK_PRESETS.map((preset) => renderPresetItem(preset, `ex-${preset.title}`))}
        {recentItems.length > 0 ? (
          <>
            <DropdownMenuSeparator className="my-1 bg-white/[0.06]" />
            <DropdownMenuLabel className={EB.builderPickerGroupLabel}>Recent</DropdownMenuLabel>
            {recentItems.map((preset) => renderPresetItem(preset, preset.id))}
          </>
        ) : null}
        {savedItems.length > 0 ? (
          <>
            <DropdownMenuSeparator className="my-1 bg-white/[0.06]" />
            <DropdownMenuLabel className={EB.builderPickerGroupLabel}>Saved</DropdownMenuLabel>
            {savedItems.map((preset) => renderPresetItem(preset, preset.id))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
import { SECTION_TEMPLATE_NAMES } from "./estimate-section-templates";
import type { RecentSectionEntry } from "./estimate-builder-draft-storage";

export type EstimateAddSectionMenuProps = {
  disabled?: boolean;
  canAddSection: boolean;
  recentSections: RecentSectionEntry[];
  onAddBlank: () => void;
  onAddTemplate: (templateName: string) => void;
  onAddRecent: (entry: RecentSectionEntry) => void;
};

export function EstimateAddSectionMenu({
  disabled = false,
  canAddSection,
  recentSections,
  onAddBlank,
  onAddTemplate,
  onAddRecent,
}: EstimateAddSectionMenuProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(EB.composerAddSection)}
          disabled={disabled || !canAddSection}
          aria-label="Add section"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Add Section
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(EB.builderPickerMenu, EB.commandMenu)}>
        <DropdownMenuItem
          className={EB.commandMenuItem}
          disabled={disabled || !canAddSection}
          onSelect={() => {
            onAddBlank();
            setOpen(false);
          }}
        >
          Blank section
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 bg-white/[0.06]" />
        <DropdownMenuLabel className={EB.builderPickerGroupLabel}>Templates</DropdownMenuLabel>
        {SECTION_TEMPLATE_NAMES.map((name) => (
          <DropdownMenuItem
            key={name}
            className={EB.commandMenuItem}
            disabled={disabled || !canAddSection}
            onSelect={() => {
              onAddTemplate(name);
              setOpen(false);
            }}
          >
            {name}
          </DropdownMenuItem>
        ))}
        {recentSections.length > 0 ? (
          <>
            <DropdownMenuSeparator className="my-1 bg-white/[0.06]" />
            <DropdownMenuLabel className={EB.builderPickerGroupLabel}>Recent</DropdownMenuLabel>
            {recentSections.map((entry) => (
              <DropdownMenuItem
                key={`${entry.costCode}-${entry.displayName}-${entry.usedAt}`}
                className={EB.commandMenuItem}
                disabled={disabled || !canAddSection}
                onSelect={() => {
                  onAddRecent(entry);
                  setOpen(false);
                }}
              >
                {entry.displayName}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

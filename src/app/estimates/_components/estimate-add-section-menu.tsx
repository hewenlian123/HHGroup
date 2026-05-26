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
import { SECTION_TEMPLATE_NAMES, normalizeProposalSectionName } from "./estimate-section-templates";
import type { RecentSectionEntry } from "./estimate-builder-draft-storage";

export type EstimateAddSectionMenuProps = {
  disabled?: boolean;
  canAddSection: boolean;
  recentSections: RecentSectionEntry[];
  existingSectionNames: string[];
  onAddCustom: (title: string) => boolean;
  onAddBlank: () => void;
  onAddTemplate: (templateName: string) => void;
  onAddRecent: (entry: RecentSectionEntry) => void;
};

export function EstimateAddSectionMenu({
  disabled = false,
  canAddSection,
  recentSections,
  existingSectionNames,
  onAddCustom,
  onAddBlank,
  onAddTemplate,
  onAddRecent,
}: EstimateAddSectionMenuProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [customTitle, setCustomTitle] = React.useState("");
  const normalizedExistingNames = React.useMemo(
    () => new Set(existingSectionNames.map((name) => normalizeProposalSectionName(name))),
    [existingSectionNames]
  );
  const normalizedCustomTitle = normalizeProposalSectionName(customTitle);
  const isDuplicate = normalizedCustomTitle
    ? normalizedExistingNames.has(normalizedCustomTitle)
    : false;
  const canSubmitCustom = Boolean(normalizedCustomTitle) && !isDuplicate && !disabled;
  const hasExistingSectionName = React.useCallback(
    (name: string): boolean => normalizedExistingNames.has(normalizeProposalSectionName(name)),
    [normalizedExistingNames]
  );

  const handleAddCustom = React.useCallback((): void => {
    if (!canSubmitCustom) return;
    const added = onAddCustom(customTitle);
    if (!added) return;
    setCustomTitle("");
    setOpen(false);
  }, [canSubmitCustom, customTitle, onAddCustom]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(EB.composerAddSection)}
          disabled={disabled}
          aria-label="Add section"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Add Section
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(EB.builderPickerMenu, EB.commandMenu)}>
        <div
          className="px-1.5 py-1.5"
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label
            htmlFor="estimate-custom-section-title"
            className={cn(EB.builderPickerGroupLabel, "block px-1 pb-1")}
          >
            Custom section
          </label>
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              id="estimate-custom-section-title"
              type="text"
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddCustom();
                }
              }}
              className={cn(
                "h-8 min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.05] px-2.5 text-[13px] text-zinc-50 outline-none transition focus:border-cyan-300/35 focus:ring-2 focus:ring-cyan-300/15",
                "placeholder:text-zinc-500"
              )}
              placeholder="Proposal section title"
              aria-label="Custom section title"
              aria-invalid={isDuplicate ? "true" : undefined}
              aria-describedby={isDuplicate ? "estimate-custom-section-error" : undefined}
              disabled={disabled}
            />
            <button
              type="button"
              className={cn(
                "h-8 shrink-0 rounded-md px-2.5 text-[12px] font-semibold transition",
                canSubmitCustom
                  ? "bg-cyan-300 text-zinc-950 hover:bg-cyan-200"
                  : "cursor-not-allowed bg-white/[0.06] text-zinc-500"
              )}
              disabled={!canSubmitCustom}
              onClick={handleAddCustom}
            >
              Add custom section
            </button>
          </div>
          {isDuplicate ? (
            <p id="estimate-custom-section-error" className="mt-1 px-1 text-[11px] text-amber-200">
              A section with this name already exists.
            </p>
          ) : null}
        </div>
        <DropdownMenuSeparator className="my-1 bg-white/[0.06]" />
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
            disabled={disabled || !canAddSection || hasExistingSectionName(name)}
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
                disabled={disabled || !canAddSection || hasExistingSectionName(entry.displayName)}
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

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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerLabel?: string;
  triggerAriaLabel?: string;
  align?: "start" | "center" | "end";
  reserveSpaceWhenOpen?: boolean;
  onFocusExisting?: (name: string) => void;
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
  open: controlledOpen,
  onOpenChange,
  triggerLabel = "Add Section",
  triggerAriaLabel,
  align = "end",
  reserveSpaceWhenOpen = false,
  onFocusExisting,
  onAddCustom,
  onAddBlank,
  onAddTemplate,
  onAddRecent,
}: EstimateAddSectionMenuProps): React.ReactElement {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean): void => {
      if (controlledOpen === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );
  const [customTitle, setCustomTitle] = React.useState("");
  const customTitleId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const selectionMovedFocusRef = React.useRef(false);
  const contextualMenuSpace = 296;
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
    selectionMovedFocusRef.current = true;
    setCustomTitle("");
    setOpen(false);
  }, [canSubmitCustom, customTitle, onAddCustom, setOpen]);

  React.useLayoutEffect(() => {
    if (!open || !reserveSpaceWhenOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const overflow =
        trigger.getBoundingClientRect().bottom + contextualMenuSpace - window.innerHeight;
      if (overflow <= 0) return;
      const scrollParent = trigger.closest<HTMLElement>("main");
      if (!scrollParent) return;
      const previousScrollBehavior = scrollParent.style.scrollBehavior;
      scrollParent.style.scrollBehavior = "auto";
      scrollParent.scrollTop += overflow + 12;
      window.requestAnimationFrame(() => {
        scrollParent.style.scrollBehavior = previousScrollBehavior;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, reserveSpaceWhenOpen]);

  return (
    <div className={reserveSpaceWhenOpen ? "min-w-0 w-full" : "contents"}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={cn(EB.composerAddSection)}
            disabled={disabled}
            aria-label={triggerAriaLabel ?? triggerLabel}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {triggerLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          side="bottom"
          sideOffset={4}
          collisionPadding={12}
          avoidCollisions={!reserveSpaceWhenOpen}
          onCloseAutoFocus={(event) => {
            if (!selectionMovedFocusRef.current) return;
            event.preventDefault();
            selectionMovedFocusRef.current = false;
          }}
          className={cn(
            EB.builderPickerMenu,
            EB.commandMenu,
            reserveSpaceWhenOpen && "max-h-[min(18rem,calc(100dvh-7rem))]"
          )}
        >
          <div
            className="px-1.5 py-1.5"
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <label
              htmlFor={customTitleId}
              className={cn(EB.builderPickerGroupLabel, "block px-1 pb-1")}
            >
              Custom section
            </label>
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                id={customTitleId}
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
                  "h-8 min-w-0 flex-1 rounded-md border border-[var(--hh-border-strong)] bg-white px-2.5 text-hh-table-cell text-[var(--hh-text-primary)] outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-[var(--hh-border-strong)] focus:ring-2 focus-visible:ring-[var(--hh-focus-ring)]",
                  "placeholder:text-[var(--hh-text-tertiary)]"
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
                  "h-8 shrink-0 rounded-md px-2.5 text-hh-metadata font-semibold transition",
                  canSubmitCustom
                    ? "bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] hover:opacity-90"
                    : "cursor-not-allowed bg-[var(--hh-l3-hover)] text-[var(--hh-text-tertiary)]"
                )}
                disabled={!canSubmitCustom}
                onClick={handleAddCustom}
              >
                Add custom section
              </button>
            </div>
            {isDuplicate ? (
              <p
                id="estimate-custom-section-error"
                className="mt-1 px-1 text-hh-status text-[var(--hh-warning)]"
              >
                A section with this name already exists.
              </p>
            ) : null}
          </div>
          <DropdownMenuSeparator className="my-1 bg-[var(--hh-border)]" />
          <DropdownMenuItem
            className={EB.commandMenuItem}
            disabled={disabled || !canAddSection}
            onSelect={() => {
              selectionMovedFocusRef.current = true;
              onAddBlank();
              setOpen(false);
            }}
          >
            Blank section
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1 bg-[var(--hh-border)]" />
          <DropdownMenuLabel className={EB.builderPickerGroupLabel}>Templates</DropdownMenuLabel>
          {SECTION_TEMPLATE_NAMES.map((name) => (
            <DropdownMenuItem
              key={name}
              className={EB.commandMenuItem}
              disabled={disabled || !canAddSection}
              onSelect={() => {
                selectionMovedFocusRef.current = true;
                if (hasExistingSectionName(name)) {
                  onFocusExisting?.(name);
                } else {
                  onAddTemplate(name);
                }
                setOpen(false);
              }}
            >
              <span>{name}</span>
              {hasExistingSectionName(name) ? (
                <span className="ml-auto text-hh-status text-[var(--hh-text-tertiary)]">
                  Already added
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
          {recentSections.length > 0 ? (
            <>
              <DropdownMenuSeparator className="my-1 bg-[var(--hh-border)]" />
              <DropdownMenuLabel className={EB.builderPickerGroupLabel}>Recent</DropdownMenuLabel>
              {recentSections.map((entry) => (
                <DropdownMenuItem
                  key={`${entry.costCode}-${entry.displayName}-${entry.usedAt}`}
                  className={EB.commandMenuItem}
                  disabled={disabled || !canAddSection}
                  onSelect={() => {
                    selectionMovedFocusRef.current = true;
                    if (hasExistingSectionName(entry.displayName)) {
                      onFocusExisting?.(entry.displayName);
                    } else {
                      onAddRecent(entry);
                    }
                    setOpen(false);
                  }}
                >
                  <span>{entry.displayName}</span>
                  {hasExistingSectionName(entry.displayName) ? (
                    <span className="ml-auto text-hh-status text-[var(--hh-text-tertiary)]">
                      Already added
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {open && reserveSpaceWhenOpen ? (
        <div
          aria-hidden="true"
          data-testid="estimate-section-menu-space"
          style={{ height: contextualMenuSpace }}
        />
      ) : null}
    </div>
  );
}

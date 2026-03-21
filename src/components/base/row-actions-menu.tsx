"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listRowActionsContentClassName,
  listRowActionsDestructiveClassName,
  listRowActionsItemClassName,
  listRowActionsTriggerClassName,
} from "@/lib/list-table-interaction";

export type RowAction = {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export interface RowActionsMenuProps {
  actions: RowAction[];
  ariaLabel?: string;
  className?: string;
  /** Merged into `DropdownMenuContent` (e.g. SaaS-style panel). */
  contentClassName?: string;
  /** Merged into every `DropdownMenuItem`. */
  itemClassName?: string;
  /** Overrides default destructive item text/focus colors when `destructive` is true. */
  destructiveItemClassName?: string;
  /** Use larger touch target on mobile (e.g. min-h-[44px]). */
  touchFriendly?: boolean;
  /**
   * `list`: unified SaaS list styling (hover-reveal trigger, white dropdown, min-w 160px).
   * Merges with `className` / `contentClassName` / etc. when you need overrides.
   */
  appearance?: "default" | "list";
}

/**
 * Three-dot (kebab) row actions menu. Use in table rows or cards for consistent
 * Linear/Notion-style action menus. Closes automatically on select.
 */
export function RowActionsMenu({
  actions,
  ariaLabel = "Row actions",
  className,
  contentClassName,
  itemClassName,
  destructiveItemClassName,
  touchFriendly: touchFriendlyProp,
  appearance = "default",
}: RowActionsMenuProps) {
  const touchFriendly = appearance === "list" ? false : (touchFriendlyProp ?? true);
  const visibleActions = actions.filter((a) => a !== undefined && a !== null);
  if (visibleActions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground",
            touchFriendly && "min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-8 md:w-8",
            appearance === "list" && listRowActionsTriggerClassName,
            className
          )}
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className={cn(
          "min-w-[10rem]",
          appearance === "list" && listRowActionsContentClassName,
          contentClassName
        )}
      >
        {visibleActions.map((action, i) => (
          <DropdownMenuItem
            key={i}
            disabled={action.disabled}
            className={cn(
              appearance === "list" && listRowActionsItemClassName,
              itemClassName,
              action.destructive &&
                (destructiveItemClassName ??
                  (appearance === "list"
                    ? listRowActionsDestructiveClassName
                    : "text-destructive focus:text-destructive"))
            )}
            onSelect={(e) => {
              e.preventDefault();
              if (!action.disabled) action.onClick();
            }}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

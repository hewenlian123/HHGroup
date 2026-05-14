"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
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
  /** Dropdown alignment. Defaults to right-aligned row actions. */
  contentAlign?: "start" | "center" | "end";
  /** Whether Radix may flip the menu to avoid viewport collisions. */
  contentAvoidCollisions?: boolean;
  /** Merged into `DropdownMenuContent` (e.g. SaaS-style panel). */
  contentClassName?: string;
  /** Dropdown side. Useful for tight mobile cards where the menu should open upward. */
  contentSide?: "top" | "right" | "bottom" | "left";
  contentSideOffset?: number;
  contentStyle?: React.CSSProperties;
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
  contentAlign = "end",
  contentAvoidCollisions,
  contentClassName,
  contentSide,
  contentSideOffset = 4,
  contentStyle,
  itemClassName,
  destructiveItemClassName,
  touchFriendly: touchFriendlyProp,
  appearance = "default",
}: RowActionsMenuProps) {
  const touchFriendly = appearance === "list" ? false : (touchFriendlyProp ?? true);
  const visibleActions = actions.filter((a) => a !== undefined && a !== null);
  const [open, setOpen] = React.useState(false);
  const lastRunRef = React.useRef(0);
  const runAction = React.useCallback((action: RowAction) => {
    if (action.disabled) return;
    const now = Date.now();
    if (now - lastRunRef.current < 250) return;
    lastRunRef.current = now;
    setOpen(false);
    action.onClick();
  }, []);
  if (visibleActions.length === 0) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "btn-outline-ghost h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground",
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
        align={contentAlign}
        avoidCollisions={contentAvoidCollisions}
        side={contentSide}
        sideOffset={contentSideOffset}
        style={contentStyle}
        className={cn(
          "min-w-[10rem]",
          appearance === "list" && listRowActionsContentClassName,
          contentClassName
        )}
      >
        {visibleActions.map((action, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            className={cn(
              "flex w-full items-center border-0 bg-transparent text-left outline-none disabled:pointer-events-none disabled:opacity-50",
              appearance === "list" && listRowActionsItemClassName,
              itemClassName,
              action.destructive &&
                (destructiveItemClassName ??
                  (appearance === "list"
                    ? listRowActionsDestructiveClassName
                    : "text-destructive focus:text-destructive"))
            )}
            onClick={(e) => {
              e.stopPropagation();
              runAction(action);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              runAction(action);
            }}
          >
            {action.label}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

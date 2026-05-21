"use client";

import * as React from "react";
import { Copy, Eye, EyeOff, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";

export type EstimateLineItemMoreMenuProps = {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleHideAmountOnPdf?: () => void;
  hideAmountOnPdf?: boolean;
  disabled?: boolean;
  showDuplicate?: boolean;
  showDelete?: boolean;
  showHideAmountOnPdf?: boolean;
};

export function EstimateLineItemMoreMenu({
  onDuplicate,
  onDelete,
  onToggleHideAmountOnPdf,
  hideAmountOnPdf = false,
  disabled = false,
  showDuplicate = true,
  showDelete = true,
  showHideAmountOnPdf = false,
}: EstimateLineItemMoreMenuProps): React.ReactElement | null {
  const hasHide = showHideAmountOnPdf && Boolean(onToggleHideAmountOnPdf);
  if (!showDuplicate && !showDelete && !hasHide) return null;
  if (!onDuplicate && !onDelete && !hasHide) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={EB.lineItemMoreTrigger}
          aria-label="More actions"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(EB.lineItemMoreMenu, EB.commandMenu)}>
        {showDuplicate && onDuplicate ? (
          <DropdownMenuItem
            className={EB.lineItemMoreMenuItem}
            disabled={disabled}
            aria-label="Duplicate line item"
            onSelect={() => {
              onDuplicate();
            }}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Duplicate
          </DropdownMenuItem>
        ) : null}
        {hasHide ? (
          <DropdownMenuItem
            className={EB.lineItemMoreMenuItem}
            disabled={disabled}
            aria-label={hideAmountOnPdf ? "Show amount on PDF" : "Hide amount on PDF"}
            onSelect={() => {
              onToggleHideAmountOnPdf?.();
            }}
          >
            {hideAmountOnPdf ? (
              <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            ) : (
              <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            )}
            {hideAmountOnPdf ? "Show amount on PDF" : "Hide amount on PDF"}
          </DropdownMenuItem>
        ) : null}
        {showDelete && onDelete ? (
          <DropdownMenuItem
            className={cn(EB.lineItemMoreMenuItem, EB.lineItemMoreMenuItemDanger)}
            disabled={disabled}
            aria-label="Remove line item"
            onSelect={() => {
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

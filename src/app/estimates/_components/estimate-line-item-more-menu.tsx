"use client";

import * as React from "react";
import { Bookmark, Check, Copy, Eye, EyeOff, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";
import {
  ESTIMATE_LINE_ITEM_STATUSES,
  LINE_ITEM_STATUS_LABELS,
  type EstimateLineItemStatus,
} from "./estimate-line-item-status";

export type EstimateLineItemMoreMenuProps = {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleHideAmountOnPdf?: () => void;
  hideAmountOnPdf?: boolean;
  disabled?: boolean;
  showDuplicate?: boolean;
  showDelete?: boolean;
  showHideAmountOnPdf?: boolean;
  showSetStatus?: boolean;
  currentStatus?: EstimateLineItemStatus;
  onSetStatus?: (status: EstimateLineItemStatus) => void;
  showSaveAsReusable?: boolean;
  onSaveAsReusable?: () => void;
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
  showSetStatus = false,
  currentStatus,
  onSetStatus,
  showSaveAsReusable = false,
  onSaveAsReusable,
}: EstimateLineItemMoreMenuProps): React.ReactElement | null {
  const [open, setOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const closeMenu = React.useCallback(() => {
    setStatusOpen(false);
    setOpen(false);
    window.setTimeout(() => {
      setStatusOpen(false);
      setOpen(false);
    }, 0);
  }, []);
  const hasHide = showHideAmountOnPdf && Boolean(onToggleHideAmountOnPdf);
  const hasStatus = showSetStatus && Boolean(onSetStatus);
  const hasSave = showSaveAsReusable && Boolean(onSaveAsReusable);
  if (!showDuplicate && !showDelete && !hasHide && !hasStatus && !hasSave) return null;
  if (!onDuplicate && !onDelete && !hasHide && !hasStatus && !hasSave) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
              closeMenu();
            }}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Duplicate
          </DropdownMenuItem>
        ) : null}
        {hasSave ? (
          <DropdownMenuItem
            className={EB.lineItemMoreMenuItem}
            disabled={disabled}
            aria-label="Save as reusable item"
            onSelect={() => {
              onSaveAsReusable?.();
              closeMenu();
            }}
          >
            <Bookmark className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Save as reusable item
          </DropdownMenuItem>
        ) : null}
        {hasStatus ? (
          <DropdownMenuSub open={statusOpen} onOpenChange={setStatusOpen}>
            <DropdownMenuSubTrigger className={EB.lineItemMoreMenuItem} disabled={disabled}>
              Set status
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={cn(EB.lineItemMoreMenu, EB.commandMenu)}>
              {ESTIMATE_LINE_ITEM_STATUSES.map((status) => (
                <DropdownMenuItem
                  key={status}
                  className={EB.lineItemMoreMenuItem}
                  disabled={disabled}
                  onSelect={(event) => {
                    event.preventDefault();
                    onSetStatus?.(status);
                    closeMenu();
                  }}
                >
                  {currentStatus === status ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <span className="inline-block h-3.5 w-3.5" aria-hidden />
                  )}
                  {LINE_ITEM_STATUS_LABELS[status]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {hasHide ? (
          <DropdownMenuItem
            className={EB.lineItemMoreMenuItem}
            disabled={disabled}
            aria-label={hideAmountOnPdf ? "Show amount on PDF" : "Hide amount on PDF"}
            onSelect={() => {
              onToggleHideAmountOnPdf?.();
              closeMenu();
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
              closeMenu();
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

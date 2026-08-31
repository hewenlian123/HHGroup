"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  Copy,
  Eye,
  EyeOff,
  MoreVertical,
  MoveRight,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/base/confirm-dialog";
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
  currentSectionCode?: string;
  moveSectionOptions?: Array<{ code: string; label: string }>;
  onMoveToSection?: (costCode: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reorderDisabled?: boolean;
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
  currentSectionCode,
  moveSectionOptions = [],
  onMoveToSection,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  reorderDisabled = false,
}: EstimateLineItemMoreMenuProps): React.ReactElement | null {
  const [open, setOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const suppressCloseAutoFocusRef = React.useRef(false);
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
  const moveTargets = moveSectionOptions.filter((option) => option.code !== currentSectionCode);
  const hasMove = Boolean(onMoveToSection) && moveTargets.length > 0;
  const hasReorder = Boolean(onMoveUp) || Boolean(onMoveDown);
  if (
    !showDuplicate &&
    !showDelete &&
    !hasHide &&
    !hasStatus &&
    !hasSave &&
    !hasMove &&
    !hasReorder
  )
    return null;
  if (!onDuplicate && !onDelete && !hasHide && !hasStatus && !hasSave && !hasMove && !hasReorder)
    return null;

  return (
    <>
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
        <DropdownMenuContent
          align="end"
          className={cn(EB.lineItemMoreMenu, EB.commandMenu)}
          onCloseAutoFocus={(event) => {
            if (!suppressCloseAutoFocusRef.current) return;
            event.preventDefault();
            suppressCloseAutoFocusRef.current = false;
          }}
        >
          {onMoveUp ? (
            <DropdownMenuItem
              className={EB.lineItemMoreMenuItem}
              disabled={disabled || reorderDisabled || !canMoveUp}
              aria-label="Move line item up"
              onSelect={() => {
                onMoveUp();
                closeMenu();
              }}
            >
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Move up
            </DropdownMenuItem>
          ) : null}
          {onMoveDown ? (
            <DropdownMenuItem
              className={EB.lineItemMoreMenuItem}
              disabled={disabled || reorderDisabled || !canMoveDown}
              aria-label="Move line item down"
              onSelect={() => {
                onMoveDown();
                closeMenu();
              }}
            >
              <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Move down
            </DropdownMenuItem>
          ) : null}
          {showDuplicate && onDuplicate ? (
            <DropdownMenuItem
              className={EB.lineItemMoreMenuItem}
              disabled={disabled}
              aria-label="Duplicate line item"
              onSelect={() => {
                suppressCloseAutoFocusRef.current = true;
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
          {hasMove ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className={EB.lineItemMoreMenuItem}
                disabled={disabled || reorderDisabled}
                aria-label="Move to section"
              >
                <MoveRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Move to section
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={cn(EB.lineItemMoreMenu, EB.commandMenu)}>
                {moveTargets.map((option) => (
                  <DropdownMenuItem
                    key={option.code}
                    className={EB.lineItemMoreMenuItem}
                    disabled={disabled || reorderDisabled}
                    onSelect={() => {
                      suppressCloseAutoFocusRef.current = true;
                      onMoveToSection?.(option.code);
                      closeMenu();
                    }}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
                suppressCloseAutoFocusRef.current = true;
                setDeleteConfirmOpen(true);
                closeMenu();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete line item?"
        description="This removes the line from the Estimate and updates its totals."
        confirmLabel="Delete"
        destructive
        onConfirm={() => onDelete?.()}
      />
    </>
  );
}

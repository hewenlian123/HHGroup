"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ebInput } from "./estimate-builder-ui";
import { formatEstimateCurrency } from "./estimate-currency";
import type { EditorLineItem } from "./estimate-line-item-model";
import { editorLineTotal } from "./estimate-line-item-model";

export type EstimateLineItemMobileCardProps = {
  item: EditorLineItem;
  /** 1-based index for test aria-labels */
  rowIndex: number;
  readOnly?: boolean;
  disabled?: boolean;
  submitAttempted?: boolean;
  isLastRow?: boolean;
  onChange: (patch: Partial<EditorLineItem>) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onEnterAddNext?: () => void;
  onOpenDetails?: () => void;
  onBlurField?: () => void;
};

export function EstimateLineItemMobileCard({
  item,
  rowIndex,
  readOnly = false,
  disabled = false,
  submitAttempted = false,
  isLastRow = false,
  onChange,
  onDuplicate,
  onDelete,
  onEnterAddNext,
  onOpenDetails,
  onBlurField,
}: EstimateLineItemMobileCardProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  const total = editorLineTotal(item);
  const titleInvalid = submitAttempted && !item.title.trim() && !item.description.trim();

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (isLastRow && onEnterAddNext) {
      e.preventDefault();
      onEnterAddNext();
    }
  };

  return (
    <article
      className={cn(
        "rounded-sm border border-border/35 bg-background",
        expanded && "border-border/50"
      )}
    >
      <button
        type="button"
        className="flex w-full min-h-11 items-start justify-between gap-3 p-3 text-left touch-manipulation"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-foreground line-clamp-2">
            {item.title.trim() || "Untitled line"}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {item.qty} × {formatEstimateCurrency(item.unitPrice)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatEstimateCurrency(total)}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
            aria-hidden
          />
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border/30 px-3 pb-3 pt-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground/70">Description</Label>
            {readOnly ? (
              <p className="text-sm text-foreground">{item.title || "—"}</p>
            ) : (
              <Input
                value={item.title}
                onChange={(e) => onChange({ title: e.target.value })}
                onBlur={onBlurField}
                onKeyDown={handleEnter}
                className={ebInput("min-h-11 font-medium")}
                placeholder="Description"
                aria-label={`Line item ${rowIndex} title`}
                aria-invalid={titleInvalid}
                disabled={disabled}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground/70">Qty</Label>
              {readOnly ? (
                <p className="text-sm tabular-nums">{item.qty}</p>
              ) : (
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={item.qty}
                  onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })}
                  onBlur={onBlurField}
                  onKeyDown={handleEnter}
                  className={ebInput("min-h-11 text-muted-foreground")}
                  aria-label={`Line item ${rowIndex} quantity`}
                  disabled={disabled}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground/70">Unit price</Label>
              {readOnly ? (
                <p className="text-sm tabular-nums text-right">
                  {formatEstimateCurrency(item.unitPrice)}
                </p>
              ) : (
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unitPrice}
                  onChange={(e) => onChange({ unitPrice: Number(e.target.value) || 0 })}
                  onBlur={onBlurField}
                  onKeyDown={handleEnter}
                  className={ebInput("min-h-11 text-muted-foreground")}
                  aria-label={`Line item ${rowIndex} unit price`}
                  disabled={disabled}
                />
              )}
            </div>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Advanced
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Unit</Label>
                {readOnly ? (
                  <p className="text-sm">{item.unit}</p>
                ) : (
                  <Input
                    value={item.unit}
                    onChange={(e) => onChange({ unit: e.target.value })}
                    onBlur={onBlurField}
                    className="min-h-11"
                    disabled={disabled}
                    aria-label={`Line item ${rowIndex} unit`}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Category</Label>
                <p className="pt-2 text-sm text-muted-foreground">{item.costCode}</p>
              </div>
            </div>
          </details>
          {onOpenDetails ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-0 text-muted-foreground"
              onClick={onOpenDetails}
            >
              Edit long description
            </Button>
          ) : null}
          {!readOnly && (onDuplicate || onDelete) ? (
            <div className="flex gap-2 pt-1">
              {onDuplicate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 rounded-sm"
                  onClick={onDuplicate}
                  disabled={disabled}
                  aria-label="Duplicate line item"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Duplicate
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 rounded-sm text-destructive"
                  onClick={onDelete}
                  disabled={disabled}
                  aria-label="Remove line item"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

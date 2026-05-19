"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EB, ebInput } from "./estimate-builder-ui";
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
  const [detailsOpen, setDetailsOpen] = React.useState(() => Boolean(item.description.trim()));
  const total = editorLineTotal(item);
  const showUnitInline = Boolean(item.unit.trim()) && item.unit.trim() !== "EA";

  React.useEffect(() => {
    if (item.description.trim()) setDetailsOpen(true);
  }, [item.id, item.description]);

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
        "group/line rounded-sm border border-border/20 bg-background transition-colors hover:border-border/30 hover:bg-muted/[0.02]",
        expanded && "border-border/35 bg-muted/[0.015]"
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
            {showUnitInline ? ` · ${item.unit}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-base font-semibold tabular-nums tracking-tight text-foreground">
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
          {readOnly ? (
            <p className="text-sm font-medium text-foreground">{item.title || "—"}</p>
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
          <div className="grid grid-cols-2 gap-2">
            {readOnly ? (
              <>
                <p className="text-sm tabular-nums text-muted-foreground">{item.qty}</p>
                <p className="text-sm tabular-nums text-right text-muted-foreground">
                  {formatEstimateCurrency(item.unitPrice)}
                </p>
              </>
            ) : (
              <>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={item.qty}
                  onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })}
                  onBlur={onBlurField}
                  onKeyDown={handleEnter}
                  className={ebInput(`min-h-11 ${EB.inputMuted}`)}
                  placeholder="Qty"
                  aria-label={`Line item ${rowIndex} quantity`}
                  disabled={disabled}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unitPrice}
                  onChange={(e) => onChange({ unitPrice: Number(e.target.value) || 0 })}
                  onBlur={onBlurField}
                  onKeyDown={handleEnter}
                  className={ebInput(`min-h-11 ${EB.inputMuted} text-right`)}
                  placeholder="Unit price"
                  aria-label={`Line item ${rowIndex} unit price`}
                  disabled={disabled}
                />
              </>
            )}
          </div>
          {!readOnly ? (
            <div className="space-y-2">
              <div className="flex min-h-[1.25rem] flex-wrap items-center gap-x-3">
                <button
                  type="button"
                  className={cn(
                    EB.lineDetailsLink,
                    "opacity-100 md:opacity-0 md:group-hover/line:opacity-100"
                  )}
                  onClick={() => {
                    if (onOpenDetails) onOpenDetails();
                    else setDetailsOpen(true);
                  }}
                >
                  {item.description.trim() ? "Edit details" : "Add details"}
                </button>
                {showUnitInline ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/45">
                    <span className="sr-only">Unit</span>
                    <Input
                      value={item.unit}
                      onChange={(e) => onChange({ unit: e.target.value })}
                      onBlur={onBlurField}
                      className={ebInput("h-8 w-14 px-1.5 text-xs")}
                      placeholder="Unit"
                      disabled={disabled}
                      aria-label={`Line item ${rowIndex} unit`}
                    />
                  </span>
                ) : null}
              </div>
              {!onOpenDetails && detailsOpen ? (
                <textarea
                  value={item.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  onBlur={onBlurField}
                  placeholder="Notes (optional)"
                  rows={2}
                  disabled={disabled}
                  className="min-h-[52px] w-full resize-none bg-transparent text-sm text-muted-foreground/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
                  aria-label={`Line item ${rowIndex} notes`}
                />
              ) : null}
            </div>
          ) : null}
          {!readOnly && (onDuplicate || onDelete) ? (
            <div className="flex items-center gap-1 pt-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-sm text-muted-foreground/50"
                    aria-label="Line item options"
                    disabled={disabled}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36 p-2">
                  <Label
                    htmlFor={`line-${item.id}-unit`}
                    className="text-[10px] text-muted-foreground/60"
                  >
                    Unit
                  </Label>
                  <Input
                    id={`line-${item.id}-unit`}
                    value={item.unit}
                    onChange={(e) => onChange({ unit: e.target.value })}
                    onBlur={onBlurField}
                    className={ebInput("mt-1 h-8 w-full text-xs")}
                    placeholder="EA"
                    disabled={disabled}
                    aria-label={`Line item ${rowIndex} unit`}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              {onDuplicate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10 flex-1 rounded-sm text-muted-foreground"
                  onClick={onDuplicate}
                  disabled={disabled}
                  aria-label="Duplicate line item"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Duplicate
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10 flex-1 rounded-sm text-muted-foreground/70 hover:text-destructive"
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

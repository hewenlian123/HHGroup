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
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { EB, ebInput } from "./estimate-builder-ui";
import { formatEstimateCurrency } from "./estimate-currency";
import type { EditorLineItem } from "./estimate-line-item-model";
import { editorLineTotal } from "./estimate-line-item-model";
import { EstimateLineItemMoreMenu } from "./estimate-line-item-more-menu";
import { ProposalScopeWorkCard } from "./proposal-scope-work-card";
import { DEFAULT_LINE_ITEM_STATUS, type EstimateLineItemStatus } from "./estimate-line-item-status";
import { EstimateLineItemStatusPill } from "./estimate-line-item-status-pill";

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
  onToggleHideAmountOnPdf?: () => void;
  onSetStatus?: (status: EstimateLineItemStatus) => void;
  onSaveAsReusable?: () => void;
  onEnterAddNext?: () => void;
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
  onToggleHideAmountOnPdf,
  onSetStatus,
  onSaveAsReusable,
  onEnterAddNext,
  onBlurField,
}: EstimateLineItemMobileCardProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const total = editorLineTotal(item);
  const showUnitInline = Boolean(item.unit.trim()) && item.unit.trim() !== "EA";
  const titleInvalid = submitAttempted && !item.title.trim();

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (isLastRow && onEnterAddNext) {
      e.preventDefault();
      onEnterAddNext();
    }
  };

  if (readOnly) {
    return (
      <article className="mb-3">
        <ProposalScopeWorkCard
          readOnly
          title={item.title}
          description={item.description}
          className="border border-white/[0.08]"
        />
      </article>
    );
  }

  return (
    <article className="mb-3">
      <button
        type="button"
        className={cn(
          "flex w-full min-h-11 items-start justify-between gap-3 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-3 text-left transition-colors",
          "hover:border-white/[0.11] hover:bg-white/[0.04] touch-manipulation"
        )}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Hide details" : "Add details"}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 text-[15px] font-semibold leading-snug tracking-tight text-zinc-50 line-clamp-2">
              {item.title.trim() || "Untitled"}
            </p>
            <EstimateLineItemStatusPill status={item.status ?? DEFAULT_LINE_ITEM_STATUS} />
          </div>
          <p className="text-[11px] text-zinc-500 tabular-nums">
            {item.qty} × {formatEstimateCurrency(item.unitPrice)}
            {showUnitInline ? ` · ${item.unit}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!open ? (
            <span className="text-sm font-semibold tabular-nums tracking-tight text-zinc-100">
              {formatEstimateCurrency(total)}
            </span>
          ) : null}
          <ChevronDown
            className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </div>
      </button>

      {open ? (
        <div className="-mt-px overflow-hidden rounded-b-md border border-t-0 border-white/[0.08] bg-white/[0.02]">
          <ProposalScopeWorkCard
            className="rounded-none border-0 bg-transparent shadow-none hover:bg-transparent"
            title={item.title}
            description={item.description}
            disabled={disabled}
            onTitleChange={(v) => onChange({ title: v })}
            onDescriptionChange={(v) => onChange({ description: v })}
            onTitleBlur={onBlurField}
            onDescriptionBlur={onBlurField}
            titleInvalid={titleInvalid}
            titleInputAriaLabel={`Line item ${rowIndex} title`}
            descriptionEditorAriaLabel={`Line item ${rowIndex} description`}
            titleTrailingSlot={
              <EstimateLineItemStatusPill status={item.status ?? DEFAULT_LINE_ITEM_STATUS} />
            }
            footer={
              <div className="space-y-3 px-3 pb-3 pt-3">
                <div className="grid grid-cols-2 gap-2">
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
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
                  <EstimateLineItemMoreMenu
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    hideAmountOnPdf={item.hideAmountOnPdf}
                    onToggleHideAmountOnPdf={onToggleHideAmountOnPdf}
                    showHideAmountOnPdf={Boolean(onToggleHideAmountOnPdf)}
                    showSetStatus={Boolean(onSetStatus)}
                    currentStatus={item.status ?? DEFAULT_LINE_ITEM_STATUS}
                    onSetStatus={onSetStatus}
                    showSaveAsReusable={Boolean(onSaveAsReusable)}
                    onSaveAsReusable={onSaveAsReusable}
                    disabled={disabled}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-sm text-zinc-500"
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
                  {showUnitInline ? (
                    <span className="text-[11px] text-zinc-500">
                      Unit: <span className="tabular-nums text-zinc-400">{item.unit}</span>
                    </span>
                  ) : null}
                  <span className="ml-auto text-sm font-semibold tabular-nums text-zinc-200">
                    {formatEstimateCurrency(total)}
                  </span>
                </div>
              </div>
            }
          />
        </div>
      ) : null}
    </article>
  );
}

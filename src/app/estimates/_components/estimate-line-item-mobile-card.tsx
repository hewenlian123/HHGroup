"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, EyeOff } from "lucide-react";
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
  currentSectionCode?: string;
  moveSectionOptions?: Array<{ code: string; label: string }>;
  onMoveToSection?: (costCode: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reorderDisabled?: boolean;
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
  currentSectionCode,
  moveSectionOptions,
  onMoveToSection,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  reorderDisabled,
}: EstimateLineItemMobileCardProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const total = editorLineTotal(item);
  const titleInvalid = submitAttempted && !item.title.trim();
  const summaryTitle = item.title.trim() || "Untitled";

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
          className="border border-border bg-background"
        />
      </article>
    );
  }

  return (
    <article className="mb-3">
      <div
        className={cn(
          "eb-line-item-mobile-shell flex min-h-11 w-full items-start rounded-md border border-border bg-background",
          "hover:border-foreground/20 hover:bg-muted/40",
          open && "rounded-b-none bg-muted/40"
        )}
      >
        <button
          type="button"
          className="eb-line-item-mobile-summary flex min-h-11 min-w-0 flex-1 touch-manipulation items-start justify-between gap-3 rounded-md border-0 bg-transparent px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Edit"} line item ${rowIndex}: ${summaryTitle}`}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="min-w-0 text-hh-section-title font-semibold leading-snug tracking-normal text-foreground line-clamp-2">
                {summaryTitle}
              </p>
              <EstimateLineItemStatusPill status={item.status ?? DEFAULT_LINE_ITEM_STATUS} />
              {item.hideAmountOnPdf ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/55 px-1.5 py-0.5 text-hh-status font-medium text-muted-foreground"
                  aria-label="PDF amount hidden"
                >
                  <EyeOff className="h-3 w-3" aria-hidden />
                  PDF hidden
                </span>
              ) : null}
            </div>
            <p className="text-hh-status text-muted-foreground tabular-nums">
              {item.qty} {item.unit.trim() || "EA"} × {formatEstimateCurrency(item.unitPrice)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold tabular-nums tracking-normal text-foreground">
              {formatEstimateCurrency(total)}
            </span>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground", open && "rotate-180")}
              aria-hidden
            />
          </div>
        </button>
        <div className="shrink-0 px-1.5 pt-2">
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
            currentSectionCode={currentSectionCode}
            moveSectionOptions={moveSectionOptions}
            onMoveToSection={onMoveToSection}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            reorderDisabled={reorderDisabled}
            disabled={disabled}
          />
        </div>
      </div>

      {open ? (
        <div className="eb-line-item-mobile-details -mt-px overflow-hidden rounded-b-md border border-t-0 border-border bg-background">
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
              <div className="flex flex-wrap items-center gap-1.5">
                <EstimateLineItemStatusPill status={item.status ?? DEFAULT_LINE_ITEM_STATUS} />
                {item.hideAmountOnPdf ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/55 px-1.5 py-0.5 text-hh-status font-medium text-muted-foreground"
                    aria-label="PDF amount hidden"
                  >
                    <EyeOff className="h-3 w-3" aria-hidden />
                    PDF hidden
                  </span>
                ) : null}
              </div>
            }
            footer={
              <div className="space-y-3 px-3 pb-3 pt-3">
                <div className="eb-line-item-mobile-measure-group grid grid-cols-2 gap-2">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={EB.readLabel}>Qty</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      inputMode="decimal"
                      value={item.qty}
                      onChange={(e) => onChange({ qty: Math.max(0, Number(e.target.value) || 0) })}
                      onBlur={onBlurField}
                      onWheel={(event) => event.currentTarget.blur()}
                      className={ebInput(`min-h-11 ${EB.inputMuted}`)}
                      aria-label={`Line item ${rowIndex} quantity`}
                      disabled={disabled}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={EB.readLabel}>Unit</span>
                    <Input
                      type="text"
                      value={item.unit}
                      onChange={(e) => onChange({ unit: e.target.value })}
                      onBlur={onBlurField}
                      className={ebInput(`min-h-11 ${EB.inputMuted}`)}
                      aria-label={`Line item ${rowIndex} unit`}
                      disabled={disabled}
                    />
                  </label>
                </div>
                <div className="eb-line-item-mobile-money-group grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-border pt-3">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={EB.readLabel}>Unit price</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      inputMode="decimal"
                      value={item.unitPrice}
                      onChange={(e) =>
                        onChange({ unitPrice: Math.max(0, Number(e.target.value) || 0) })
                      }
                      onBlur={onBlurField}
                      onKeyDown={handleEnter}
                      onWheel={(event) => event.currentTarget.blur()}
                      className={ebInput(`min-h-11 ${EB.inputMuted} text-right`)}
                      aria-label={`Line item ${rowIndex} unit price`}
                      disabled={disabled}
                    />
                  </label>
                  <span className="min-w-[6rem] text-right">
                    <span className={cn(EB.readLabel, "block")}>Line total</span>
                    <span className="mt-2 block min-h-11 py-3 text-sm font-semibold tabular-nums text-foreground">
                      {formatEstimateCurrency(total)}
                    </span>
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

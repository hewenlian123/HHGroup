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
          className="border border-border bg-background"
        />
      </article>
    );
  }

  return (
    <article className="mb-3">
      <button
        type="button"
        className={cn(
          "eb-line-item-mobile-summary flex min-h-11 w-full items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors",
          "touch-manipulation hover:border-foreground/20 hover:bg-muted/40"
        )}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Hide details" : "Add details"}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 text-hh-section-title font-semibold leading-snug tracking-normal text-foreground line-clamp-2">
              {item.title.trim() || "Untitled"}
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
            {item.qty} × {formatEstimateCurrency(item.unitPrice)}
            {showUnitInline ? ` · ${item.unit}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!open ? (
            <span className="text-sm font-semibold tabular-nums tracking-normal text-foreground">
              {formatEstimateCurrency(total)}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </div>
      </button>

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
                <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
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
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={cn(EB.readLabel, "text-right")}>Unit price</span>
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
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
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
                    disabled={disabled}
                  />
                  {showUnitInline ? (
                    <span className="text-hh-status text-muted-foreground">
                      Unit: <span className="tabular-nums text-foreground">{item.unit}</span>
                    </span>
                  ) : null}
                  <span className="ml-auto text-right">
                    <span className={cn(EB.readLabel, "block")}>Line total</span>
                    <span className="mt-1 block text-sm font-semibold tabular-nums text-foreground">
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

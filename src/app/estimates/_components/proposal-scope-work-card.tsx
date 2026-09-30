"use client";

import * as React from "react";
import { EstimateStitchInspectorContext } from "./estimate-stitch-inspector";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  lineItemBodyLooksLikeHtml,
  sanitizeLineItemDescriptionHtml,
} from "@/lib/sanitize-line-item-html";
import { EstimateDescriptionEditor } from "./estimate-description-editor";
import { EB, ebInput } from "./estimate-builder-ui";

function descriptionSummaryText(body: string): string {
  const source = lineItemBodyLooksLikeHtml(body)
    ? sanitizeLineItemDescriptionHtml(body)
        .replace(/<\s*li\b[^>]*>/gi, " • ")
        .replace(/<\s*br\s*\/?\s*>/gi, " ")
        .replace(/<\s*\/\s*(?:p|div|li|ul|ol)\s*>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
    : body;

  return source
    .replace(/[\r\n\t\u2028]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ProposalScopeWorkCardProps = {
  /** Customer-facing line / room name */
  title: string;
  /** Proposal scope: HTML or plain storage */
  description: string;
  readOnly?: boolean;
  disabled?: boolean;
  onTitleChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
  onTitleBlur?: () => void;
  onDescriptionBlur?: (normalizedValue: string) => void;
  /** When true, show validation hint under title */
  titleInvalid?: boolean;
  titlePlaceholder?: string;
  titleInputAriaLabel?: string;
  descriptionEditorAriaLabel?: string;
  /** Optional drag handle (persisted reorder) */
  dragSlot?: React.ReactNode;
  /** Duplicate control — button or form submit */
  duplicateNode?: React.ReactNode;
  /** Delete control */
  deleteNode?: React.ReactNode;
  /** Optional footer (e.g. mobile pricing strip) */
  footer?: React.ReactNode;
  /** Qty / unit price / total beside title (proposal-style inline row) */
  inlinePricing?: React.ReactNode;
  rowActions?: React.ReactNode;
  /** Optional 1-based line index badge */
  lineIndex?: number;
  /** Unified index + title + pricing + description grid (/estimates/new) */
  lineItemGridLayout?: boolean;
  /** Status pill or other chips beside title */
  titleTrailingSlot?: React.ReactNode;
  lineSubtotal?: number;
  persistedLineSubtotal?: number;
  pricingSummary?: { qty: number; unit: string; unitPrice: string; total: string };
  className?: string;
};

/**
 * Compact proposal scope block: title row with optional inline pricing,
 * content-driven description editor, and light format toolbar.
 */
export function ProposalScopeWorkCard({
  title,
  description,
  readOnly = false,
  disabled = false,
  onTitleChange,
  onDescriptionChange,
  onTitleBlur,
  onDescriptionBlur,
  titleInvalid = false,
  titlePlaceholder = "Item Name",
  titleInputAriaLabel,
  descriptionEditorAriaLabel,
  dragSlot,
  duplicateNode,
  deleteNode,
  footer,
  inlinePricing,
  rowActions,
  lineIndex,
  lineItemGridLayout = false,
  titleTrailingSlot,
  pricingSummary,
  lineSubtotal,
  persistedLineSubtotal,
  className,
}: ProposalScopeWorkCardProps): React.ReactElement {
  const inspector = React.useContext(EstimateStitchInspectorContext);
  const inspectorId = React.useId();
  const rowRef = React.useRef<HTMLDivElement>(null);
  const selected = inspector?.selected === inspectorId;
  const selectRow = () => inspector?.select(inspectorId);
  const select = inspector?.select;
  const setPricing = inspector?.setPricing;
  const openingSubtotalRef = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    if (!selected || lineSubtotal == null) {
      openingSubtotalRef.current = null;
      return;
    }
    openingSubtotalRef.current ??= lineSubtotal;
    setPricing?.({
      id: inspectorId,
      subtotal: lineSubtotal,
      impact: lineSubtotal - openingSubtotalRef.current,
      adjustment: persistedLineSubtotal == null ? 0 : lineSubtotal - persistedLineSubtotal,
    });
    return () => setPricing?.((current) => (current?.id === inspectorId ? null : current));
  }, [selected, lineSubtotal, persistedLineSubtotal, inspectorId, setPricing]);
  React.useEffect(
    () => () => {
      select?.((current) => (current === inspectorId ? null : current));
    },
    [inspectorId, select]
  );
  React.useLayoutEffect(() => {
    if (selected && rowRef.current?.closest('[inert], [aria-hidden="true"]')) {
      select?.((current) => (current === inspectorId ? null : current));
    }
  });
  const titleChangedSinceFocusRef = React.useRef(false);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const showDragRow = Boolean(dragSlot);
  const showLineItemActions = !readOnly && (Boolean(duplicateNode) || Boolean(deleteNode));

  const useLineItemGrid = lineItemGridLayout && Boolean(inlinePricing);

  const TitleControl = Input;
  const titleField = readOnly ? (
    <p className="text-hh-body font-semibold leading-snug tracking-normal text-foreground">
      {title.trim() || "—"}
    </p>
  ) : (
    <TitleControl
      value={title}
      onFocus={() => {
        titleChangedSinceFocusRef.current = false;
      }}
      onChange={(e) => {
        titleChangedSinceFocusRef.current = true;
        onTitleChange?.(e.target.value);
      }}
      onBlur={() => {
        if (!titleChangedSinceFocusRef.current) return;
        titleChangedSinceFocusRef.current = false;
        onTitleBlur?.();
      }}
      onKeyDown={(event) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.nativeEvent.isComposing
        )
          return;
        const next = editorRef.current;
        if (!next) return;
        event.preventDefault();
        next.focus();
      }}
      disabled={disabled}
      placeholder={titlePlaceholder}
      aria-label={titleInputAriaLabel}
      aria-invalid={titleInvalid}
      className={ebInput(
        "text-hh-body font-medium leading-[1.4] tracking-normal text-foreground placeholder:text-muted-foreground"
      )}
    />
  );

  const descriptionSummary = descriptionSummaryText(description);
  const descriptionBlock = (
    <div
      className={cn(EB.lineItemDescriptionBlock, !useLineItemGrid && "pt-1.5")}
      data-description-empty={!descriptionSummary || undefined}
    >
      <span className={cn(EB.readLabel, "block pb-1")}>Description</span>
      <EstimateDescriptionEditor
        body={description}
        label={descriptionEditorAriaLabel}
        disabled={disabled}
        readOnly={readOnly}
        editorRef={editorRef}
        bodyClassName="proposal-scope-inline-editor"
        onChange={onDescriptionChange}
        onBlur={onDescriptionBlur}
      />
    </div>
  );

  const card = (
    <div
      className={cn(
        "eb-proposal-scope-work-card rounded-sm border-0 bg-transparent px-0 pb-0 pt-0 shadow-none backdrop-blur-none",
        className
      )}
      onClick={(event) => {
        if (
          !inspector ||
          !useLineItemGrid ||
          disabled ||
          !event.currentTarget.contains(event.target as Node)
        )
          return;
        if (
          (event.target as HTMLElement).closest(
            'button, input, select, textarea, a, [role="button"], [contenteditable], [draggable="true"]'
          )
        )
          return;
        selectRow();
      }}
    >
      {showDragRow && !useLineItemGrid ? (
        <div className={cn(EB.lineItemDragRow, "flex items-center px-1 pt-0.5")}>
          <div className="shrink-0">{dragSlot}</div>
        </div>
      ) : null}

      {useLineItemGrid ? (
        <div className={cn(EB.lineItemGridPricing, showDragRow ? "pt-0" : "pt-1")}>
          <div className={EB.lineItemItemCell}>
            <div className="eb-line-item-index-control">
              {lineIndex != null ? (
                <span className={EB.lineIndexBadge} aria-label={`Line ${lineIndex}`}>
                  #{lineIndex}
                </span>
              ) : null}
              {showDragRow ? <span className="eb-line-item-inline-drag">{dragSlot}</span> : null}
            </div>
            <span className={cn(EB.readLabel, EB.lineTitleLabel)}>Item</span>
            <div className={cn(EB.lineTitleInputWrap, EB.lineItemTitleField)}>
              <div className="eb-line-item-title-control flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">{titleField}</div>
                {titleTrailingSlot ? (
                  <div className="eb-line-item-title-meta">{titleTrailingSlot}</div>
                ) : null}
              </div>
              {titleInvalid ? (
                <p className="text-hh-error text-[var(--hh-warning)]">Add a name for this line.</p>
              ) : null}
            </div>
          </div>
          {descriptionBlock}
          <div className={EB.lineItemPricingWrap}>{inlinePricing}</div>
        </div>
      ) : (
        <>
          <div
            className={cn(
              inlinePricing ? EB.lineItemFirstRowPricing : EB.lineItemFirstRow,
              lineIndex == null && "eb-line-item-first-row--no-index",
              showDragRow ? "pt-0" : "pt-1"
            )}
          >
            {lineIndex != null ? (
              <span className={EB.lineIndexBadge} aria-label={`Line ${lineIndex}`}>
                #{lineIndex}
              </span>
            ) : null}
            <div className={cn(EB.lineFieldStack, EB.lineItemTitleField)}>
              <span className={EB.readLabel}>Title</span>
              <div className="eb-line-item-title-control flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">{titleField}</div>
                {titleTrailingSlot ? (
                  <div className="eb-line-item-title-meta">{titleTrailingSlot}</div>
                ) : null}
              </div>
              {titleInvalid ? (
                <p className="text-hh-error text-[var(--hh-warning)]">Add a name for this line.</p>
              ) : null}
            </div>
            {inlinePricing ? <div className={EB.lineItemPricingWrap}>{inlinePricing}</div> : null}
          </div>
          {descriptionBlock}
        </>
      )}

      {!useLineItemGrid && showLineItemActions ? (
        <div className={EB.lineItemActionsBar}>
          <div className={EB.lineItemActionsInner}>
            {duplicateNode ? <span className="inline-flex">{duplicateNode}</span> : null}
            {deleteNode ? <span className="inline-flex">{deleteNode}</span> : null}
          </div>
        </div>
      ) : null}

      {footer ? <div className="border-t border-border bg-transparent">{footer}</div> : null}
    </div>
  );
  if (!inspector || !useLineItemGrid || !pricingSummary) return card;
  return (
    <>
      {!readOnly ? (
        <div
          ref={rowRef}
          className="estimate-stitch-data-row estimate-inline-row"
          onClick={selectRow}
          data-stitch-selected={selected || undefined}
          onFocusCapture={() => {
            inspector.select(inspectorId);
          }}
          onKeyDown={(event) => {
            if (
              event.defaultPrevented ||
              event.nativeEvent.isComposing ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            const fields = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'input:not(:disabled), [contenteditable="true"]'
              )
            );
            const index = fields.indexOf(event.target as HTMLElement);
            if (index < 0) return;
            const step = event.shiftKey ? -1 : 1;
            if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
              const next = fields[index + step];
              if (next) {
                event.preventDefault();
                next.focus();
                if (next instanceof HTMLInputElement) next.select();
              }
            }
          }}
        >
          <span className="estimate-stitch-row-drag">{dragSlot}</span>
          <div className="estimate-inline-description">
            {titleField}
            {descriptionBlock}
          </div>
          <div className="estimate-inline-pricing">{inlinePricing}</div>
          <span className="estimate-stitch-row-actions estimate-inline-actions">{rowActions}</span>
        </div>
      ) : (
        <div
          ref={rowRef}
          className="estimate-stitch-data-row"
          data-stitch-selected={selected || undefined}
          onClick={(event) => {
            if (
              disabled ||
              !event.currentTarget.contains(event.target as Node) ||
              (event.target as HTMLElement).closest("button, a, input, [role=menuitem]")
            )
              return;
            selectRow();
          }}
        >
          <span className="estimate-stitch-row-drag">{dragSlot}</span>
          <div className="estimate-inline-description">
            <button
              type="button"
              onClick={selectRow}
              aria-label={`Select line ${lineIndex ?? "item"}`}
              aria-pressed={selected}
              disabled={disabled}
            >
              <strong>{title || "New line item"}</strong>
              {titleTrailingSlot}
            </button>
            {descriptionBlock}
          </div>
          {pricingSummary ? (
            <div className="estimate-stitch-selected-pricing" aria-label="Selected line pricing">
              <span>{pricingSummary.qty}</span>
              <span>{pricingSummary.unit}</span>
              <span>{pricingSummary.unitPrice}</span>
              <strong>{pricingSummary.total}</strong>
            </div>
          ) : null}
          <span className="estimate-stitch-row-actions">{rowActions}</span>
        </div>
      )}
    </>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { NeoFieldLabel, NeoInput } from "@/components/base";
import { Button } from "@/components/ui/button";
import { decimalDraftFromNumber, nextDecimalDraft, parseDecimalDraft } from "@/lib/decimal-draft";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { lineExtension } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  invoiceLineHasContent,
  type InvoiceLineDraft,
} from "@/app/financial/invoices/_components/invoice-line-draft";

const compactFieldClass =
  "h-11 rounded-hh-standard border-[var(--hh-line-cell)] bg-[var(--hh-surface)] px-2 text-right text-[13px] tabular-nums text-[var(--hh-ink)] xl:h-9";

export function DecimalDraftField({
  value,
  onValue,
  className,
  ...props
}: {
  value: string;
  onValue: (next: string) => void;
} & Omit<React.ComponentProps<typeof NeoInput>, "value" | "onChange" | "type">) {
  return (
    <NeoInput
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onValue(nextDecimalDraft(value, event.target.value))}
      onBlur={() => {
        if (value.trim() === "" || value === ".") {
          onValue("0");
          return;
        }
        onValue(decimalDraftFromNumber(parseDecimalDraft(value)));
      }}
      className={className}
      {...props}
    />
  );
}

function AutoResizeTextarea({
  className = "",
  value,
  onChange,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  const resize = React.useCallback((node: HTMLTextAreaElement | null) => {
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(() => {
    resize(ref.current);
  }, [resize, value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => {
        onChange?.(event);
        resize(event.currentTarget);
      }}
      className={cn(
        "block min-h-11 w-full resize-none overflow-hidden bg-transparent px-0 py-1 text-[13px] leading-5 text-[var(--hh-text)] placeholder:text-[var(--hh-placeholder)] focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

export function InvoiceLineList({
  lines,
  idPrefix,
  subtotal,
  saving,
  submitAttempted,
  onChange,
  onAdd,
  onRemove,
}: {
  lines: InvoiceLineDraft[];
  idPrefix: "invoice-new" | "invoice-edit";
  subtotal: number;
  saving: boolean;
  submitAttempted: boolean;
  onChange: (index: number, patch: Partial<InvoiceLineDraft>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const missingLine = submitAttempted && !lines.some(invoiceLineHasContent);

  return (
    <section className="overflow-hidden rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--hh-line-2)] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-title-card text-[var(--hh-ink)]">Line items</h2>
          <p className="mt-0.5 text-hh-metadata text-[var(--hh-muted)]">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
            Subtotal
          </span>
          <span className="text-num-m tabular-nums text-[var(--hh-ink)]">
            {formatOverviewMoney(subtotal)}
          </span>
        </p>
      </header>

      {missingLine ? (
        <p className="invoice-new-error-text px-4 pt-3 text-hh-metadata font-medium text-[var(--hh-danger)] sm:px-5">
          At least one line item is required.
        </p>
      ) : null}

      <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem_2.75rem] gap-2 border-b border-[var(--hh-line-2)] bg-[var(--hh-surface-sunken)] px-5 py-2 text-hh-label font-[650] uppercase text-[var(--hh-th)] xl:grid">
        <span>Item & description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span className="text-right">Amount</span>
        <span className="sr-only">Remove</span>
      </div>

      <div>
        {lines.map((line, index) => {
          const amount = lineExtension(
            parseDecimalDraft(line.qty),
            parseDecimalDraft(line.unitPrice)
          );
          const invalidLine = submitAttempted && !invoiceLineHasContent(line);
          const lineNumber = index + 1;

          return (
            <div
              key={`${idPrefix}-line-${lineNumber}`}
              className={cn(
                "invoice-new-line-card grid gap-3 border-b border-[var(--hh-line-2)] px-4 py-3 xl:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem_2.75rem] xl:items-start xl:px-5",
                invalidLine && "bg-[var(--hh-danger-soft-fill)]"
              )}
            >
              <div className="min-w-0">
                <NeoInput
                  data-testid={`${idPrefix}-line-${lineNumber}-item-input`}
                  value={line.itemName}
                  onChange={(event) => onChange(index, { itemName: event.target.value })}
                  placeholder="Item name"
                  aria-label={`Line item ${lineNumber} item name`}
                  aria-invalid={invalidLine}
                  className="h-11 border-transparent bg-transparent px-0 text-[13px] font-medium text-[var(--hh-ink)] placeholder:text-[var(--hh-placeholder)] xl:h-8"
                />
                <AutoResizeTextarea
                  data-testid={`${idPrefix}-line-${lineNumber}-description-input`}
                  value={line.description}
                  onChange={(event) => onChange(index, { description: event.target.value })}
                  placeholder="Describe the scope of work, materials, or service…"
                  aria-label={`Line item ${lineNumber} description`}
                  aria-invalid={invalidLine}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 xl:contents">
                <div>
                  <NeoFieldLabel className="xl:sr-only">Qty</NeoFieldLabel>
                  <DecimalDraftField
                    data-testid={`${idPrefix}-line-${lineNumber}-qty-input`}
                    value={line.qty}
                    onValue={(qty) => onChange(index, { qty })}
                    aria-label={`Line item ${lineNumber} quantity`}
                    className={compactFieldClass}
                  />
                </div>
                <div>
                  <NeoFieldLabel className="xl:sr-only">Unit price</NeoFieldLabel>
                  <DecimalDraftField
                    data-testid={`${idPrefix}-line-${lineNumber}-rate-input`}
                    value={line.unitPrice}
                    onValue={(unitPrice) => onChange(index, { unitPrice })}
                    aria-label={`Line item ${lineNumber} rate`}
                    className={compactFieldClass}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between xl:block xl:pt-2 xl:text-right">
                <span className="text-hh-label font-[650] uppercase text-[var(--hh-muted)] xl:sr-only">
                  Amount
                </span>
                <span className="tabular-nums font-medium text-[var(--hh-ink)]">
                  {formatOverviewMoney(amount)}
                </span>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 justify-self-end text-[var(--hh-muted)] hover:text-[var(--hh-danger)] xl:h-9 xl:w-9"
                aria-label="Remove line item"
                disabled={saving || lines.length <= 1}
                onClick={() => onRemove(index)}
                title="Remove line item"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <button
          type="button"
          onClick={onAdd}
          disabled={saving}
          className="inline-flex min-h-11 items-center gap-2 text-left text-[13px] font-semibold text-[var(--hh-link)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add another item
        </button>
        <p className="text-hh-metadata tabular-nums text-[var(--hh-muted)]">
          {lines.length} line{lines.length === 1 ? "" : "s"} · {formatOverviewMoney(subtotal)}
        </p>
      </div>
    </section>
  );
}

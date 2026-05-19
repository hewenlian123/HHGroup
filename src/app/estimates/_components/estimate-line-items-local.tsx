"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Copy, Trash2, ChevronRight } from "lucide-react";
import type { CostCode } from "@/lib/data";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import {
  type EditorLineItem,
  createEmptyLineItem,
  editorLineTotal,
} from "./estimate-line-item-model";
import { EstimateLineItemsToolbar } from "./estimate-line-items-toolbar";
import { EstimateLineItemMobileCard } from "./estimate-line-item-mobile-card";
import { EB, ebInput } from "./estimate-builder-ui";

function AutoExpandTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}): React.ReactElement {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.max(52, el.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      rows={2}
    />
  );
}

export type EstimateLineItemsLocalProps = {
  costCodes: CostCode[];
  lineItems: EditorLineItem[];
  onLineItemsChange: (items: EditorLineItem[]) => void;
  categoryNames: Record<string, string>;
  onCategoryNamesChange: (names: Record<string, string>) => void;
  disabled?: boolean;
  submitAttempted?: boolean;
  lineItemsError?: string | null;
};

export function EstimateLineItemsLocal({
  costCodes,
  lineItems,
  onLineItemsChange,
  categoryNames,
  onCategoryNamesChange,
  disabled = false,
  submitAttempted = false,
  lineItemsError,
}: EstimateLineItemsLocalProps): React.ReactElement {
  const itemsByCode = React.useMemo(() => {
    const acc: Record<string, EditorLineItem[]> = {};
    lineItems.forEach((li) => {
      if (!acc[li.costCode]) acc[li.costCode] = [];
      acc[li.costCode].push(li);
    });
    return acc;
  }, [lineItems]);

  const codesWithItems = Object.keys(itemsByCode);
  const codesWithoutItems = costCodes.filter((c) => !itemsByCode[c.code]);

  const flatWithIndex = React.useMemo(() => {
    let idx = 0;
    const out: { item: EditorLineItem; rowIndex: number; code: string }[] = [];
    for (const code of codesWithItems) {
      for (const item of itemsByCode[code] ?? []) {
        idx += 1;
        out.push({ item, rowIndex: idx, code });
      }
    }
    return out;
  }, [codesWithItems, itemsByCode]);

  const lastItemId = flatWithIndex[flatWithIndex.length - 1]?.item.id;

  const updateItem = (id: string, patch: Partial<EditorLineItem>): void => {
    onLineItemsChange(lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)));
  };

  const addLineItem = (costCode: string): void => {
    onLineItemsChange([...lineItems, createEmptyLineItem(costCode)]);
  };

  const addCategory = (): void => {
    const used = new Set(lineItems.map((li) => li.costCode));
    const first = costCodes.find((c) => !used.has(c.code));
    if (first) addLineItem(first.code);
  };

  const duplicateItem = (id: string): void => {
    const src = lineItems.find((li) => li.id === id);
    if (!src) return;
    onLineItemsChange([
      ...lineItems,
      {
        ...src,
        id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: src.title ? `${src.title} (copy)` : "Copy",
      },
    ]);
  };

  const deleteItem = (id: string): void => {
    onLineItemsChange(lineItems.filter((li) => li.id !== id));
  };

  const setCategoryName = (code: string, name: string): void => {
    onCategoryNamesChange({ ...categoryNames, [code]: name });
  };

  const handleEnterAddNext = (costCode: string): void => {
    addLineItem(costCode);
  };

  return (
    <section className={EB.section}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={EB.scopeHeading}>Scope of work</h2>
          <p className={EB.scopeSubtitle}>Line items grouped by section</p>
        </div>
        <EstimateLineItemsToolbar
          onAddSection={addCategory}
          disabled={disabled || codesWithoutItems.length === 0}
        />
      </div>
      {lineItemsError ? (
        <p className="mb-3 text-xs text-muted-foreground">{lineItemsError}</p>
      ) : null}

      {/* Mobile: card list */}
      <div className="space-y-3 md:hidden">
        {flatWithIndex.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No line items yet.</p>
        ) : (
          flatWithIndex.map(({ item, rowIndex, code }) => (
            <EstimateLineItemMobileCard
              key={item.id}
              item={item}
              rowIndex={rowIndex}
              disabled={disabled}
              submitAttempted={submitAttempted}
              isLastRow={item.id === lastItemId}
              onChange={(patch) => updateItem(item.id, patch)}
              onDuplicate={() => duplicateItem(item.id)}
              onDelete={() => deleteItem(item.id)}
              onEnterAddNext={() => handleEnterAddNext(code)}
            />
          ))
        )}
        {codesWithItems.length === 0 && !disabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 w-full rounded-sm"
            onClick={addCategory}
            disabled={costCodes.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        ) : null}
      </div>

      {/* Desktop: scope sections */}
      <div className="max-md:hidden space-y-6">
        {codesWithItems.map((code) => {
          const cc = costCodes.find((c) => c.code === code)!;
          const displayName = categoryNames[code] ?? cc.name;
          const rows = itemsByCode[code];
          const sectionSubtotal = rows.reduce((s, li) => s + editorLineTotal(li), 0);
          return (
            <div key={code} className={cn(EB.categoryGroup, "mb-4")}>
              <details className="group" open>
                <summary
                  className={cn(
                    EB.scopeBlockHeader,
                    "list-none px-1 [&::-webkit-details-marker]:hidden"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-90" />
                    <Input
                      value={displayName}
                      onChange={(e) => setCategoryName(code, e.target.value)}
                      className={ebInput(
                        "h-8 max-w-[280px] border-0 px-0 text-[15px] font-semibold shadow-none focus-visible:ring-0"
                      )}
                      placeholder={cc.name}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      disabled={disabled}
                    />
                  </div>
                  <span className={EB.scopeBlockTotal}>
                    {formatEstimateCurrency(sectionSubtotal)}
                  </span>
                </summary>
                <div className="mt-2">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className={EB.lineTableHead}>
                        <th className="pb-2.5 text-left font-medium">Description</th>
                        <th className="w-20 pb-2.5 text-right font-medium">Qty</th>
                        <th className="w-28 pb-2.5 text-right font-medium">Unit price</th>
                        <th className="w-28 pb-2.5 text-right font-medium">Total</th>
                        <th className="w-20 pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIndexInCat) => {
                        const globalIdx =
                          flatWithIndex.find((f) => f.item.id === row.id)?.rowIndex ??
                          rowIndexInCat + 1;
                        const isLast = row.id === lastItemId;
                        return (
                          <React.Fragment key={row.id}>
                            <tr className={cn("group/line", EB.lineTableRow)}>
                              <td className="py-3 pr-3 align-top">
                                <Input
                                  value={row.title}
                                  onChange={(e) => updateItem(row.id, { title: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && isLast) {
                                      e.preventDefault();
                                      handleEnterAddNext(code);
                                    }
                                  }}
                                  className={ebInput("font-medium")}
                                  placeholder="Description"
                                  aria-label={`Line item ${globalIdx} title`}
                                  aria-invalid={
                                    submitAttempted && !row.title.trim() && !row.description.trim()
                                  }
                                  disabled={disabled}
                                />
                              </td>
                              <td className="py-3 pr-2 align-top">
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={row.qty}
                                  onChange={(e) =>
                                    updateItem(row.id, { qty: Number(e.target.value) || 0 })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && isLast) {
                                      e.preventDefault();
                                      handleEnterAddNext(code);
                                    }
                                  }}
                                  className={ebInput(`w-full ${EB.inputNumeric} ${EB.inputMuted}`)}
                                  aria-label={`Line item ${globalIdx} quantity`}
                                  disabled={disabled}
                                />
                              </td>
                              <td className="py-3 pr-2 align-top">
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={row.unitPrice}
                                  onChange={(e) =>
                                    updateItem(row.id, { unitPrice: Number(e.target.value) || 0 })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && isLast) {
                                      e.preventDefault();
                                      handleEnterAddNext(code);
                                    }
                                  }}
                                  className={ebInput(`w-full ${EB.inputNumeric} ${EB.inputMuted}`)}
                                  aria-label={`Line item ${globalIdx} unit price`}
                                  disabled={disabled}
                                />
                              </td>
                              <td className={cn("py-3 pr-2 text-right align-top", EB.lineTotal)}>
                                {formatEstimateCurrency(editorLineTotal(row))}
                              </td>
                              <td className={cn("py-3 align-top", EB.lineRowActions)}>
                                <div className="flex justify-end gap-0.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground/55 hover:text-foreground"
                                    onClick={() => duplicateItem(row.id)}
                                    aria-label="Duplicate line item"
                                    disabled={disabled}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground/45 hover:text-destructive"
                                    onClick={() => deleteItem(row.id)}
                                    aria-label="Remove line item"
                                    disabled={disabled}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b border-border/20">
                              <td colSpan={5} className="pb-2 pt-0">
                                <AutoExpandTextarea
                                  value={row.description}
                                  onChange={(v) => updateItem(row.id, { description: v })}
                                  placeholder="Notes (optional)"
                                  className="min-h-[40px] w-full resize-none bg-transparent text-sm text-muted-foreground focus:outline-none"
                                />
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    className={cn(EB.addLineLink, "mt-2")}
                    onClick={() => addLineItem(code)}
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    Add line
                  </button>
                </div>
              </details>
            </div>
          );
        })}
        {codesWithItems.length === 0 && !disabled ? (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm text-muted-foreground">No line items yet.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={addCategory}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Section
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

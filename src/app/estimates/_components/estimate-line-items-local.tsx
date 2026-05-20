"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Copy, Trash2 } from "lucide-react";
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
import { EB, ebGlassPanel, ebInput } from "./estimate-builder-ui";
import { ProposalScopeWorkCard } from "./proposal-scope-work-card";

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
      <div className={ebGlassPanel()}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className={EB.scopeHeading}>Scope of work</h2>
            <p className={EB.scopeSubtitle}>Proposal sections and line totals</p>
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
              className="!h-11 !min-h-11 w-full rounded-sm"
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
              <div key={code} className={cn(EB.categoryGroup, "mb-6 last:mb-0")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/[0.08] pb-2">
                  <Input
                    value={displayName}
                    onChange={(e) => setCategoryName(code, e.target.value)}
                    className={ebInput(
                      "h-8 max-w-[min(100%,20rem)] border-0 bg-transparent px-0 text-[15px] font-semibold tracking-tight text-zinc-100 shadow-none focus-visible:ring-0"
                    )}
                    placeholder={cc.name}
                    disabled={disabled}
                  />
                  <span className="text-sm font-semibold tabular-nums tracking-tight text-zinc-200">
                    {formatEstimateCurrency(sectionSubtotal)}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {rows.map((row, rowIndexInCat) => {
                    const globalIdx =
                      flatWithIndex.find((f) => f.item.id === row.id)?.rowIndex ??
                      rowIndexInCat + 1;
                    const isLast = row.id === lastItemId;
                    return (
                      <div key={row.id}>
                        <ProposalScopeWorkCard
                          title={row.title}
                          description={row.description}
                          disabled={disabled}
                          onTitleChange={(v) => updateItem(row.id, { title: v })}
                          onDescriptionChange={(v) => updateItem(row.id, { description: v })}
                          titleInvalid={submitAttempted && !row.title.trim()}
                          titleInputAriaLabel={`Line item ${globalIdx} title`}
                          descriptionEditorAriaLabel={`Line item ${globalIdx} description`}
                          duplicateNode={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                              onClick={() => duplicateItem(row.id)}
                              aria-label="Duplicate scope card"
                              disabled={disabled}
                            >
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </Button>
                          }
                          deleteNode={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-zinc-500 hover:bg-white/[0.06] hover:text-red-400"
                              onClick={() => deleteItem(row.id)}
                              aria-label="Remove line item"
                              disabled={disabled}
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </Button>
                          }
                          inlinePricing={
                            <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                              <span className="hidden pb-1.5 text-[10px] tabular-nums text-zinc-600 sm:inline">
                                #{globalIdx}
                              </span>
                              <div className="flex flex-col gap-0.5">
                                <span className={EB.readLabel}>Qty</span>
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
                                  className={ebInput(
                                    `h-7 min-h-7 w-[3.25rem] px-1.5 ${EB.inputNumeric} ${EB.inputMuted} text-xs`
                                  )}
                                  aria-label={`Line item ${globalIdx} quantity`}
                                  disabled={disabled}
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className={EB.readLabel}>Unit</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={row.unitPrice}
                                  onChange={(e) =>
                                    updateItem(row.id, {
                                      unitPrice: Number(e.target.value) || 0,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && isLast) {
                                      e.preventDefault();
                                      handleEnterAddNext(code);
                                    }
                                  }}
                                  className={ebInput(
                                    `h-7 min-h-7 w-[4.5rem] px-1.5 ${EB.inputNumeric} ${EB.inputMuted} text-xs`
                                  )}
                                  aria-label={`Line item ${globalIdx} unit price`}
                                  disabled={disabled}
                                />
                              </div>
                              <div className="flex flex-col items-end gap-0.5">
                                <span className={EB.readLabel}>Total</span>
                                <span className="min-w-0 pb-0.5 text-right text-xs font-medium tabular-nums leading-tight text-zinc-200">
                                  {formatEstimateCurrency(editorLineTotal(row))}
                                </span>
                              </div>
                            </div>
                          }
                        />
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className={cn(EB.addLineLink, "mt-0.5 px-1.5")}
                    onClick={() => addLineItem(code)}
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    Add line
                  </button>
                </div>
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
                className="!h-11 !min-h-11 rounded-sm"
                onClick={addCategory}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Section
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

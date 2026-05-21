"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, Plus, Layers } from "lucide-react";
import type { CostCode } from "@/lib/data";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import type { EditorLineItem } from "./estimate-line-item-model";
import { EstimateAddSectionMenu } from "./estimate-add-section-menu";
import { EstimateAddLineMenu } from "./estimate-add-line-menu";
import {
  pushRecentLineItem,
  pushRecentSection,
  readRecentLineItems,
  readRecentSections,
  readSavedLineItems,
  saveLineItemPreset,
  type LineItemPresetInput,
  type RecentSectionEntry,
} from "./estimate-builder-draft-storage";
import { resolveBlankSection, resolveSectionForTemplate } from "./estimate-section-templates";
import {
  createEmptyLineItem,
  editorLineItemToPresetInput,
  editorLineTotal,
  lineItemFromPreset,
} from "./estimate-line-item-model";
import { DEFAULT_LINE_ITEM_STATUS, type EstimateLineItemStatus } from "./estimate-line-item-status";
import { EstimateLineItemStatusPill } from "./estimate-line-item-status-pill";
import { EstimateLineItemMobileCard } from "./estimate-line-item-mobile-card";
import { EB, ebGlassPanel, ebInput } from "./estimate-builder-ui";
import { EstimateLineItemMoreMenu } from "./estimate-line-item-more-menu";
import { ProposalScopeWorkCard } from "./proposal-scope-work-card";
import { EstimateScopeSortableSection } from "./estimate-scope-section-sortable";

function formatSectionItemCount(count: number): string {
  if (count === 0) return "No items";
  if (count === 1) return "1 item";
  return `${count} items`;
}

type ScopeSectionHeaderProps = {
  code: string;
  catalogName: string;
  displayName: string;
  itemCount: number;
  sectionSubtotal: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDisplayNameChange: (name: string) => void;
  dragHandle?: React.ReactNode;
  disabled?: boolean;
};

function ScopeSectionCollapseButton({
  collapsed,
  onToggle,
  disabled,
}: {
  collapsed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}): React.ReactElement {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      className={EB.scopeSectionCollapseBtn}
      aria-label={collapsed ? "Expand section" : "Collapse section"}
      aria-expanded={!collapsed}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function ScopeSectionHeader({
  catalogName,
  displayName,
  itemCount,
  sectionSubtotal,
  collapsed,
  onToggleCollapse,
  onDisplayNameChange,
  dragHandle,
  disabled = false,
}: ScopeSectionHeaderProps): React.ReactElement {
  return (
    <div
      className={cn(
        EB.scopeBlockHeader,
        "eb-scope-section-header",
        collapsed && EB.scopeSectionHeaderCollapsed
      )}
    >
      <div className={EB.scopeSectionHeaderRow}>
        {dragHandle}
        <ScopeSectionCollapseButton
          collapsed={collapsed}
          onToggle={onToggleCollapse}
          disabled={disabled}
        />
        <div className={EB.sectionHeaderChip}>
          <Layers className={cn("h-3.5 w-3.5", EB.sectionHeaderIcon)} aria-hidden />
          <Input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className={ebInput(
              "h-7 min-h-7 w-full min-w-[8rem] max-w-full border-0 bg-transparent px-0 text-[15px] font-semibold tracking-tight text-zinc-50 shadow-none focus-visible:ring-0"
            )}
            placeholder={catalogName}
            disabled={disabled}
            aria-label={`Section name for ${catalogName}`}
          />
        </div>
      </div>
      <div className={cn(collapsed ? EB.scopeSectionHeaderMeta : "shrink-0")}>
        {collapsed ? (
          <span className={EB.scopeSectionItemCount}>{formatSectionItemCount(itemCount)}</span>
        ) : null}
        <span className={EB.scopeBlockTotal}>{formatEstimateCurrency(sectionSubtotal)}</span>
      </div>
    </div>
  );
}

function ScopeSectionCollapsibleBody({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(EB.scopeSectionBody, collapsed && EB.scopeSectionBodyCollapsed)}
      aria-hidden={collapsed}
    >
      <div className={EB.scopeSectionBodyInner}>{children}</div>
    </div>
  );
}

export type EstimateLineItemsLocalProps = {
  costCodes: CostCode[];
  lineItems: EditorLineItem[];
  onLineItemsChange: (items: EditorLineItem[]) => void;
  categoryNames: Record<string, string>;
  onCategoryNamesChange: (names: Record<string, string>) => void;
  sectionOrder: string[];
  onSectionOrderChange: (order: string[]) => void;
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
  sectionOrder,
  onSectionOrderChange,
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

  const orderedSectionCodes = React.useMemo(() => {
    if (sectionOrder.length === 0) return codesWithItems;
    const kept = sectionOrder.filter((c) => codesWithItems.includes(c));
    const added = codesWithItems.filter((c) => !kept.includes(c));
    return [...kept, ...added];
  }, [codesWithItems, sectionOrder]);

  const [sectionDragging, setSectionDragging] = React.useState(false);
  const [overSectionId, setOverSectionId] = React.useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});

  const isSectionCollapsed = React.useCallback(
    (code: string) => collapsedSections[code] === true,
    [collapsedSections]
  );

  const toggleSectionCollapsed = React.useCallback((code: string) => {
    setCollapsedSections((prev) => ({ ...prev, [code]: !prev[code] }));
  }, []);

  const [recentSections, setRecentSections] = React.useState<RecentSectionEntry[]>([]);
  const [recentLineItems, setRecentLineItems] = React.useState<
    ReturnType<typeof readRecentLineItems>
  >([]);
  const [savedLineItems, setSavedLineItems] = React.useState<ReturnType<typeof readSavedLineItems>>(
    []
  );

  const refreshDraftStorage = React.useCallback((): void => {
    setRecentSections(readRecentSections());
    setRecentLineItems(readRecentLineItems());
    setSavedLineItems(readSavedLineItems());
  }, []);

  React.useEffect(() => {
    refreshDraftStorage();
  }, [refreshDraftStorage]);

  const usedCostCodes = React.useMemo(
    () => new Set(lineItems.map((li) => li.costCode)),
    [lineItems]
  );

  const canAddSection = codesWithoutItems.length > 0;

  const addSectionWithMeta = React.useCallback(
    (costCode: string, displayName: string): void => {
      onCategoryNamesChange({ ...categoryNames, [costCode]: displayName });
      onLineItemsChange([...lineItems, createEmptyLineItem(costCode)]);
      pushRecentSection({ displayName, costCode });
      refreshDraftStorage();
    },
    [categoryNames, lineItems, onCategoryNamesChange, onLineItemsChange, refreshDraftStorage]
  );

  const addBlankSection = React.useCallback((): void => {
    const resolved = resolveBlankSection(costCodes, usedCostCodes);
    if (!resolved) return;
    addSectionWithMeta(resolved.costCode, resolved.displayName);
  }, [addSectionWithMeta, costCodes, usedCostCodes]);

  const addSectionFromTemplate = React.useCallback(
    (templateName: string): void => {
      const resolved = resolveSectionForTemplate(templateName, costCodes, usedCostCodes);
      if (!resolved) return;
      addSectionWithMeta(resolved.costCode, resolved.displayName);
    },
    [addSectionWithMeta, costCodes, usedCostCodes]
  );

  const addSectionFromRecent = React.useCallback(
    (entry: RecentSectionEntry): void => {
      if (!usedCostCodes.has(entry.costCode)) {
        addSectionWithMeta(entry.costCode, entry.displayName);
        return;
      }
      const resolved = resolveSectionForTemplate(entry.displayName, costCodes, usedCostCodes);
      if (!resolved) return;
      addSectionWithMeta(resolved.costCode, resolved.displayName);
    },
    [addSectionWithMeta, costCodes, usedCostCodes]
  );

  const addLineFromPreset = React.useCallback(
    (costCode: string, preset: LineItemPresetInput): void => {
      onLineItemsChange([...lineItems, lineItemFromPreset(costCode, preset)]);
      pushRecentLineItem(preset);
      refreshDraftStorage();
    },
    [lineItems, onLineItemsChange, refreshDraftStorage]
  );

  const handleSaveAsReusable = React.useCallback(
    (item: EditorLineItem): void => {
      const preset = editorLineItemToPresetInput({
        ...item,
        status: item.status ?? DEFAULT_LINE_ITEM_STATUS,
      });
      if (!preset.title.trim() && !preset.description.trim()) return;
      saveLineItemPreset(preset);
      pushRecentLineItem(preset);
      refreshDraftStorage();
    },
    [refreshDraftStorage]
  );

  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSectionDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setSectionDragging(false);
      setOverSectionId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = orderedSectionCodes;
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onSectionOrderChange(arrayMove(ids, oldIndex, newIndex));
    },
    [orderedSectionCodes, onSectionOrderChange]
  );

  const flatWithIndex = React.useMemo(() => {
    let idx = 0;
    const out: { item: EditorLineItem; rowIndex: number; code: string }[] = [];
    for (const code of orderedSectionCodes) {
      for (const item of itemsByCode[code] ?? []) {
        idx += 1;
        out.push({ item, rowIndex: idx, code });
      }
    }
    return out;
  }, [orderedSectionCodes, itemsByCode]);

  const lastItemId = flatWithIndex[flatWithIndex.length - 1]?.item.id;

  const updateItem = (id: string, patch: Partial<EditorLineItem>): void => {
    onLineItemsChange(lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)));
  };

  const addLineItem = (costCode: string): void => {
    onLineItemsChange([...lineItems, createEmptyLineItem(costCode)]);
  };

  const duplicateItem = (id: string): void => {
    const src = lineItems.find((li) => li.id === id);
    if (!src) return;
    onLineItemsChange([
      ...lineItems,
      {
        ...src,
        status: src.status ?? DEFAULT_LINE_ITEM_STATUS,
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
      <div className={ebGlassPanel("eb-scope-work-panel")}>
        <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className={EB.scopeHeading}>Scope of work</h2>
            <p className={EB.scopeSubtitle}>Proposal sections and line totals</p>
          </div>
          <EstimateAddSectionMenu
            disabled={disabled}
            canAddSection={canAddSection}
            recentSections={recentSections}
            onAddBlank={addBlankSection}
            onAddTemplate={addSectionFromTemplate}
            onAddRecent={addSectionFromRecent}
          />
        </div>
        {lineItemsError ? (
          <p className="mb-3 text-xs text-muted-foreground">{lineItemsError}</p>
        ) : null}

        {/* Mobile: sections with collapse */}
        <div className="md:hidden">
          {orderedSectionCodes.length === 0 ? (
            <div className={cn(EB.scopeEmpty, "py-6")}>
              <p className={EB.scopeEmptyMessage}>No line items yet.</p>
            </div>
          ) : (
            orderedSectionCodes.map((code) => {
              const cc = costCodes.find((c) => c.code === code)!;
              const displayName = categoryNames[code] ?? cc.name;
              const rows = itemsByCode[code] ?? [];
              const sectionSubtotal = rows.reduce((s, li) => s + editorLineTotal(li), 0);
              const collapsed = isSectionCollapsed(code);
              return (
                <div key={code} className={EB.scopeSectionMobile}>
                  <ScopeSectionHeader
                    code={code}
                    catalogName={cc.name}
                    displayName={displayName}
                    itemCount={rows.length}
                    sectionSubtotal={sectionSubtotal}
                    collapsed={collapsed}
                    onToggleCollapse={() => toggleSectionCollapsed(code)}
                    onDisplayNameChange={(name) => setCategoryName(code, name)}
                    disabled={disabled}
                  />
                  <ScopeSectionCollapsibleBody collapsed={collapsed}>
                    <div className="space-y-3 pt-2">
                      {rows.map((item) => {
                        const rowIndex =
                          flatWithIndex.find((f) => f.item.id === item.id)?.rowIndex ?? 0;
                        return (
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
                            onToggleHideAmountOnPdf={() =>
                              updateItem(item.id, {
                                hideAmountOnPdf: !item.hideAmountOnPdf,
                              })
                            }
                            onSetStatus={(status) => updateItem(item.id, { status })}
                            onSaveAsReusable={() => handleSaveAsReusable(item)}
                            onEnterAddNext={() => handleEnterAddNext(code)}
                          />
                        );
                      })}
                      <EstimateAddLineMenu
                        className="w-full justify-center"
                        align="center"
                        disabled={disabled}
                        recentItems={recentLineItems}
                        savedItems={savedLineItems}
                        onAddBlank={() => addLineItem(code)}
                        onAddPreset={(preset) => addLineFromPreset(code, preset)}
                      />
                    </div>
                  </ScopeSectionCollapsibleBody>
                </div>
              );
            })
          )}
          {codesWithItems.length === 0 && !disabled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("!h-11 !min-h-11 w-full", EB.actionSecondary)}
              onClick={addBlankSection}
              disabled={costCodes.length === 0 || !canAddSection}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Section
            </Button>
          ) : null}
        </div>

        {/* Desktop: scope sections (whole-section reorder via header handle) */}
        <DndContext
          sensors={sectionSensors}
          collisionDetection={closestCenter}
          onDragStart={() => setSectionDragging(true)}
          onDragOver={(e) => setOverSectionId(e.over ? String(e.over.id) : null)}
          onDragCancel={() => {
            setSectionDragging(false);
            setOverSectionId(null);
          }}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext
            items={orderedSectionCodes}
            strategy={verticalListSortingStrategy}
            disabled={disabled}
          >
            <div
              className="eb-scope-sections-list max-md:hidden flex flex-col"
              data-section-dragging={sectionDragging ? "true" : undefined}
            >
              {orderedSectionCodes.map((code) => {
                const cc = costCodes.find((c) => c.code === code)!;
                const displayName = categoryNames[code] ?? cc.name;
                const rows = itemsByCode[code];
                const sectionSubtotal = rows.reduce((s, li) => s + editorLineTotal(li), 0);
                const collapsed = isSectionCollapsed(code);
                return (
                  <EstimateScopeSortableSection
                    key={code}
                    id={code}
                    disabled={disabled}
                    isDropTarget={overSectionId === code}
                  >
                    {(dragHandle) => (
                      <>
                        <ScopeSectionHeader
                          code={code}
                          catalogName={cc.name}
                          displayName={displayName}
                          itemCount={rows.length}
                          sectionSubtotal={sectionSubtotal}
                          collapsed={collapsed}
                          onToggleCollapse={() => toggleSectionCollapsed(code)}
                          onDisplayNameChange={(name) => setCategoryName(code, name)}
                          dragHandle={dragHandle}
                          disabled={disabled}
                        />
                        <ScopeSectionCollapsibleBody collapsed={collapsed}>
                          <div className="eb-scope-section-lines flex flex-col">
                            {rows.map((row, rowIndexInCat) => {
                              const globalIdx =
                                flatWithIndex.find((f) => f.item.id === row.id)?.rowIndex ??
                                rowIndexInCat + 1;
                              const isLast = row.id === lastItemId;
                              return (
                                <div key={row.id} className={EB.lineItemCard}>
                                  <ProposalScopeWorkCard
                                    lineItemGridLayout
                                    title={row.title}
                                    description={row.description}
                                    disabled={disabled}
                                    onTitleChange={(v) => updateItem(row.id, { title: v })}
                                    onDescriptionChange={(v) =>
                                      updateItem(row.id, { description: v })
                                    }
                                    titleInvalid={submitAttempted && !row.title.trim()}
                                    titleInputAriaLabel={`Line item ${globalIdx} title`}
                                    descriptionEditorAriaLabel={`Line item ${globalIdx} description`}
                                    lineIndex={globalIdx}
                                    titleTrailingSlot={
                                      <EstimateLineItemStatusPill
                                        status={row.status ?? DEFAULT_LINE_ITEM_STATUS}
                                      />
                                    }
                                    inlinePricing={
                                      <>
                                        <div
                                          className={cn(
                                            EB.lineFieldStackContents,
                                            EB.linePricingQty
                                          )}
                                        >
                                          <span className={cn(EB.readLabel, EB.lineQtyLabel)}>
                                            Qty
                                          </span>
                                          <Input
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={row.qty}
                                            onChange={(e) =>
                                              updateItem(row.id, {
                                                qty: Number(e.target.value) || 0,
                                              })
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" && !e.shiftKey && isLast) {
                                                e.preventDefault();
                                                handleEnterAddNext(code);
                                              }
                                            }}
                                            className={ebInput(
                                              `h-8 min-h-8 w-full px-2 ${EB.inputNumeric} ${EB.lineQtyInput}`
                                            )}
                                            aria-label={`Line item ${globalIdx} quantity`}
                                            disabled={disabled}
                                          />
                                        </div>
                                        <div
                                          className={cn(
                                            EB.lineFieldStackContents,
                                            EB.linePricingUnit
                                          )}
                                        >
                                          <span className={cn(EB.readLabel, EB.lineUnitLabel)}>
                                            Unit price
                                          </span>
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
                                              `h-8 min-h-8 w-full px-2 ${EB.inputNumeric} ${EB.lineUnitInput}`
                                            )}
                                            aria-label={`Line item ${globalIdx} unit price`}
                                            disabled={disabled}
                                          />
                                        </div>
                                        <div
                                          className={cn(
                                            EB.linePricingTotalCol,
                                            EB.lineTotalActionArea
                                          )}
                                        >
                                          <div className={EB.lineTotalBlock}>
                                            <span className={cn(EB.readLabel, EB.lineTotalLabel)}>
                                              Total
                                            </span>
                                            <div
                                              className={cn(
                                                EB.linePricingTotal,
                                                EB.lineTotalAmount
                                              )}
                                            >
                                              <span className={cn(EB.lineTotal, "leading-none")}>
                                                {formatEstimateCurrency(editorLineTotal(row))}
                                              </span>
                                            </div>
                                          </div>
                                          <EstimateLineItemMoreMenu
                                            onDuplicate={() => duplicateItem(row.id)}
                                            onDelete={() => deleteItem(row.id)}
                                            hideAmountOnPdf={row.hideAmountOnPdf}
                                            onToggleHideAmountOnPdf={() =>
                                              updateItem(row.id, {
                                                hideAmountOnPdf: !row.hideAmountOnPdf,
                                              })
                                            }
                                            showHideAmountOnPdf
                                            showSetStatus
                                            currentStatus={row.status ?? DEFAULT_LINE_ITEM_STATUS}
                                            onSetStatus={(status: EstimateLineItemStatus) =>
                                              updateItem(row.id, { status })
                                            }
                                            showSaveAsReusable
                                            onSaveAsReusable={() => handleSaveAsReusable(row)}
                                            disabled={disabled}
                                          />
                                        </div>
                                      </>
                                    }
                                  />
                                </div>
                              );
                            })}
                            <EstimateAddLineMenu
                              className="mt-2"
                              disabled={disabled}
                              recentItems={recentLineItems}
                              savedItems={savedLineItems}
                              onAddBlank={() => addLineItem(code)}
                              onAddPreset={(preset) => addLineFromPreset(code, preset)}
                            />
                          </div>
                        </ScopeSectionCollapsibleBody>
                      </>
                    )}
                  </EstimateScopeSortableSection>
                );
              })}
              {codesWithItems.length === 0 && !disabled ? (
                <div className={EB.scopeEmpty}>
                  <p className={cn(EB.scopeEmptyMessage, "mb-3")}>No line items yet.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("!h-11 !min-h-11", EB.actionSecondary)}
                    onClick={addBlankSection}
                    disabled={!canAddSection}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Section
                  </Button>
                </div>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  );
}

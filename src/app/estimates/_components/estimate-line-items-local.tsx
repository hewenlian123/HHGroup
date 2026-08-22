"use client";

import * as React from "react";
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
import { ChevronDown, ChevronRight, Layers, Plus } from "lucide-react";
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
import {
  normalizeProposalSectionName,
  resolveBlankSection,
  resolveSectionForTemplate,
} from "./estimate-section-templates";
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
import { EstimateLineItemGridHeader } from "./estimate-line-item-grid-header";
import { EstimateScopeToolbar } from "./estimate-scope-toolbar";
import {
  buildEstimateSectionCollapseState,
  reconcileEstimateSectionOrder,
  shouldCommitEstimateLineFromPrice,
} from "./estimate-builder-productivity";

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
  titleSlot?: React.ReactNode;
  onAddLine?: () => void;
  addLineAriaLabel?: string;
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

export function ScopeSectionHeader({
  catalogName,
  displayName,
  itemCount,
  sectionSubtotal,
  collapsed,
  onToggleCollapse,
  onDisplayNameChange,
  dragHandle,
  titleSlot,
  onAddLine,
  addLineAriaLabel,
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
          {titleSlot ?? (
            <Input
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className={ebInput(
                "h-7 min-h-7 w-full min-w-[8rem] max-w-full border-0 bg-transparent px-0 text-hh-section-title font-semibold tracking-normal text-zinc-50 shadow-none focus-visible:ring-0"
              )}
              placeholder={catalogName}
              disabled={disabled}
              aria-label={`Section name for ${catalogName}`}
            />
          )}
        </div>
      </div>
      <div className={EB.scopeSectionHeaderMeta}>
        <span className={EB.scopeSectionItemCount}>{formatSectionItemCount(itemCount)}</span>
        <span className={EB.scopeBlockTotal}>{formatEstimateCurrency(sectionSubtotal)}</span>
        {onAddLine ? (
          <button
            type="button"
            className={EB.scopeSectionAddLine}
            aria-label={addLineAriaLabel ?? "Add line to section"}
            disabled={disabled}
            onClick={onAddLine}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span>Add line</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ScopeSectionCollapsibleBody({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.inert = collapsed;
  }, [collapsed]);

  return (
    <div
      ref={bodyRef}
      className={cn(EB.scopeSectionBody, collapsed && EB.scopeSectionBodyCollapsed)}
      aria-hidden={collapsed ? true : undefined}
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

  const orderedSectionCodes = React.useMemo(
    () => reconcileEstimateSectionOrder(sectionOrder, categoryNames, codesWithItems),
    [categoryNames, codesWithItems, sectionOrder]
  );

  const [sectionDragging, setSectionDragging] = React.useState(false);
  const [overSectionId, setOverSectionId] = React.useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});
  const [openSectionMenuKey, setOpenSectionMenuKey] = React.useState<string | null>(null);
  const [sectionFocusTargetCode, setSectionFocusTargetCode] = React.useState<string | null>(null);
  const [highlightSectionCode, setHighlightSectionCode] = React.useState<string | null>(null);
  const [activeSectionCode, setActiveSectionCode] = React.useState<string | null>(null);
  const [lineFocusTargetId, setLineFocusTargetId] = React.useState<string | null>(null);

  const isSectionCollapsed = React.useCallback(
    (code: string) => collapsedSections[code] === true,
    [collapsedSections]
  );

  const toggleSectionCollapsed = React.useCallback((code: string) => {
    setCollapsedSections((prev) => ({ ...prev, [code]: !prev[code] }));
  }, []);

  const collapseAllSections = React.useCallback(() => {
    setCollapsedSections(buildEstimateSectionCollapseState(orderedSectionCodes, true));
  }, [orderedSectionCodes]);

  const expandAllSections = React.useCallback(() => {
    setCollapsedSections(buildEstimateSectionCollapseState(orderedSectionCodes, false));
  }, [orderedSectionCodes]);

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

  const catalogNameByCode = React.useMemo(
    () => new Map(costCodes.map((code) => [code.code, code.name])),
    [costCodes]
  );

  const sectionDisplayName = React.useCallback(
    (code: string): string =>
      categoryNames[code]?.trim() || catalogNameByCode.get(code) || "Section",
    [catalogNameByCode, categoryNames]
  );

  const usedCostCodes = React.useMemo(() => new Set(orderedSectionCodes), [orderedSectionCodes]);

  const canAddSection = true;

  const sectionNameExists = React.useCallback(
    (name: string, exceptCode?: string): boolean => {
      const normalizedName = normalizeProposalSectionName(name);
      if (!normalizedName) return false;
      return orderedSectionCodes.some(
        (code) =>
          code !== exceptCode &&
          normalizeProposalSectionName(sectionDisplayName(code)) === normalizedName
      );
    },
    [orderedSectionCodes, sectionDisplayName]
  );

  const nextBlankSectionName = React.useCallback((): string => {
    let index = orderedSectionCodes.length + 1;
    let name = `Section ${index}`;
    while (sectionNameExists(name)) {
      index += 1;
      name = `Section ${index}`;
    }
    return name;
  }, [orderedSectionCodes.length, sectionNameExists]);

  const existingSectionNames = React.useMemo(
    () => orderedSectionCodes.map((code) => sectionDisplayName(code)),
    [orderedSectionCodes, sectionDisplayName]
  );

  React.useLayoutEffect(() => {
    if (!sectionFocusTargetCode || !orderedSectionCodes.includes(sectionFocusTargetCode)) return;
    const targetCode = sectionFocusTargetCode;
    let focusFrame = 0;
    const closeFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const escapedCode = targetCode.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            `[data-estimate-section-id="${escapedCode}"], [data-estimate-section-mobile-id="${escapedCode}"]`
          )
        );
        const section = candidates.find((candidate) => candidate.getClientRects().length > 0);
        if (!section) return;
        const rect = section.getBoundingClientRect();
        if (rect.top < 88 || rect.bottom > window.innerHeight - 88) {
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
        }
        const focusTarget = section.querySelector<HTMLElement>(
          'input[aria-label^="Section name"], input[aria-label^="Line item"]'
        );
        focusTarget?.focus({ preventScroll: true });
        setHighlightSectionCode(targetCode);
        setSectionFocusTargetCode(null);
        window.setTimeout(() => setHighlightSectionCode(null), 1200);
      });
    });
    return () => {
      window.cancelAnimationFrame(closeFrame);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, [orderedSectionCodes, sectionFocusTargetCode]);

  React.useLayoutEffect(() => {
    if (!lineFocusTargetId) return;
    const escapedId = lineFocusTargetId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let focusFrame = 0;
    const closeFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const row = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-estimate-line-item-id="${escapedId}"]`)
        ).find((candidate) => candidate.getClientRects().length > 0);
        const target = row?.querySelector<HTMLElement>(
          'input[aria-label*=" title"], .eb-line-item-mobile-summary'
        );
        if (!target) return;
        target.focus({ preventScroll: false });
        setLineFocusTargetId(null);
      });
    });
    return () => {
      window.cancelAnimationFrame(closeFrame);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, [lineFocusTargetId, lineItems]);

  const addSectionWithMeta = React.useCallback(
    (costCode: string, displayName: string, insertAfterCode?: string | null): boolean => {
      const trimmed = displayName.trim();
      if (!trimmed || usedCostCodes.has(costCode) || sectionNameExists(trimmed)) return false;
      onCategoryNamesChange({ ...categoryNames, [costCode]: trimmed });
      onLineItemsChange([...lineItems, createEmptyLineItem(costCode)]);
      const nextOrder = orderedSectionCodes.filter((code) => code !== costCode);
      const anchorIndex = insertAfterCode ? nextOrder.indexOf(insertAfterCode) : -1;
      const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : nextOrder.length;
      nextOrder.splice(insertIndex, 0, costCode);
      onSectionOrderChange(nextOrder);
      setSectionFocusTargetCode(costCode);
      pushRecentSection({ displayName: trimmed, costCode });
      refreshDraftStorage();
      return true;
    },
    [
      categoryNames,
      lineItems,
      onCategoryNamesChange,
      onLineItemsChange,
      onSectionOrderChange,
      orderedSectionCodes,
      refreshDraftStorage,
      sectionNameExists,
      usedCostCodes,
    ]
  );

  const addBlankSection = React.useCallback(
    (insertAfterCode?: string | null): void => {
      const resolved = resolveBlankSection(usedCostCodes, nextBlankSectionName());
      if (!resolved) return;
      addSectionWithMeta(resolved.costCode, resolved.displayName, insertAfterCode);
    },
    [addSectionWithMeta, nextBlankSectionName, usedCostCodes]
  );

  const addCustomSection = React.useCallback(
    (title: string, insertAfterCode?: string | null): boolean => {
      const resolved = resolveSectionForTemplate(title, usedCostCodes);
      if (!resolved) return false;
      return addSectionWithMeta(resolved.costCode, resolved.displayName, insertAfterCode);
    },
    [addSectionWithMeta, usedCostCodes]
  );

  const addSectionFromTemplate = React.useCallback(
    (templateName: string, insertAfterCode?: string | null): void => {
      const resolved = resolveSectionForTemplate(templateName, usedCostCodes);
      if (!resolved) return;
      addSectionWithMeta(resolved.costCode, resolved.displayName, insertAfterCode);
    },
    [addSectionWithMeta, usedCostCodes]
  );

  const addSectionFromRecent = React.useCallback(
    (entry: RecentSectionEntry, insertAfterCode?: string | null): void => {
      const resolved = resolveSectionForTemplate(entry.displayName, usedCostCodes);
      if (!resolved) return;
      addSectionWithMeta(resolved.costCode, resolved.displayName, insertAfterCode);
    },
    [addSectionWithMeta, usedCostCodes]
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

  const updateItem = (id: string, patch: Partial<EditorLineItem>): void => {
    onLineItemsChange(lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)));
  };

  const addLineItem = (costCode: string): void => {
    const nextItem = createEmptyLineItem(costCode);
    onLineItemsChange([...lineItems, nextItem]);
    setLineFocusTargetId(nextItem.id);
  };

  const duplicateItem = (id: string): void => {
    const sourceIndex = lineItems.findIndex((lineItem) => lineItem.id === id);
    const src = lineItems[sourceIndex];
    if (!src || sourceIndex < 0) return;
    const duplicate = {
      ...src,
      status: src.status ?? DEFAULT_LINE_ITEM_STATUS,
      id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: src.title ? `${src.title} (copy)` : "Copy",
    };
    const nextItems = [...lineItems];
    nextItems.splice(sourceIndex + 1, 0, duplicate);
    onLineItemsChange(nextItems);
    setLineFocusTargetId(duplicate.id);
  };

  const deleteItem = (id: string): void => {
    const source = lineItems.find((lineItem) => lineItem.id === id);
    const sectionItems = source
      ? lineItems.filter((lineItem) => lineItem.costCode === source.costCode)
      : [];
    const sectionIndex = sectionItems.findIndex((lineItem) => lineItem.id === id);
    const nextFocusId =
      sectionItems[sectionIndex + 1]?.id ?? sectionItems[sectionIndex - 1]?.id ?? null;
    onLineItemsChange(lineItems.filter((li) => li.id !== id));
    if (nextFocusId) {
      window.setTimeout(() => setLineFocusTargetId(nextFocusId), 0);
    }
  };

  const setCategoryName = (code: string, name: string): void => {
    onCategoryNamesChange({ ...categoryNames, [code]: name });
  };

  const handleEnterAddNext = (itemId: string, costCode: string): void => {
    const sectionItems = itemsByCode[costCode] ?? [];
    const itemIndex = sectionItems.findIndex((item) => item.id === itemId);
    const nextItem = itemIndex >= 0 ? sectionItems[itemIndex + 1] : undefined;
    if (nextItem) {
      setLineFocusTargetId(nextItem.id);
      return;
    }
    addLineItem(costCode);
  };

  const focusExistingSection = React.useCallback(
    (name: string): void => {
      const normalizedName = normalizeProposalSectionName(name);
      const existingCode = orderedSectionCodes.find(
        (code) => normalizeProposalSectionName(sectionDisplayName(code)) === normalizedName
      );
      if (!existingCode) return;
      setSectionFocusTargetCode(existingCode);
    },
    [orderedSectionCodes, sectionDisplayName]
  );

  const outlineSections = React.useMemo(
    () =>
      orderedSectionCodes.map((code) => {
        const rows = itemsByCode[code] ?? [];
        return {
          id: code,
          name: sectionDisplayName(code),
          itemCount: rows.length,
          subtotal: rows.reduce((sum, item) => sum + editorLineTotal(item), 0),
          collapsed: isSectionCollapsed(code),
        };
      }),
    [isSectionCollapsed, itemsByCode, orderedSectionCodes, sectionDisplayName]
  );

  const scopeSearchEntries = React.useMemo(
    () =>
      outlineSections.flatMap((section) => {
        const rows = itemsByCode[section.id] ?? [];
        return [
          {
            id: `section-${section.id}`,
            sectionId: section.id,
            label: section.name,
            detail: formatSectionItemCount(section.itemCount),
            searchText: section.name,
          },
          ...rows.map((row, index) => ({
            id: `line-${row.id}`,
            sectionId: section.id,
            lineItemId: row.id,
            label: row.title.trim() || `Line ${index + 1}`,
            detail: section.name,
            searchText: `${row.title} ${row.description} ${section.name}`,
          })),
        ];
      }),
    [itemsByCode, outlineSections]
  );

  const renderSectionMenu = React.useCallback(
    ({
      menuKey,
      insertAfterCode,
      label,
      ariaLabel,
      align = "start",
    }: {
      menuKey: string;
      insertAfterCode?: string | null;
      label: string;
      ariaLabel: string;
      align?: "start" | "center" | "end";
    }): React.ReactElement => (
      <EstimateAddSectionMenu
        disabled={disabled}
        canAddSection={canAddSection}
        recentSections={recentSections}
        existingSectionNames={existingSectionNames}
        open={openSectionMenuKey === menuKey}
        onOpenChange={(nextOpen) => setOpenSectionMenuKey(nextOpen ? menuKey : null)}
        triggerLabel={label}
        triggerAriaLabel={ariaLabel}
        align={align}
        reserveSpaceWhenOpen={menuKey !== "toolbar"}
        onFocusExisting={focusExistingSection}
        onAddCustom={(title) => addCustomSection(title, insertAfterCode)}
        onAddBlank={() => addBlankSection(insertAfterCode)}
        onAddTemplate={(name) => addSectionFromTemplate(name, insertAfterCode)}
        onAddRecent={(entry) => addSectionFromRecent(entry, insertAfterCode)}
      />
    ),
    [
      addBlankSection,
      addCustomSection,
      addSectionFromRecent,
      addSectionFromTemplate,
      canAddSection,
      disabled,
      existingSectionNames,
      focusExistingSection,
      openSectionMenuKey,
      recentSections,
    ]
  );

  return (
    <section className={EB.section}>
      <div className={ebGlassPanel("eb-scope-work-panel")}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className={EB.scopeHeading}>Scope of work</h2>
            <p className={EB.scopeSubtitle}>Proposal sections and line totals</p>
          </div>
        </div>
        {lineItemsError ? (
          <p className="mb-3 text-xs text-muted-foreground">{lineItemsError}</p>
        ) : null}

        <EstimateScopeToolbar
          sections={outlineSections}
          searchEntries={scopeSearchEntries}
          onCollapseAll={collapseAllSections}
          onExpandAll={expandAllSections}
          onRevealSection={(sectionId) =>
            setCollapsedSections((previous) => ({ ...previous, [sectionId]: false }))
          }
          onActiveSectionChange={setActiveSectionCode}
          addSectionControl={renderSectionMenu({
            menuKey: "toolbar",
            label: "Add Section",
            ariaLabel: "Add Section",
            align: "end",
          })}
        />
        <div className="eb-scope-workspace-grid">
          <div className="eb-scope-builder-region min-w-0">
            {/* Mobile: sections with collapse */}
            <div className="lg:hidden">
              {orderedSectionCodes.length === 0 ? (
                <div className={cn(EB.scopeEmpty, "py-6")}>
                  <p className={EB.scopeEmptyMessage}>No line items yet.</p>
                </div>
              ) : (
                orderedSectionCodes.map((code) => {
                  const displayName = sectionDisplayName(code);
                  const catalogName = catalogNameByCode.get(code) ?? displayName;
                  const rows = itemsByCode[code] ?? [];
                  const sectionSubtotal = rows.reduce((s, li) => s + editorLineTotal(li), 0);
                  const collapsed = isSectionCollapsed(code);
                  return (
                    <div
                      key={code}
                      data-estimate-section-mobile-id={code}
                      className={cn(
                        EB.scopeSectionMobile,
                        activeSectionCode === code && "eb-scope-section-current",
                        highlightSectionCode === code && EB.scopeSectionInserted
                      )}
                    >
                      <ScopeSectionHeader
                        code={code}
                        catalogName={catalogName}
                        displayName={displayName}
                        itemCount={rows.length}
                        sectionSubtotal={sectionSubtotal}
                        collapsed={collapsed}
                        onToggleCollapse={() => toggleSectionCollapsed(code)}
                        onDisplayNameChange={(name) => setCategoryName(code, name)}
                        onAddLine={
                          disabled
                            ? undefined
                            : () => {
                                setCollapsedSections((previous) => ({
                                  ...previous,
                                  [code]: false,
                                }));
                                addLineItem(code);
                              }
                        }
                        addLineAriaLabel={`Add line to ${displayName}`}
                        disabled={disabled}
                      />
                      <ScopeSectionCollapsibleBody collapsed={collapsed}>
                        <div className="space-y-3 pt-2">
                          {rows.map((item) => {
                            const rowIndex =
                              flatWithIndex.find((f) => f.item.id === item.id)?.rowIndex ?? 0;
                            return (
                              <div key={item.id} data-estimate-line-item-id={item.id}>
                                <EstimateLineItemMobileCard
                                  item={item}
                                  rowIndex={rowIndex}
                                  disabled={disabled}
                                  submitAttempted={submitAttempted}
                                  isLastRow={item.id === rows[rows.length - 1]?.id}
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
                                  onEnterAddNext={() => handleEnterAddNext(item.id, code)}
                                  currentSectionCode={code}
                                  moveSectionOptions={orderedSectionCodes.map((sectionCode) => ({
                                    code: sectionCode,
                                    label: sectionDisplayName(sectionCode),
                                  }))}
                                  onMoveToSection={(nextCode) =>
                                    updateItem(item.id, { costCode: nextCode })
                                  }
                                />
                              </div>
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
                      {!disabled ? (
                        <div className={EB.addNextSectionRow}>
                          {renderSectionMenu({
                            menuKey: `mobile:${code}`,
                            insertAfterCode: code,
                            label: "Add Next Section",
                            ariaLabel: `Add Next Section after ${displayName}`,
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
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
                  className="eb-scope-sections-list hidden flex-col lg:flex"
                  data-section-dragging={sectionDragging ? "true" : undefined}
                >
                  {orderedSectionCodes.map((code) => {
                    const displayName = sectionDisplayName(code);
                    const catalogName = catalogNameByCode.get(code) ?? displayName;
                    const rows = itemsByCode[code] ?? [];
                    const sectionSubtotal = rows.reduce((s, li) => s + editorLineTotal(li), 0);
                    const collapsed = isSectionCollapsed(code);
                    return (
                      <EstimateScopeSortableSection
                        key={code}
                        id={code}
                        disabled={disabled}
                        isDropTarget={overSectionId === code}
                        className={cn(
                          "transition-colors duration-150",
                          activeSectionCode === code && "eb-scope-section-current",
                          highlightSectionCode === code && EB.scopeSectionInserted
                        )}
                      >
                        {(dragHandle) => (
                          <>
                            <ScopeSectionHeader
                              code={code}
                              catalogName={catalogName}
                              displayName={displayName}
                              itemCount={rows.length}
                              sectionSubtotal={sectionSubtotal}
                              collapsed={collapsed}
                              onToggleCollapse={() => toggleSectionCollapsed(code)}
                              onDisplayNameChange={(name) => setCategoryName(code, name)}
                              dragHandle={dragHandle}
                              onAddLine={
                                disabled
                                  ? undefined
                                  : () => {
                                      setCollapsedSections((previous) => ({
                                        ...previous,
                                        [code]: false,
                                      }));
                                      addLineItem(code);
                                    }
                              }
                              addLineAriaLabel={`Add line to ${displayName}`}
                              disabled={disabled}
                            />
                            <ScopeSectionCollapsibleBody collapsed={collapsed}>
                              <div className="eb-scope-section-lines flex flex-col">
                                <EstimateLineItemGridHeader />
                                {rows.map((row, rowIndexInCat) => {
                                  const globalIdx =
                                    flatWithIndex.find((f) => f.item.id === row.id)?.rowIndex ??
                                    rowIndexInCat + 1;
                                  return (
                                    <div
                                      key={row.id}
                                      className={EB.lineItemCard}
                                      data-estimate-line-item-id={row.id}
                                    >
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
                                                step={0.01}
                                                inputMode="decimal"
                                                value={row.qty}
                                                onChange={(e) =>
                                                  updateItem(row.id, {
                                                    qty: Math.max(0, Number(e.target.value) || 0),
                                                  })
                                                }
                                                onWheel={(event) => event.currentTarget.blur()}
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
                                                EB.linePricingMeasure
                                              )}
                                            >
                                              <span
                                                className={cn(EB.readLabel, EB.lineMeasureLabel)}
                                              >
                                                Unit
                                              </span>
                                              <Input
                                                type="text"
                                                value={row.unit}
                                                onChange={(e) =>
                                                  updateItem(row.id, { unit: e.target.value })
                                                }
                                                className={ebInput(
                                                  `h-8 min-h-8 w-full px-2 ${EB.lineMeasureInput}`
                                                )}
                                                aria-label={`Line item ${globalIdx} unit`}
                                                placeholder="EA"
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
                                                inputMode="decimal"
                                                value={row.unitPrice}
                                                onChange={(e) =>
                                                  updateItem(row.id, {
                                                    unitPrice: Math.max(
                                                      0,
                                                      Number(e.target.value) || 0
                                                    ),
                                                  })
                                                }
                                                onKeyDown={(e) => {
                                                  if (shouldCommitEstimateLineFromPrice(e)) {
                                                    e.preventDefault();
                                                    handleEnterAddNext(row.id, code);
                                                  }
                                                }}
                                                onWheel={(event) => event.currentTarget.blur()}
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
                                                <span
                                                  className={cn(EB.readLabel, EB.lineTotalLabel)}
                                                >
                                                  Total
                                                </span>
                                                <div
                                                  className={cn(
                                                    EB.linePricingTotal,
                                                    EB.lineTotalAmount
                                                  )}
                                                >
                                                  <span
                                                    className={cn(EB.lineTotal, "leading-none")}
                                                  >
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
                                                currentStatus={
                                                  row.status ?? DEFAULT_LINE_ITEM_STATUS
                                                }
                                                onSetStatus={(status: EstimateLineItemStatus) =>
                                                  updateItem(row.id, { status })
                                                }
                                                showSaveAsReusable
                                                onSaveAsReusable={() => handleSaveAsReusable(row)}
                                                currentSectionCode={code}
                                                moveSectionOptions={orderedSectionCodes.map(
                                                  (sectionCode) => ({
                                                    code: sectionCode,
                                                    label: sectionDisplayName(sectionCode),
                                                  })
                                                )}
                                                onMoveToSection={(nextCode) =>
                                                  updateItem(row.id, { costCode: nextCode })
                                                }
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
                            {!disabled ? (
                              <div className={EB.addNextSectionRow}>
                                {renderSectionMenu({
                                  menuKey: `desktop:${code}`,
                                  insertAfterCode: code,
                                  label: "Add Next Section",
                                  ariaLabel: `Add Next Section after ${displayName}`,
                                })}
                              </div>
                            ) : null}
                          </>
                        )}
                      </EstimateScopeSortableSection>
                    );
                  })}
                  {codesWithItems.length === 0 && !disabled ? (
                    <div className={EB.scopeEmpty}>
                      <p className={EB.scopeEmptyMessage}>
                        No line items yet. Add a section to begin.
                      </p>
                    </div>
                  ) : null}
                </div>
              </SortableContext>
            </DndContext>
            {!disabled && orderedSectionCodes.length > 0 ? (
              <div className={cn(EB.addNextSectionRow, EB.addFinalSectionRow)}>
                {renderSectionMenu({
                  menuKey: "final",
                  insertAfterCode: orderedSectionCodes[orderedSectionCodes.length - 1],
                  label: "Add Final Section",
                  ariaLabel: "Add Final Section",
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

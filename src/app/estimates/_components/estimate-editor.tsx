"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { InlineLoading } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CostCode,
  EstimateItemRow,
  EstimateMetaRecord,
  EstimateSummaryResult,
  PaymentScheduleItem,
  PaymentScheduleTemplate,
} from "@/lib/data";
import { estimateLineTotal, groupEstimateItemsByCategoryId } from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveEstimateMetaAction,
  addLineItemAction,
  addLineItemCatalogInlineAction,
  createCustomEstimateCategoryAction,
  updateLineItemAction,
  updateLineItemInlineAction,
  deleteLineItemAction,
  duplicateLineItemAction,
  addPaymentMilestoneAction,
  updatePaymentMilestoneAction,
  deletePaymentMilestoneAction,
  markPaymentMilestonePaidAction,
  reorderPaymentScheduleAction,
  applyPaymentTemplateAction,
  createPaymentTemplateAction,
  reorderEstimateCategoriesAction,
} from "../[id]/actions";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Copy,
  Trash2,
  GripVertical,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EstimatePaymentSchedule } from "./estimate-payment-schedule";
import { LineItemDescriptionBodyPreview } from "./line-item-description-body-preview";
import {
  EstimateSectionTitleMenu,
  type EstimateSectionOption,
} from "./estimate-section-title-menu";
import type { LineItemDescriptionRichTextHandle } from "./line-item-description-rich-text";
import { formatEstimateCurrency, roundEstimateCurrencyValue } from "./estimate-currency";
import { EstimateBuilderSummary } from "./estimate-builder-summary";
import { EstimateBuilderAdvanced } from "./estimate-builder-advanced";
import { EstimateEditCustomerSection } from "./estimate-edit-customer-section";
import { EB, ebGlassPanel, ebGlassScope, ebInput } from "./estimate-builder-ui";
import { EstimateLineItemsToolbar } from "./estimate-line-items-toolbar";
import { EstimateLineItemPersistedMobile } from "./estimate-line-item-persisted-mobile";

/** TipTap must not load on the server — Next 14 can emit a broken `vendor-chunks/@tiptap.js` ref and 500 the page. */
const LineItemDescriptionRichText = dynamic(
  () => import("./line-item-description-rich-text").then((m) => m.LineItemDescriptionRichText),
  {
    ssr: false,
    loading: () => <div className="min-h-[140px] rounded-sm border border-border/60" aria-hidden />,
  }
);

function cssEscapeAttrSelector(value: string): string {
  const winCss =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS
      : undefined;
  if (winCss?.escape) return winCss.escape(value);
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function SortableCategorySection({
  id,
  children,
  highlightFlash = false,
  isSelectedCategory = false,
}: {
  id: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
  /** Brief background pulse after creating this category (UX). */
  highlightFlash?: boolean;
  /** Last category created / explicitly selected (cost code). */
  isSelectedCategory?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandle = (
    <button
      type="button"
      className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/50 active:cursor-grabbing"
      aria-label="Reorder section"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      data-estimate-section-id={id}
      aria-current={isSelectedCategory ? "true" : undefined}
      style={style}
      className={cn(
        "border-b border-border/10 transition-all duration-300",
        isDragging && "opacity-55 relative z-[2]",
        highlightFlash && "bg-primary/10 dark:bg-primary/15"
      )}
    >
      {children(dragHandle)}
    </div>
  );
}

export type EstimateEditorProps = {
  estimateId: string;
  estimateNumber: string;
  status: string;
  meta: EstimateMetaRecord;
  items: EstimateItemRow[];
  /** Persisted estimate_categories rows (`order_index` from DB drives section order). */
  estimateCategories: { costCode: string; displayName: string; orderIndex?: number }[];
  categoryNames: Record<string, string>;
  costCodes: CostCode[];
  summary: EstimateSummaryResult | null;
  paymentSchedule: PaymentScheduleItem[];
  paymentTemplates?: PaymentScheduleTemplate[];
  /** When true, enable editing in the editor UI. */
  editing?: boolean;
  /** On /estimates/[id], false so Cost Breakdown stays higher after save. */
  defaultInfoExpanded?: boolean;
  /** Incremented after header Save succeeds — collapses Client / Project details. */
  infoCollapseNonce?: number;
  /** Incremented after header Save succeeds — collapses all Cost Breakdown categories (edit mode). */
  costBreakdownCollapseNonce?: number;
};

export function EstimateEditor({
  estimateId,
  estimateNumber,
  status,
  meta,
  items,
  estimateCategories,
  categoryNames,
  costCodes,
  summary,
  paymentSchedule = [],
  paymentTemplates = [],
  editing = false,
  defaultInfoExpanded = false,
  infoCollapseNonce = 0,
  costBreakdownCollapseNonce = 0,
}: EstimateEditorProps) {
  const [infoOpen, setInfoOpen] = React.useState(defaultInfoExpanded);
  const isLocked = !["Draft", "Sent"].includes(status);
  const isReadOnly = isLocked || !editing;
  const today = new Date().toISOString().slice(0, 10);
  const { toast } = useToast();
  const router = useRouter();

  /** Header Save looks up #estimate-meta-form; it only mounts when this section is expanded. */
  React.useEffect(() => {
    if (editing) setInfoOpen(true);
  }, [editing]);

  React.useEffect(() => {
    if (!editing) return;
    const form = document.getElementById("estimate-meta-form");
    if (!form) return;
    const markDirty = (): void => {
      window.dispatchEvent(new Event("estimate-editor-dirty"));
    };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
    };
  }, [editing, infoOpen]);

  React.useEffect(() => {
    if (!infoCollapseNonce) return;
    setInfoOpen(false);
  }, [infoCollapseNonce]);

  const [localCategoryNames, setLocalCategoryNames] = React.useState<Record<string, string>>(
    () => ({ ...categoryNames })
  );
  React.useEffect(() => {
    setLocalCategoryNames((prev) => {
      const next = { ...prev };
      for (const [code, name] of Object.entries(categoryNames)) {
        const trimmed = String(name ?? "").trim();
        if (trimmed) next[code] = trimmed;
      }
      return next;
    });
  }, [categoryNames]);

  const catalogNameByCode = React.useMemo(
    () => Object.fromEntries(costCodes.map((c) => [c.code, c.name])) as Record<string, string>,
    [costCodes]
  );

  /** Local ordering for line items (drag-and-drop within category); synced from server `items` on refresh. */
  const [localItems, setLocalItems] = React.useState(items);
  React.useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const sectionDropdownOptions = React.useMemo((): EstimateSectionOption[] => {
    const codes = new Set<string>();
    for (const c of costCodes) codes.add(c.code);
    for (const ec of estimateCategories) codes.add(ec.costCode);
    for (const it of localItems) codes.add(it.costCode);
    return Array.from(codes)
      .map((code) => ({
        code,
        label: (localCategoryNames[code] ?? catalogNameByCode[code] ?? "").trim() || "Section",
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [costCodes, estimateCategories, localItems, localCategoryNames, catalogNameByCode]);

  const getCategoryDisplayNameHint = React.useCallback(
    (code: string) =>
      (localCategoryNames[code] ?? catalogNameByCode[code] ?? "").trim() || "Section",
    [localCategoryNames, catalogNameByCode]
  );

  const estimateCategoriesForGroup = React.useMemo(
    () =>
      estimateCategories.map((c) => ({
        costCode: c.costCode,
        displayName: c.displayName,
        orderIndex: c.orderIndex,
      })),
    [estimateCategories]
  );

  const baseCostBreakdownSections = React.useMemo(
    () => groupEstimateItemsByCategoryId(localItems, estimateCategoriesForGroup, catalogNameByCode),
    [localItems, estimateCategoriesForGroup, catalogNameByCode]
  );

  const [localCategorySectionOrder, setLocalCategorySectionOrder] = React.useState<string[] | null>(
    null
  );

  const categoriesSyncKey = React.useMemo(
    () => estimateCategories.map((c) => `${c.costCode}:${c.orderIndex ?? 0}`).join("|"),
    [estimateCategories]
  );

  React.useEffect(() => {
    setLocalCategorySectionOrder(null);
  }, [categoriesSyncKey]);

  const costBreakdownSections = React.useMemo(() => {
    if (!localCategorySectionOrder?.length) return baseCostBreakdownSections;
    const byId = new Map(baseCostBreakdownSections.map((s) => [s.categoryId, s]));
    const out: typeof baseCostBreakdownSections = [];
    const seen = new Set<string>();
    for (const id of localCategorySectionOrder) {
      const s = byId.get(id);
      if (s) {
        out.push(s);
        seen.add(id);
      }
    }
    for (const s of baseCostBreakdownSections) {
      if (!seen.has(s.categoryId)) out.push(s);
    }
    return out;
  }, [baseCostBreakdownSections, localCategorySectionOrder]);

  const costBreakdownSectionIdsKey = React.useMemo(
    () => costBreakdownSections.map((s) => s.categoryId).join("|"),
    [costBreakdownSections]
  );

  /** Which cost breakdown `<details>` are open (edit mode only; cost code = id). */
  const [expandedCategoryIds, setExpandedCategoryIds] = React.useState<string[]>([]);
  const prevCostBreakdownSectionIdsKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const ids = costBreakdownSectionIdsKey.length ? costBreakdownSectionIdsKey.split("|") : [];
    if (prevCostBreakdownSectionIdsKeyRef.current === null) {
      prevCostBreakdownSectionIdsKeyRef.current = costBreakdownSectionIdsKey;
      if (ids.length) setExpandedCategoryIds([...ids]);
      return;
    }
    if (costBreakdownSectionIdsKey === prevCostBreakdownSectionIdsKeyRef.current) return;
    const oldIds = prevCostBreakdownSectionIdsKeyRef.current.split("|").filter(Boolean);
    const oldSet = new Set(oldIds);
    const newOnes = ids.filter((id) => !oldSet.has(id));
    prevCostBreakdownSectionIdsKeyRef.current = costBreakdownSectionIdsKey;
    setExpandedCategoryIds((prev) => {
      const idSet = new Set(ids);
      const base = prev.filter((id) => idSet.has(id));
      if (newOnes.length === 0) return base;
      if (prev.length === 0) return [...newOnes];
      return [...base, ...newOnes];
    });
  }, [costBreakdownSectionIdsKey]);

  React.useEffect(() => {
    if (!costBreakdownCollapseNonce) return;
    setExpandedCategoryIds([]);
  }, [costBreakdownCollapseNonce]);

  const [pendingSelectNewCategory, setPendingSelectNewCategory] = React.useState<{
    code: string;
    displayName: string;
  } | null>(null);
  const consumePendingSelectNewCategory = React.useCallback(
    () => setPendingSelectNewCategory(null),
    []
  );

  /** Cost code of the category treated as selected after create (same id as `categoryId` in breakdown). */
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  /** Wait until the new section exists in the list, then scroll + flash. */
  const [categoryScrollTargetCode, setCategoryScrollTargetCode] = React.useState<string | null>(
    null
  );
  const [flashHighlightCategoryId, setFlashHighlightCategoryId] = React.useState<string | null>(
    null
  );

  React.useLayoutEffect(() => {
    if (!categoryScrollTargetCode) return;
    const target = categoryScrollTargetCode;
    if (!costBreakdownSections.some((s) => s.categoryId === target)) return;

    const el = document.querySelector<HTMLElement>(
      `[data-estimate-section-id="${cssEscapeAttrSelector(target)}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashHighlightCategoryId(target);
    setCategoryScrollTargetCode(null);
    const t = window.setTimeout(() => setFlashHighlightCategoryId(null), 1000);
    return () => window.clearTimeout(t);
  }, [categoryScrollTargetCode, costBreakdownSections]);

  const handleNewCategoryCreated = React.useCallback((code: string, displayName: string) => {
    setLocalCategoryNames((prev) => ({ ...prev, [code]: displayName }));
    setSelectedCategoryId(code);
    setPendingSelectNewCategory({ code, displayName });
    setCategoryScrollTargetCode(code);
    setExpandedCategoryIds((prev) => (prev.includes(code) ? prev : [...prev, code]));
  }, []);

  const lineItemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const categorySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCategoryDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = costBreakdownSections.map((s) => s.categoryId);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextOrder = arrayMove(ids, oldIndex, newIndex);
      setLocalCategorySectionOrder(nextOrder);
      const nameMap: Record<string, string> = {};
      for (const id of nextOrder) {
        const s = baseCostBreakdownSections.find((x) => x.categoryId === id);
        const dn = localCategoryNames[id] ?? catalogNameByCode[id] ?? s?.title ?? id;
        nameMap[id] = dn;
      }
      const res = await reorderEstimateCategoriesAction(estimateId, nextOrder, nameMap);
      if (res.ok) {
        syncRouterNonBlocking(router);
      } else {
        toast({
          title: "Could not save section order",
          description: res.error ?? "Try again.",
          variant: "error",
        });
        setLocalCategorySectionOrder(null);
      }
    },
    [
      costBreakdownSections,
      baseCostBreakdownSections,
      localCategoryNames,
      catalogNameByCode,
      estimateId,
      router,
      toast,
    ]
  );

  const handleLineItemsDragEnd = React.useCallback((categoryId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalItems((prev) => {
      const inCat = prev.filter((i) => i.costCode === categoryId);
      const oldIndex = inCat.findIndex((i) => i.id === active.id);
      const newIndex = inCat.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const reordered = arrayMove(inCat, oldIndex, newIndex);
      const q = [...reordered];
      return prev.map((it) => (it.costCode === categoryId ? q.shift()! : it));
    });
  }, []);

  const markupPct = ((meta.overheadPct + meta.profitPct) * 100).toFixed(1);

  /** Which line item id has the description modal open (`null` = closed). */
  const [editingItem, setEditingItem] = React.useState<string | null>(null);
  const [modalItemName, setModalItemName] = React.useState("");
  const [modalItemDescription, setModalItemDescription] = React.useState("");
  const [descModalSaving, setDescModalSaving] = React.useState(false);
  const lineDescEditorRef = React.useRef<LineItemDescriptionRichTextHandle | null>(null);
  const lineLiveValuesRef = React.useRef<
    Record<string, () => { qty: number; unit: string; unitCost: number; markupPct: number }>
  >({});
  const lineDescriptionApplyRef = React.useRef<
    Record<string, (name: string, desc: string) => void>
  >({});

  const openItemDescriptionModal = React.useCallback(
    (itemId: string, name: string, description: string) => {
      setEditingItem(itemId);
      setModalItemName(name);
      setModalItemDescription(description);
    },
    []
  );

  const handleItemDescriptionDialogOpenChange = React.useCallback((open: boolean) => {
    if (!open) setEditingItem(null);
  }, []);

  const handleSaveItemDescription = React.useCallback(async () => {
    if (!editingItem) return;
    setDescModalSaving(true);
    try {
      const getLive = lineLiveValuesRef.current[editingItem];
      const live = getLive ? getLive() : null;
      const row = localItems.find((i) => i.id === editingItem);
      const qty = live?.qty ?? row?.qty ?? 0;
      const unit = live?.unit ?? row?.unit ?? "EA";
      const unitCost = live?.unitCost ?? row?.unitCost ?? 0;
      const markupPctVal = live?.markupPct ?? row?.markupPct ?? 0;
      const descBody = lineDescEditorRef.current?.getValue() ?? modalItemDescription;
      const combined = descBody.trim() ? `${modalItemName}\n${descBody}` : modalItemName;
      const fd = new FormData();
      fd.set("estimateId", estimateId);
      fd.set("itemId", editingItem);
      fd.set("desc", combined);
      fd.set("qty", String(qty));
      fd.set("unit", unit);
      fd.set("unitCost", String(unitCost));
      fd.set("markupPct", String(markupPctVal * 100));
      const res = await updateLineItemInlineAction(fd);
      if (res.ok) {
        lineDescriptionApplyRef.current[editingItem]?.(modalItemName, descBody);
        setEditingItem(null);
      } else {
        toast({
          title: "Save failed",
          description: res.error ?? "Please try again.",
          variant: "error",
        });
      }
    } finally {
      setDescModalSaving(false);
    }
  }, [editingItem, modalItemName, modalItemDescription, estimateId, localItems, toast]);

  const flatPersistedRows = React.useMemo(() => {
    let idx = 0;
    const out: {
      row: EstimateItemRow;
      categoryId: string;
      rowIndex: number;
    }[] = [];
    for (const section of costBreakdownSections) {
      for (const row of section.rows) {
        idx += 1;
        out.push({ row, categoryId: section.categoryId, rowIndex: idx });
      }
    }
    return out;
  }, [costBreakdownSections]);

  const lastPersistedRowId = flatPersistedRows[flatPersistedRows.length - 1]?.row.id;

  return (
    <React.Fragment>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10 lg:items-start">
        <div className="min-w-0 space-y-5 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-0">
          <EstimateEditCustomerSection
            meta={meta}
            estimateId={estimateId}
            estimateNumber={estimateNumber}
            status={status}
            today={today}
            infoOpen={infoOpen}
            onToggleInfo={() => setInfoOpen(!infoOpen)}
            isReadOnly={isReadOnly}
            markupPct={markupPct}
            tax={summary?.tax ?? 0}
            discount={summary?.discount ?? 0}
            saveEstimateMetaAction={saveEstimateMetaAction}
          />

          <section className={EB.section}>
            <div className={ebGlassPanel()}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className={EB.scopeHeading}>Scope of work</h2>
                  <p className={EB.scopeSubtitle}>Line items grouped by section</p>
                </div>
                {!isReadOnly ? (
                  <EstimateLineItemsToolbar
                    onAddSection={() => {
                      document.getElementById("estimate-add-section")?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                  />
                ) : null}
              </div>

              <div className="mb-4 space-y-3 md:hidden">
                {flatPersistedRows.map(({ row, categoryId, rowIndex }) => (
                  <EstimateLineItemPersistedMobile
                    key={row.id}
                    row={row}
                    rowIndex={rowIndex}
                    estimateId={estimateId}
                    categoryId={categoryId}
                    isReadOnly={isReadOnly}
                    updateLineItemAction={updateLineItemAction}
                    duplicateLineItemAction={duplicateLineItemAction}
                    deleteLineItemAction={deleteLineItemAction}
                    onOpenDescriptionEditor={openItemDescriptionModal}
                    lineLiveValuesRef={lineLiveValuesRef}
                    lineDescriptionApplyRef={lineDescriptionApplyRef}
                    isLastRow={row.id === lastPersistedRowId}
                    onEnterAddNext={
                      !isReadOnly && row.id === lastPersistedRowId
                        ? () => {
                            void addLineItemCatalogInlineAction(
                              estimateId,
                              categoryId,
                              getCategoryDisplayNameHint(categoryId)
                            ).then((res) => {
                              if (res.ok) syncRouterNonBlocking(router);
                            });
                          }
                        : undefined
                    }
                  />
                ))}
              </div>

              <div className="hidden md:block">
                {(() => {
                  const categoryNodes = costBreakdownSections.map(
                    ({ categoryId, title, rows, sectionTotal }) => {
                      const displayName =
                        localCategoryNames[categoryId] ?? catalogNameByCode[categoryId] ?? title;
                      const toggleCategory = (categoryIdToToggle: string) => {
                        setExpandedCategoryIds((prev) =>
                          prev.includes(categoryIdToToggle)
                            ? prev.filter((x) => x !== categoryIdToToggle)
                            : [...prev, categoryIdToToggle]
                        );
                      };
                      const categorySectionBody = (dragHandle: React.ReactNode | null) => (
                        <React.Fragment>
                          <summary
                            className={cn(EB.scopeBlockHeader, "list-none flex-wrap")}
                            onMouseDown={(e) => {
                              const el = e.target as HTMLElement;
                              if (el.closest("button, a[href], [role='button'], [role='menuitem']"))
                                return;
                              e.preventDefault();
                              toggleCategory(categoryId);
                            }}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {dragHandle}
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform shrink-0" />
                              {isReadOnly ? (
                                <span className={EB.scopeBlockTitle}>
                                  {displayName.trim() || "Section"}
                                </span>
                              ) : (
                                <EstimateSectionTitleMenu
                                  estimateId={estimateId}
                                  currentCostCode={categoryId}
                                  displayName={displayName}
                                  itemIds={rows.map((r) => r.id)}
                                  sectionOptions={sectionDropdownOptions}
                                  getDisplayNameHint={getCategoryDisplayNameHint}
                                  onMoved={(newCode) => {
                                    const idSet = new Set(rows.map((r) => r.id));
                                    setLocalItems((prev) =>
                                      prev.map((it) =>
                                        idSet.has(it.id) ? { ...it, costCode: newCode } : it
                                      )
                                    );
                                    setLocalCategoryNames((prev) => ({
                                      ...prev,
                                      [newCode]:
                                        prev[newCode] ??
                                        catalogNameByCode[newCode] ??
                                        getCategoryDisplayNameHint(newCode),
                                    }));
                                  }}
                                  onNameSaved={(code, name) =>
                                    setLocalCategoryNames((prev) => ({ ...prev, [code]: name }))
                                  }
                                  onSectionCreated={handleNewCategoryCreated}
                                />
                              )}
                            </div>
                            <span className={EB.scopeBlockTotal}>
                              {formatEstimateCurrency(sectionTotal)}
                            </span>
                          </summary>
                          <div className={EB.scopeTableWrap}>
                            <div className="overflow-x-auto">
                              {isReadOnly ? (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className={EB.lineTableHead}>
                                      <th className="text-left py-2 px-4 font-normal">
                                        Description
                                      </th>
                                      <th className="hidden md:table-cell text-right py-2 px-4 font-normal tabular-nums w-20">
                                        Qty
                                      </th>
                                      <th className="hidden md:table-cell text-right py-2 px-4 font-normal tabular-nums w-28">
                                        Unit price
                                      </th>
                                      <th className="text-right py-2 px-4 font-normal tabular-nums w-28">
                                        Total
                                      </th>
                                    </tr>
                                  </thead>
                                  {rows.map((row) => (
                                    <tbody key={row.id} className="group/line">
                                      <LineItemRow
                                        row={row}
                                        estimateId={estimateId}
                                        isLocked
                                        updateLineItemAction={updateLineItemAction}
                                        duplicateLineItemAction={duplicateLineItemAction}
                                        deleteLineItemAction={deleteLineItemAction}
                                        onOpenDescriptionEditor={openItemDescriptionModal}
                                        lineLiveValuesRef={lineLiveValuesRef}
                                        lineDescriptionApplyRef={lineDescriptionApplyRef}
                                      />
                                    </tbody>
                                  ))}
                                </table>
                              ) : (
                                <DndContext
                                  sensors={lineItemSensors}
                                  collisionDetection={closestCenter}
                                  onDragEnd={(e) => handleLineItemsDragEnd(categoryId, e)}
                                >
                                  <SortableContext
                                    items={rows.map((r) => r.id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className={EB.lineTableHead}>
                                          <th className="w-9 py-2 px-1" aria-label="Reorder" />
                                          <th className="text-left py-2 px-4 font-normal">
                                            Description
                                          </th>
                                          <th className="hidden md:table-cell text-right py-2 px-4 font-normal tabular-nums w-20">
                                            Qty
                                          </th>
                                          <th className="hidden md:table-cell text-right py-2 px-4 font-normal tabular-nums w-28">
                                            Unit price
                                          </th>
                                          <th className="text-right py-2 px-4 font-normal tabular-nums w-28">
                                            Total
                                          </th>
                                          <th className="w-20" />
                                        </tr>
                                      </thead>
                                      {rows.map((row) => (
                                        <SortableLineItemGroup
                                          key={row.id}
                                          row={row}
                                          estimateId={estimateId}
                                          updateLineItemAction={updateLineItemAction}
                                          duplicateLineItemAction={duplicateLineItemAction}
                                          deleteLineItemAction={deleteLineItemAction}
                                          onOpenDescriptionEditor={openItemDescriptionModal}
                                          lineLiveValuesRef={lineLiveValuesRef}
                                          lineDescriptionApplyRef={lineDescriptionApplyRef}
                                        />
                                      ))}
                                    </table>
                                  </SortableContext>
                                </DndContext>
                              )}
                            </div>
                            {!isReadOnly && (
                              <div className="px-3 py-2">
                                <form action={addLineItemAction} className="inline-block">
                                  <input type="hidden" name="estimateId" value={estimateId} />
                                  <input type="hidden" name="costCode" value={categoryId} />
                                  <button type="submit" className={EB.addLineLink}>
                                    <Plus className="h-3 w-3" aria-hidden />
                                    Add line
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      );

                      return isReadOnly ? (
                        <div key={categoryId} className={cn(EB.categoryGroup, "mb-4")}>
                          <details
                            className={cn("group", ebGlassScope())}
                            open={expandedCategoryIds.includes(categoryId)}
                          >
                            {categorySectionBody(null)}
                          </details>
                        </div>
                      ) : (
                        <SortableCategorySection
                          key={categoryId}
                          id={categoryId}
                          highlightFlash={flashHighlightCategoryId === categoryId}
                          isSelectedCategory={selectedCategoryId === categoryId}
                        >
                          {(dh) => (
                            <details
                              className={cn("group", ebGlassScope())}
                              open={expandedCategoryIds.includes(categoryId)}
                            >
                              {categorySectionBody(dh)}
                            </details>
                          )}
                        </SortableCategorySection>
                      );
                    }
                  );
                  return isReadOnly ? (
                    <>{categoryNodes}</>
                  ) : (
                    <DndContext
                      sensors={categorySensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => void handleCategoryDragEnd(e)}
                    >
                      <SortableContext
                        items={costBreakdownSections.map((s) => s.categoryId)}
                        strategy={verticalListSortingStrategy}
                      >
                        {categoryNodes}
                      </SortableContext>
                    </DndContext>
                  );
                })()}
                {!isReadOnly && (
                  <AddCategoryBlock
                    estimateId={estimateId}
                    allCategoryCodes={sectionDropdownOptions.map((o) => o.code)}
                    getCategoryDisplayName={getCategoryDisplayNameHint}
                    pendingSelectNewCategory={pendingSelectNewCategory}
                    onPendingSelectNewCategoryConsumed={consumePendingSelectNewCategory}
                    onPostCreateCategoryUx={handleNewCategoryCreated}
                  />
                )}
              </div>
            </div>
          </section>

          {!isReadOnly ? (
            <Dialog
              open={editingItem !== null}
              onOpenChange={handleItemDescriptionDialogOpenChange}
            >
              <DialogContent
                className={cn(
                  "gap-0 overflow-hidden !border-white/10 !bg-slate-950/70 p-0 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_40px_rgba(212,184,120,0.05),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:max-w-[520px]",
                  "rounded-2xl max-md:inset-x-3 max-md:top-[max(1rem,env(safe-area-inset-top))] max-md:max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] max-md:w-auto max-md:max-w-[calc(100vw-1.5rem)] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-2xl",
                  "[&>button]:right-4 [&>button]:top-4 [&>button]:rounded-full [&>button]:text-zinc-400 [&>button]:hover:bg-white/[0.08] [&>button]:hover:text-zinc-50 [&>button]:focus-visible:ring-amber-200/25"
                )}
              >
                <DialogHeader className="space-y-1 border-b border-white/[0.07] px-6 pb-4 pt-6 text-left">
                  <DialogTitle className="text-base font-semibold tracking-tight text-zinc-50">
                    Item Description
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-500">
                    Refine the line item name and customer-facing scope notes.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 px-6 py-5">
                  <div className="space-y-2">
                    <Label
                      htmlFor="estimate-line-desc-modal-name"
                      className="text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-400"
                    >
                      Name
                    </Label>
                    <Input
                      id="estimate-line-desc-modal-name"
                      value={modalItemName}
                      onChange={(e) => setModalItemName(e.target.value)}
                      placeholder="Line item name"
                      className={ebInput("h-10 rounded-lg text-sm")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-400">
                      Description
                    </Label>
                    <LineItemDescriptionRichText
                      editorRef={lineDescEditorRef}
                      key={editingItem ?? "closed"}
                      value={modalItemDescription}
                      onChange={setModalItemDescription}
                      disabled={descModalSaving}
                      placeholder="Optional details"
                    />
                  </div>
                </div>
                <DialogFooter className="mt-0 !border-t-white/[0.07] !bg-transparent px-6 pb-6 pt-4 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn("min-h-11 px-4", EB.portalGhostButton)}
                    onClick={() => setEditingItem(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("min-h-11 px-5 font-medium", EB.portalPrimaryButton)}
                    disabled={descModalSaving}
                    onClick={() => void handleSaveItemDescription()}
                  >
                    <SubmitSpinner loading={descModalSaving} className="mr-2" />
                    {descModalSaving ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          <EstimateBuilderAdvanced
            title="Payment schedule"
            defaultOpen={paymentSchedule.length > 0}
            className={cn(ebGlassPanel(), "mt-4")}
          >
            <EstimatePaymentSchedule
              estimateId={estimateId}
              paymentSchedule={paymentSchedule}
              estimateTotal={summary?.grandTotal ?? 0}
              isLocked={isReadOnly}
              paymentTemplates={paymentTemplates}
              addPaymentMilestoneAction={addPaymentMilestoneAction}
              updatePaymentMilestoneAction={updatePaymentMilestoneAction}
              deletePaymentMilestoneAction={deletePaymentMilestoneAction}
              markPaymentMilestonePaidAction={markPaymentMilestonePaidAction}
              reorderPaymentScheduleAction={reorderPaymentScheduleAction}
              applyPaymentTemplateAction={applyPaymentTemplateAction}
              createPaymentTemplateAction={createPaymentTemplateAction}
            />
          </EstimateBuilderAdvanced>
        </div>

        <aside className="hidden lg:block lg:pl-1">
          <EstimateBuilderSummary
            summary={summary}
            showInternal={editing && !isReadOnly}
            floating
          />
        </aside>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-4 py-4 lg:hidden",
          EB.glassMobileBar
        )}
        aria-label="Estimate total"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Total
          </span>
          <span
            className={cn(
              "text-[1.75rem] font-semibold leading-none tabular-nums tracking-tight",
              EB.goldTotal
            )}
          >
            {summary ? formatEstimateCurrency(summary.grandTotal) : "—"}
          </span>
        </div>
      </div>
    </React.Fragment>
  );
}

function SortableLineItemGroup({
  row,
  estimateId,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
  onOpenDescriptionEditor,
  lineLiveValuesRef,
  lineDescriptionApplyRef,
}: {
  row: EstimateItemRow;
  estimateId: string;
  updateLineItemAction: (fd: FormData) => Promise<void>;
  duplicateLineItemAction: (fd: FormData) => Promise<void>;
  deleteLineItemAction: (fd: FormData) => Promise<void>;
  onOpenDescriptionEditor: (itemId: string, name: string, description: string) => void;
  lineLiveValuesRef: React.MutableRefObject<
    Record<string, () => { qty: number; unit: string; unitCost: number; markupPct: number }>
  >;
  lineDescriptionApplyRef: React.MutableRefObject<
    Record<string, (name: string, desc: string) => void>
  >;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <tbody ref={setNodeRef} style={style} className={cn("group/line", isDragging && "opacity-60")}>
      <LineItemRow
        row={row}
        estimateId={estimateId}
        isLocked={false}
        dragHandleProps={{ ...attributes, ...listeners }}
        updateLineItemAction={updateLineItemAction}
        duplicateLineItemAction={duplicateLineItemAction}
        deleteLineItemAction={deleteLineItemAction}
        onOpenDescriptionEditor={onOpenDescriptionEditor}
        lineLiveValuesRef={lineLiveValuesRef}
        lineDescriptionApplyRef={lineDescriptionApplyRef}
      />
    </tbody>
  );
}

function LineItemRow({
  row,
  estimateId,
  isLocked,
  dragHandleProps,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
  onOpenDescriptionEditor,
  lineLiveValuesRef,
  lineDescriptionApplyRef,
}: {
  row: EstimateItemRow;
  estimateId: string;
  isLocked: boolean;
  /** When set, first column is a drag handle (dnd-kit listeners + attributes on the button). */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  updateLineItemAction: (fd: FormData) => Promise<void>;
  duplicateLineItemAction: (fd: FormData) => Promise<void>;
  deleteLineItemAction: (fd: FormData) => Promise<void>;
  onOpenDescriptionEditor: (itemId: string, name: string, description: string) => void;
  lineLiveValuesRef: React.MutableRefObject<
    Record<string, () => { qty: number; unit: string; unitCost: number; markupPct: number }>
  >;
  lineDescriptionApplyRef: React.MutableRefObject<
    Record<string, (name: string, desc: string) => void>
  >;
}) {
  const [title, setTitle] = React.useState(() => {
    const i = row.desc.indexOf("\n");
    return i < 0 ? row.desc : row.desc.slice(0, i);
  });
  const [desc, setDesc] = React.useState(() => {
    const i = row.desc.indexOf("\n");
    return i < 0 ? "" : row.desc.slice(i + 1);
  });
  const [qty, setQty] = React.useState(row.qty);
  const [unit, setUnit] = React.useState(row.unit);
  const [unitCost, setUnitCost] = React.useState(roundEstimateCurrencyValue(row.unitCost));
  const combinedDesc = desc.trim() ? `${title}\n${desc}` : title;
  const formId = `line-${row.id}`;

  React.useLayoutEffect(() => {
    if (isLocked) return;
    const registry = lineLiveValuesRef.current;
    registry[row.id] = () => ({
      qty,
      unit,
      unitCost,
      markupPct: row.markupPct,
    });
    return () => {
      delete registry[row.id];
    };
  }, [isLocked, row.id, row.markupPct, qty, unit, unitCost, lineLiveValuesRef]);

  React.useLayoutEffect(() => {
    if (isLocked) return;
    const registry = lineDescriptionApplyRef.current;
    registry[row.id] = (name: string, body: string) => {
      setTitle(name);
      setDesc(body);
    };
    return () => {
      delete registry[row.id];
    };
  }, [isLocked, row.id, lineDescriptionApplyRef]);

  React.useEffect(() => {
    const i = row.desc.indexOf("\n");
    setTitle(i < 0 ? row.desc : row.desc.slice(0, i));
    setDesc(i < 0 ? "" : row.desc.slice(i + 1));
    setQty(row.qty);
    setUnit(row.unit);
    setUnitCost(roundEstimateCurrencyValue(row.unitCost));
  }, [row.id, row.desc, row.qty, row.unit, row.unitCost]);

  const lineTotalDisplay = React.useMemo(() => {
    if (isLocked) return estimateLineTotal(row);
    return estimateLineTotal({ ...row, qty, unit, unitCost });
  }, [isLocked, row, qty, unit, unitCost]);

  const colSpan = isLocked ? 4 : dragHandleProps ? 6 : 5;
  const showUnitInline = Boolean(unit.trim()) && unit.trim() !== "EA";

  return (
    <>
      <tr className={cn("hidden md:table-row group/line", EB.lineTableRow)}>
        {dragHandleProps ? (
          <td className="py-2 px-1 align-top w-9">
            <button
              type="button"
              {...dragHandleProps}
              className="flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/50 active:cursor-grabbing"
              aria-label="Drag to reorder line item"
            >
              <span className="select-none text-sm leading-none tabular-nums" aria-hidden>
                ≡
              </span>
            </button>
          </td>
        ) : null}
        <td className="py-2 px-4 align-top">
          {isLocked ? (
            <span className="font-medium">{title || row.desc}</span>
          ) : (
            <>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()}
                className={ebInput("font-medium")}
                placeholder="Description"
                aria-label="Line item description"
              />
            </>
          )}
        </td>
        <td className="hidden py-2 px-4 text-right align-top md:table-cell">
          {isLocked ? (
            row.qty
          ) : (
            <Input
              form={formId}
              type="number"
              name="qty"
              step="1"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value) || 0)}
              onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()}
              className={ebInput(`w-20 ${EB.inputNumeric} ${EB.inputMuted}`)}
              aria-label="Line item quantity"
            />
          )}
        </td>
        <td className="hidden py-2 px-4 text-right align-top md:table-cell">
          {isLocked ? (
            formatEstimateCurrency(row.unitCost)
          ) : (
            <Input
              form={formId}
              type="number"
              name="unitCost"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
              onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()}
              className={ebInput(`w-28 ${EB.inputNumeric} ${EB.inputMuted}`)}
              aria-label="Line item unit price"
            />
          )}
        </td>
        <td className={cn("py-3 px-4 align-top text-right", EB.lineTotal)}>
          {formatEstimateCurrency(lineTotalDisplay)}
        </td>
        {!isLocked && (
          <td className={cn("py-2 px-2 align-top", EB.lineRowActions)}>
            <div className="flex items-center justify-end gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-0 bg-transparent text-muted-foreground/50 shadow-none hover:bg-muted/40 hover:text-foreground"
                    aria-label="Line item options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36 p-2">
                  <Label
                    htmlFor={`${formId}-unit-menu`}
                    className="text-[10px] text-muted-foreground/60"
                  >
                    Unit
                  </Label>
                  <Input
                    id={`${formId}-unit-menu`}
                    form={formId}
                    name="unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    onBlur={() =>
                      (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()
                    }
                    className={ebInput("mt-1 h-7 w-full text-xs")}
                    placeholder="EA"
                    aria-label="Line item unit"
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              <form action={duplicateLineItemAction} className="inline">
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="itemId" value={row.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-0 bg-transparent text-muted-foreground/60 shadow-none hover:bg-muted/40 hover:text-foreground"
                  aria-label="Duplicate line item"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </form>
              <form action={deleteLineItemAction} className="inline">
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="itemId" value={row.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-0 bg-transparent text-muted-foreground/50 shadow-none hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Remove line item"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </td>
        )}
      </tr>
      <tr className="hidden border-b border-border/[0.07] md:table-row">
        <td colSpan={colSpan} className="py-1.5 px-4 align-top">
          {!isLocked ? (
            <form id={formId} action={updateLineItemAction} className="hidden" aria-hidden>
              <input type="hidden" name="estimateId" value={estimateId} />
              <input type="hidden" name="itemId" value={row.id} />
              <input type="hidden" name="desc" value={combinedDesc} />
              <input type="hidden" name="qty" value={qty} />
              <input type="hidden" name="unit" value={unit} />
              <input type="hidden" name="unitCost" value={unitCost} />
              <input type="hidden" name="markupPct" value={String(row.markupPct * 100)} />
            </form>
          ) : null}
          {isLocked ? (
            desc.trim() ? (
              <LineItemDescriptionBodyPreview
                body={desc}
                className="text-sm text-muted-foreground line-clamp-2 overflow-hidden"
              />
            ) : null
          ) : (
            <div className="flex min-h-[1.25rem] flex-wrap items-center gap-x-3 gap-y-0.5">
              <button
                type="button"
                onClick={() => onOpenDescriptionEditor(row.id, title, desc)}
                className={EB.lineDetailsLink}
              >
                {desc.trim() ? "Edit details" : "Add details"}
              </button>
              {showUnitInline ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/45">
                  <span className="sr-only">Unit</span>
                  <Input
                    form={formId}
                    name="unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    onBlur={() =>
                      (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()
                    }
                    className={ebInput("h-6 w-12 px-1 text-[11px]")}
                    placeholder="Unit"
                    aria-label="Line item unit"
                  />
                </span>
              ) : null}
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

function AddCategoryBlock({
  estimateId,
  allCategoryCodes,
  getCategoryDisplayName,
  pendingSelectNewCategory,
  onPendingSelectNewCategoryConsumed,
  onPostCreateCategoryUx,
}: {
  estimateId: string;
  allCategoryCodes: string[];
  getCategoryDisplayName: (code: string) => string;
  pendingSelectNewCategory?: { code: string; displayName: string } | null;
  onPendingSelectNewCategoryConsumed?: () => void;
  /** Scroll + highlight + bottom-bar selection after creating a category from this block. */
  onPostCreateCategoryUx?: (code: string, displayName: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const allCodesWithLabels = React.useMemo(
    () => allCategoryCodes.map((code) => ({ code, name: getCategoryDisplayName(code) })),
    [allCategoryCodes, getCategoryDisplayName]
  );
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [selectedCode, setSelectedCode] = React.useState<string | null>(null);
  /** When user uses “Create …”, store label for display + optional save with add category. */
  const [customCategoryLabel, setCustomCategoryLabel] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = React.useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const searchLower = deferredSearch.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      allCodesWithLabels.filter(
        (cc) => !searchLower || (cc.name && cc.name.toLowerCase().includes(searchLower))
      ),
    [allCodesWithLabels, searchLower]
  );
  const visibleOptions = filtered;
  const hasMore = false;
  const noMatch = search.trim().length > 0 && filtered.length === 0;
  const canInstantCreate = search.trim().length > 0 && filtered.length === 0;

  React.useEffect(() => {
    if (!pendingSelectNewCategory || !onPendingSelectNewCategoryConsumed) return;
    const { code, displayName } = pendingSelectNewCategory;
    setSelectedCode(code);
    setCustomCategoryLabel(displayName.trim() ? displayName.trim() : null);
    setSearch("");
    setOpen(false);
    onPendingSelectNewCategoryConsumed();
  }, [pendingSelectNewCategory, onPendingSelectNewCategoryConsumed]);

  React.useEffect(() => {
    setHighlightIndex(0);
  }, [search, open, canInstantCreate]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const item = el.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      const inContainer = containerRef.current?.contains(t) ?? false;
      const inMenu = listRef.current?.contains(t) ?? false;
      if (!inContainer && !inMenu) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const computeMenuPosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const desiredMax = 240;
    const padding = 12;
    const belowTop = rect.bottom + 4;
    const belowAvail = window.innerHeight - belowTop - padding;
    if (belowAvail >= 160) {
      setMenuPos({
        top: belowTop,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(desiredMax, belowAvail)),
      });
      return;
    }
    const aboveAvail = rect.top - padding;
    const maxHeight = Math.max(120, Math.min(desiredMax, aboveAvail));
    setMenuPos({
      top: Math.max(padding, rect.top - 4 - maxHeight),
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    computeMenuPosition();
    const onResize = () => computeMenuPosition();
    const onScroll = () => computeMenuPosition();
    window.addEventListener("resize", onResize);
    // capture=true so scroll inside overflow containers also repositions
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, computeMenuPosition]);

  const createWithName = React.useCallback(
    async (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      setBusy(true);
      try {
        const res = await createCustomEstimateCategoryAction(estimateId, trimmed);
        if (res.ok && res.costCode) {
          onPostCreateCategoryUx?.(res.costCode, trimmed);
          setSelectedCode(res.costCode);
          setCustomCategoryLabel(trimmed);
          setSearch("");
          setOpen(false);
          syncRouterNonBlocking(router);
          toast({ title: "Section created", variant: "success" });
        } else {
          toast({
            title: "Could not create section",
            description: res.error ?? "Try again.",
            variant: "error",
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [estimateId, onPostCreateCategoryUx, router, toast]
  );

  const handleInstantCreateCategory = () => {
    if (!canInstantCreate || busy) return;
    void createWithName(search);
  };

  const runAdd = React.useCallback(async () => {
    if (busy) return;
    const typedName = search.trim();
    if (typedName) {
      await createWithName(typedName);
      return;
    }
    if (selectedCode) {
      setBusy(true);
      try {
        const name = customCategoryLabel?.trim() ?? "";
        const res = await addLineItemCatalogInlineAction(estimateId, selectedCode, name);
        if (res.ok) {
          const displayLabel = name.trim() || getCategoryDisplayName(selectedCode) || selectedCode;
          onPostCreateCategoryUx?.(selectedCode, displayLabel);
          setSearch("");
          setSelectedCode(null);
          setCustomCategoryLabel(null);
          setOpen(false);
          syncRouterNonBlocking(router);
          toast({ title: "Section added", variant: "success" });
        } else {
          toast({
            title: "Could not add section",
            description: res.error ?? "Try again.",
            variant: "error",
          });
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    inputRef.current?.focus();
    setOpen(true);
    toast({
      title: "Enter a section name",
      description: "Type a name to create one, or pick a section from the list.",
      variant: "error",
    });
  }, [
    busy,
    selectedCode,
    customCategoryLabel,
    estimateId,
    onPostCreateCategoryUx,
    router,
    toast,
    search,
    createWithName,
    getCategoryDisplayName,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      if (e.key === "Enter") {
        e.preventDefault();
        void runAdd();
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (canInstantCreate && visibleOptions.length === 0) return;
      const max = visibleOptions.length - 1;
      setHighlightIndex((i) => (i < max ? i + 1 : i));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (search.trim().length > 0) {
        void runAdd();
        return;
      }
      const cc = visibleOptions[highlightIndex];
      if (cc) {
        setSelectedCode(cc.code);
        setCustomCategoryLabel(null);
        setSearch("");
        setOpen(false);
      }
    }
  };

  const handleSelect = (code: string) => {
    setSelectedCode(code);
    setCustomCategoryLabel(null);
    setSearch("");
    setOpen(false);
  };

  const selectedCategoryDisplayValue = React.useMemo(() => {
    if (!selectedCode) return search;
    return (customCategoryLabel ?? getCategoryDisplayName(selectedCode) ?? "").trim();
  }, [customCategoryLabel, getCategoryDisplayName, search, selectedCode]);

  return (
    <div id="estimate-add-section" ref={containerRef} className={EB.addSectionComposer}>
      <p className="eb-composer-hint mb-2">New section</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Label htmlFor="add-section-input" className={EB.label}>
            Section name
          </Label>
          <div ref={anchorRef} className="relative">
            <Input
              ref={inputRef}
              id="add-section-input"
              aria-label="Search or add section"
              type="text"
              value={open ? search : selectedCode ? selectedCategoryDisplayValue : search}
              onChange={(e) => {
                const next = e.target.value;
                setSearch(next);
                setOpen(true);
                // Typing a query means user is no longer committing to a previously selected code.
                if (selectedCode && next.trim().length > 0) {
                  setSelectedCode(null);
                  setCustomCategoryLabel(null);
                  return;
                }
                if (!next) {
                  setSelectedCode(null);
                  setCustomCategoryLabel(null);
                }
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Add or search section…"
              className={ebInput("h-8 pr-9")}
              autoComplete="off"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500">
              <ChevronDown className="h-4 w-4" />
            </span>
            {open && menuPos && typeof document !== "undefined"
              ? createPortal(
                  <ul
                    ref={listRef}
                    role="listbox"
                    style={{
                      position: "fixed",
                      top: menuPos.top,
                      left: menuPos.left,
                      width: menuPos.width,
                      maxHeight: menuPos.maxHeight,
                    }}
                    className={EB.commandMenu}
                  >
                    {visibleOptions.length === 0 && !canInstantCreate ? (
                      <li className="px-3 py-2 text-sm text-zinc-500">
                        {noMatch
                          ? "No matching section"
                          : allCodesWithLabels.length === 0
                            ? "Type a name to create a section"
                            : "No sections to add"}
                      </li>
                    ) : (
                      <>
                        {visibleOptions.map((cc, i) => (
                          <li
                            key={cc.code}
                            role="option"
                            aria-selected={highlightIndex === i}
                            className={cn(
                              EB.commandMenuItem,
                              highlightIndex === i && EB.commandMenuItemActive
                            )}
                            onMouseEnter={() => setHighlightIndex(i)}
                            onClick={() => handleSelect(cc.code)}
                          >
                            {cc.name}
                          </li>
                        ))}
                        {canInstantCreate ? (
                          <li
                            role="option"
                            aria-selected={
                              visibleOptions.length === 0
                                ? highlightIndex === 0
                                : highlightIndex === visibleOptions.length
                            }
                            className={cn(
                              EB.commandMenuItem,
                              "flex items-center gap-2",
                              (visibleOptions.length === 0
                                ? highlightIndex === 0
                                : highlightIndex === visibleOptions.length) &&
                                EB.commandMenuItemActive
                            )}
                            onMouseEnter={() => setHighlightIndex(visibleOptions.length)}
                            onClick={() => handleInstantCreateCategory()}
                          >
                            <Plus className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                            <span>Create &quot;{search.trim()}&quot;</span>
                          </li>
                        ) : null}
                      </>
                    )}
                    {hasMore && (
                      <li className="border-t border-white/[0.06] px-3 py-1.5 text-xs text-zinc-500">
                        Scroll for more ({filtered.length} total)
                      </li>
                    )}
                  </ul>,
                  document.body
                )
              : null}
          </div>
        </div>
        <button
          type="button"
          className={cn(EB.composerAddSection, "shrink-0 disabled:opacity-40")}
          disabled={busy || (!selectedCode && !search.trim())}
          onClick={() => void runAdd()}
        >
          {busy ? (
            <InlineLoading className="mr-2" size="md" aria-hidden />
          ) : (
            <Plus className="h-4 w-4 mr-2" aria-hidden />
          )}
          {busy ? "Adding…" : "Add Section"}
        </button>
      </div>
    </div>
  );
}

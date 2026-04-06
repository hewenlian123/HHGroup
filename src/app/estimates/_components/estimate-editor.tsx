"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
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
import { EstimateSummarySidebar } from "../[id]/estimate-summary-sidebar";
import { useToast } from "@/components/toast/toast-provider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveEstimateMetaAction,
  addLineItemAction,
  addLineItemCatalogInlineAction,
  createEstimateCategoryWithCodeAction,
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
import { ChevronRight, ChevronDown, Plus, Copy, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { EstimateStatusBadge } from "./estimate-status-badge";
import { EstimatePaymentSchedule } from "./estimate-payment-schedule";
import { LineItemDescriptionBodyPreview } from "./line-item-description-body-preview";
import { CostCategoryTitleMenu, type CostCategoryOption } from "./cost-category-title-menu";
import { pickNextUniqueCostCode } from "@/lib/estimate-cost-code-suggest";
import type { LineItemDescriptionRichTextHandle } from "./line-item-description-rich-text";

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
      aria-label="Reorder category"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      data-estimate-category-id={id}
      aria-current={isSelectedCategory ? "true" : undefined}
      style={style}
      className={cn(
        "border-b border-zinc-200 dark:border-border transition-all duration-300",
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

  const categoryDropdownOptions = React.useMemo((): CostCategoryOption[] => {
    const codes = new Set<string>();
    for (const c of costCodes) codes.add(c.code);
    for (const ec of estimateCategories) codes.add(ec.costCode);
    for (const it of localItems) codes.add(it.costCode);
    return Array.from(codes)
      .sort((a, b) => a.localeCompare(b))
      .map((code) => ({
        code,
        label: `${code} – ${localCategoryNames[code] ?? catalogNameByCode[code] ?? code}`,
      }));
  }, [costCodes, estimateCategories, localItems, localCategoryNames, catalogNameByCode]);

  const getCategoryDisplayNameHint = React.useCallback(
    (code: string) => localCategoryNames[code] ?? catalogNameByCode[code] ?? code,
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

  const categoryIdsWithItems = React.useMemo(
    () => new Set(localItems.map((i) => i.costCode)),
    [localItems]
  );

  const usedCostCodesOnEstimate = React.useMemo(() => {
    const s = new Set<string>();
    for (const it of localItems) s.add(it.costCode);
    for (const ec of estimateCategories) s.add(ec.costCode);
    return s;
  }, [localItems, estimateCategories]);

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
      `[data-estimate-category-id="${cssEscapeAttrSelector(target)}"]`
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
          title: "Could not save category order",
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
        lineDescriptionApplyRef.current[editingItem]?.(modalItemName, modalItemDescription);
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

  return (
    <React.Fragment>
      <div className="space-y-6">
        {/* Info bar + details */}
        <div className="border border-zinc-200 dark:border-border rounded-lg overflow-hidden bg-background">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200 dark:border-border bg-muted/20">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Client / Project</h2>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {meta.client.name} • {meta.project.name}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="btn-outline-ghost rounded-md h-8 text-muted-foreground hover:text-foreground"
              onClick={() => setInfoOpen(!infoOpen)}
            >
              {infoOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {infoOpen ? "Hide details" : "Edit details"}
            </Button>
          </div>
          <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Client
              </div>
              <div className="truncate font-medium text-foreground">{meta.client.name || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Project
              </div>
              <div className="truncate font-medium text-foreground">{meta.project.name || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Estimate #
              </div>
              <div className="truncate font-medium text-foreground tabular-nums">
                {estimateNumber}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Status
              </div>
              <div className="pt-0.5">
                <EstimateStatusBadge
                  status={status === "Converted" ? "Converted" : status}
                  label={status === "Converted" ? "Converted to Project" : undefined}
                  className="text-xs"
                />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Address
              </div>
              <div className="truncate text-muted-foreground">{meta.client.address || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Estimate Date
              </div>
              <div className="tabular-nums text-muted-foreground">{meta.estimateDate ?? today}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Valid Until
              </div>
              <div className="tabular-nums text-muted-foreground">{meta.validUntil ?? "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Sales
              </div>
              <div className="truncate text-muted-foreground">{meta.salesPerson ?? "—"}</div>
            </div>
          </div>

          {infoOpen && (
            <form
              id="estimate-meta-form"
              action={saveEstimateMetaAction}
              className="p-4 pt-0 space-y-4"
            >
              <input type="hidden" name="estimateId" value={estimateId} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="clientName" className="text-xs">
                    Client / Customer
                  </Label>
                  <Input
                    id="clientName"
                    name="clientName"
                    defaultValue={meta.client.name}
                    placeholder="Client or company name"
                    className="h-8 rounded-md text-sm"
                    readOnly={isReadOnly}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="projectName" className="text-xs">
                    Project
                  </Label>
                  <Input
                    id="projectName"
                    name="projectName"
                    defaultValue={meta.project.name}
                    placeholder="Project name"
                    className="h-8 rounded-md text-sm"
                    readOnly={isReadOnly}
                  />
                </div>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-border">
                <Label htmlFor="address" className="text-xs">
                  Address
                </Label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={meta.client.address}
                  placeholder="Site or client address"
                  className="h-8 rounded-md text-sm"
                  readOnly={isReadOnly}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200 dark:border-border">
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimate Number</Label>
                  <Input
                    value={estimateNumber}
                    className="h-8 rounded-md text-sm bg-muted/50"
                    readOnly
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="estimateDate" className="text-xs">
                    Estimate Date
                  </Label>
                  <Input
                    id="estimateDate"
                    name="estimateDate"
                    type="date"
                    defaultValue={meta.estimateDate ?? today}
                    className="h-8 rounded-md text-sm"
                    readOnly={isReadOnly}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validUntil" className="text-xs">
                    Valid Until
                  </Label>
                  <Input
                    id="validUntil"
                    name="validUntil"
                    type="date"
                    defaultValue={meta.validUntil ?? ""}
                    className="h-8 rounded-md text-sm"
                    readOnly={isReadOnly}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200 dark:border-border">
                <div className="space-y-1.5">
                  <Label htmlFor="salesPerson" className="text-xs">
                    Sales Person
                  </Label>
                  <Input
                    id="salesPerson"
                    name="salesPerson"
                    defaultValue={meta.salesPerson ?? ""}
                    placeholder="Optional"
                    className="h-8 rounded-md text-sm"
                    readOnly={isReadOnly}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs">
                    Notes
                  </Label>
                  <Input
                    id="notes"
                    name="notes"
                    defaultValue={meta.notes ?? ""}
                    placeholder="Optional notes"
                    className="h-8 rounded-md text-sm"
                    readOnly={isReadOnly}
                  />
                </div>
              </div>
              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-200 dark:border-border">
                  <div className="space-y-1.5">
                    <Label htmlFor="tax" className="text-xs">
                      Tax ($)
                    </Label>
                    <Input
                      id="tax"
                      name="tax"
                      type="number"
                      step="0.01"
                      defaultValue={summary.tax}
                      className="h-8 rounded-md text-sm"
                      readOnly={isReadOnly}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="discount" className="text-xs">
                      Discount ($)
                    </Label>
                    <Input
                      id="discount"
                      name="discount"
                      type="number"
                      step="0.01"
                      defaultValue={summary.discount}
                      className="h-8 rounded-md text-sm"
                      readOnly={isReadOnly}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="markupPct" className="text-xs">
                      Markup (%)
                    </Label>
                    <Input
                      id="markupPct"
                      name="markupPct"
                      type="number"
                      step="0.1"
                      defaultValue={markupPct}
                      className="h-8 rounded-md text-sm"
                      readOnly={isReadOnly}
                    />
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Cost Breakdown — full width table */}
        <div className="border border-zinc-200 dark:border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-border bg-muted/20">
            <h2 className="text-sm font-semibold text-foreground">Cost Breakdown</h2>
          </div>
          <div>
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
                        className="flex list-none flex-wrap items-center justify-between gap-2 cursor-pointer px-4 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors"
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
                            <span className="font-medium text-foreground text-sm">
                              {categoryId} – {displayName}
                            </span>
                          ) : (
                            <CostCategoryTitleMenu
                              estimateId={estimateId}
                              currentCostCode={categoryId}
                              displayName={displayName}
                              itemIds={rows.map((r) => r.id)}
                              categoryOptions={categoryDropdownOptions}
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
                                  [newCode]: prev[newCode] ?? catalogNameByCode[newCode] ?? newCode,
                                }));
                              }}
                              onNameSaved={(code, name) =>
                                setLocalCategoryNames((prev) => ({ ...prev, [code]: name }))
                              }
                              usedCostCodes={usedCostCodesOnEstimate}
                              onCategoryCreated={handleNewCategoryCreated}
                            />
                          )}
                        </div>
                        <span className="tabular-nums text-sm font-medium text-foreground">
                          ${sectionTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </summary>
                      <div className="border-t border-zinc-200 dark:border-border">
                        <div className="overflow-x-auto">
                          {isReadOnly ? (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-zinc-200 dark:border-border bg-muted/10">
                                  <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                                    Title
                                  </th>
                                  <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                                    Qty
                                  </th>
                                  <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                                    Unit
                                  </th>
                                  <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                                    Unit Price
                                  </th>
                                  <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                                    Cost Code
                                  </th>
                                  <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                                    Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => (
                                  <LineItemRow
                                    key={row.id}
                                    row={row}
                                    estimateId={estimateId}
                                    categoryId={categoryId}
                                    isLocked
                                    updateLineItemAction={updateLineItemAction}
                                    duplicateLineItemAction={duplicateLineItemAction}
                                    deleteLineItemAction={deleteLineItemAction}
                                    onOpenDescriptionEditor={openItemDescriptionModal}
                                    lineLiveValuesRef={lineLiveValuesRef}
                                    lineDescriptionApplyRef={lineDescriptionApplyRef}
                                  />
                                ))}
                              </tbody>
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
                                    <tr className="border-b border-zinc-200 dark:border-border bg-muted/10">
                                      <th className="w-9 py-2 px-1" aria-label="Reorder" />
                                      <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                                        Title
                                      </th>
                                      <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                                        Qty
                                      </th>
                                      <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                                        Unit
                                      </th>
                                      <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                                        Unit Price
                                      </th>
                                      <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                                        Cost Code
                                      </th>
                                      <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
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
                                      categoryId={categoryId}
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
                          <div className="px-4 py-2 border-t border-zinc-100 dark:border-border/50">
                            <form action={addLineItemAction} className="inline-block">
                              <input type="hidden" name="estimateId" value={estimateId} />
                              <input type="hidden" name="costCode" value={categoryId} />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="btn-outline-ghost h-7 text-xs rounded-md border border-dashed border-zinc-300 dark:border-border text-muted-foreground hover:text-foreground"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add line item
                              </Button>
                            </form>
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );

                  return isReadOnly ? (
                    <div key={categoryId} className="border-b border-zinc-200 dark:border-border">
                      <details className="group" open={expandedCategoryIds.includes(categoryId)}>
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
                        <details className="group" open={expandedCategoryIds.includes(categoryId)}>
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
                allCategoryCodes={categoryDropdownOptions.map((o) => o.code)}
                getCategoryDisplayName={getCategoryDisplayNameHint}
                categoryIdsWithItems={categoryIdsWithItems}
                usedCostCodes={usedCostCodesOnEstimate}
                pendingSelectNewCategory={pendingSelectNewCategory}
                onPendingSelectNewCategoryConsumed={consumePendingSelectNewCategory}
                onPostCreateCategoryUx={handleNewCategoryCreated}
              />
            )}
          </div>
        </div>

        {!isReadOnly ? (
          <Dialog open={editingItem !== null} onOpenChange={handleItemDescriptionDialogOpenChange}>
            <DialogContent className="gap-0 sm:max-w-md">
              <DialogHeader className="space-y-1 pb-4">
                <DialogTitle>Item Description</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pb-4">
                <div className="space-y-1.5">
                  <Label htmlFor="estimate-line-desc-modal-name" className="text-xs">
                    Name
                  </Label>
                  <Input
                    id="estimate-line-desc-modal-name"
                    value={modalItemName}
                    onChange={(e) => setModalItemName(e.target.value)}
                    placeholder="Line item name"
                    className="h-8 rounded-md text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <LineItemDescriptionRichText
                    ref={lineDescEditorRef}
                    key={editingItem ?? "closed"}
                    value={modalItemDescription}
                    onChange={setModalItemDescription}
                    disabled={descModalSaving}
                    placeholder="Optional details"
                  />
                </div>
              </div>
              <DialogFooter className="border-t-0 pt-0 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-sm h-8"
                  onClick={() => setEditingItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-sm h-8"
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

        {/* Payment Schedule — full width */}
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

        {/* Estimate Summary — totals block at bottom */}
        <EstimateSummarySidebar summary={summary} />

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild className="rounded-md h-8">
            <Link href="/estimates">Back to list</Link>
          </Button>
        </div>
      </div>
    </React.Fragment>
  );
}

function SortableLineItemGroup({
  row,
  estimateId,
  categoryId,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
  onOpenDescriptionEditor,
  lineLiveValuesRef,
  lineDescriptionApplyRef,
}: {
  row: EstimateItemRow;
  estimateId: string;
  categoryId: string;
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
    <tbody ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : undefined}>
      <LineItemRow
        row={row}
        estimateId={estimateId}
        categoryId={categoryId}
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
  categoryId,
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
  /** Same as row.cost_code / category key */
  categoryId: string;
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
  const [unitCost, setUnitCost] = React.useState(row.unitCost);
  const combinedDesc = desc.trim() ? `${title}\n${desc}` : title;
  const formId = `line-${row.id}`;

  React.useLayoutEffect(() => {
    if (isLocked) return;
    lineLiveValuesRef.current[row.id] = () => ({
      qty,
      unit,
      unitCost,
      markupPct: row.markupPct,
    });
    return () => {
      delete lineLiveValuesRef.current[row.id];
    };
  }, [isLocked, row.id, row.markupPct, qty, unit, unitCost, lineLiveValuesRef]);

  React.useLayoutEffect(() => {
    if (isLocked) return;
    lineDescriptionApplyRef.current[row.id] = (name: string, body: string) => {
      setTitle(name);
      setDesc(body);
    };
    return () => {
      delete lineDescriptionApplyRef.current[row.id];
    };
  }, [isLocked, row.id, lineDescriptionApplyRef]);

  React.useEffect(() => {
    const i = row.desc.indexOf("\n");
    setTitle(i < 0 ? row.desc : row.desc.slice(0, i));
    setDesc(i < 0 ? "" : row.desc.slice(i + 1));
    setQty(row.qty);
    setUnit(row.unit);
    setUnitCost(row.unitCost);
  }, [row.id, row.desc, row.qty, row.unit, row.unitCost]);

  const lineTotalDisplay = React.useMemo(() => {
    if (isLocked) return estimateLineTotal(row);
    return estimateLineTotal({ ...row, qty, unit, unitCost });
  }, [isLocked, row, qty, unit, unitCost]);

  const descColSpan = isLocked ? 6 : dragHandleProps ? 8 : 7;

  return (
    <>
      <tr className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors">
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
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()}
              className="h-8 text-sm"
              placeholder="Title"
            />
          )}
        </td>
        <td className="py-2 px-4 text-right align-top">
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
              className="h-8 w-16 text-right"
            />
          )}
        </td>
        <td className="py-2 px-4 align-top">
          {isLocked ? (
            row.unit
          ) : (
            <Input
              form={formId}
              name="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()}
              className="h-8 w-14"
            />
          )}
        </td>
        <td className="py-2 px-4 text-right align-top">
          {isLocked ? (
            `$${row.unitCost.toLocaleString()}`
          ) : (
            <Input
              form={formId}
              type="number"
              name="unitCost"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
              onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()}
              className="h-8 w-20 text-right"
            />
          )}
        </td>
        <td className="py-2 px-4 align-top text-muted-foreground text-xs">{categoryId}</td>
        <td className="py-2 px-4 align-top text-right tabular-nums font-semibold">
          ${lineTotalDisplay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </td>
        {!isLocked && (
          <td className="py-2 px-2 align-top">
            <form action={duplicateLineItemAction} className="inline">
              <input type="hidden" name="estimateId" value={estimateId} />
              <input type="hidden" name="itemId" value={row.id} />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                className="btn-outline-ghost h-8 w-8"
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
                className="btn-outline-ghost h-8 w-8 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </form>
          </td>
        )}
      </tr>
      <tr className="border-b border-zinc-100/50 dark:border-border/30 bg-zinc-50/30 dark:bg-zinc-900/20">
        <td colSpan={descColSpan} className="py-1.5 px-4 align-top">
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
            <button
              type="button"
              onClick={() => onOpenDescriptionEditor(row.id, title, desc)}
              className="text-left text-sm text-muted-foreground cursor-pointer hover:underline w-full min-w-0"
            >
              {desc.trim() ? (
                <span className="block line-clamp-2 overflow-hidden">
                  <LineItemDescriptionBodyPreview
                    body={desc}
                    className="text-sm text-muted-foreground"
                  />
                </span>
              ) : (
                "Add a description"
              )}
            </button>
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
  categoryIdsWithItems,
  usedCostCodes,
  pendingSelectNewCategory,
  onPendingSelectNewCategoryConsumed,
  onPostCreateCategoryUx,
}: {
  estimateId: string;
  allCategoryCodes: string[];
  getCategoryDisplayName: (code: string) => string;
  categoryIdsWithItems: Set<string>;
  usedCostCodes: ReadonlySet<string>;
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
        (cc) =>
          !searchLower ||
          cc.code.toLowerCase().includes(searchLower) ||
          (cc.name && cc.name.toLowerCase().includes(searchLower))
      ),
    [allCodesWithLabels, searchLower]
  );
  const visibleOptions = filtered;
  const hasMore = false;
  const noMatch = search.trim().length > 0 && filtered.length === 0;
  const canInstantCreate = search.trim().length > 0 && filtered.length === 0;
  const nextGeneratedCode = React.useMemo(
    () => pickNextUniqueCostCode(usedCostCodes),
    [usedCostCodes]
  );

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
        const nextCode = pickNextUniqueCostCode(usedCostCodes);
        const res = await createEstimateCategoryWithCodeAction(estimateId, nextCode, trimmed);
        if (res.ok && res.costCode) {
          onPostCreateCategoryUx?.(res.costCode, trimmed);
          setSelectedCode(res.costCode);
          setCustomCategoryLabel(trimmed);
          setSearch("");
          setOpen(false);
          syncRouterNonBlocking(router);
          toast({ title: "Category created", variant: "success" });
        } else {
          toast({
            title: "Could not create category",
            description: res.error ?? "Try again.",
            variant: "error",
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [estimateId, onPostCreateCategoryUx, router, toast, usedCostCodes]
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
          toast({ title: "Category added", variant: "success" });
        } else {
          toast({
            title: "Could not add category",
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
      title: "Enter a category name",
      description: "Type a name to create one, or pick a code from the list.",
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
    const label = (customCategoryLabel ?? getCategoryDisplayName(selectedCode) ?? "").trim();
    return label && label !== selectedCode ? `${selectedCode} - ${label}` : selectedCode;
  }, [customCategoryLabel, getCategoryDisplayName, search, selectedCode]);

  return (
    <div
      id="estimate-add-category"
      ref={containerRef}
      className="px-4 py-3 border-t border-zinc-200 dark:border-border"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-[300px]">
          <Label
            htmlFor="add-category-input"
            className="text-xs font-medium text-muted-foreground mb-1.5 block"
          >
            Add category
          </Label>
          <div ref={anchorRef} className="relative">
            <Input
              ref={inputRef}
              id="add-category-input"
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
              placeholder="Search or select category…"
              className="h-9 rounded-lg border border-zinc-200/60 dark:border-border bg-background px-3 text-sm pr-9"
              autoComplete="off"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
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
                    className="z-[100] overflow-y-auto rounded-lg border border-zinc-200/60 dark:border-border bg-background py-1 shadow-lg"
                  >
                    {visibleOptions.length === 0 && !canInstantCreate ? (
                      <li className="px-3 py-2 text-sm text-muted-foreground">
                        {noMatch
                          ? "No matching category"
                          : allCodesWithLabels.length === 0
                            ? "Type a name to create a category"
                            : "No categories to add"}
                      </li>
                    ) : (
                      <>
                        {visibleOptions.map((cc, i) => (
                          <li
                            key={cc.code}
                            role="option"
                            aria-selected={highlightIndex === i}
                            className={`cursor-pointer px-3 py-2 text-sm ${highlightIndex === i ? "bg-zinc-100 dark:bg-zinc-800 text-foreground" : "text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
                            onMouseEnter={() => setHighlightIndex(i)}
                            onClick={() => handleSelect(cc.code)}
                          >
                            {cc.code} – {cc.name}
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
                            className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                              visibleOptions.length === 0
                                ? highlightIndex === 0
                                  ? "bg-zinc-100 dark:bg-zinc-800 text-foreground"
                                  : "text-foreground hover:bg-muted/60"
                                : highlightIndex === visibleOptions.length
                                  ? "bg-zinc-100 dark:bg-zinc-800 text-foreground"
                                  : "text-foreground hover:bg-muted/60"
                            }`}
                            onMouseEnter={() => setHighlightIndex(visibleOptions.length)}
                            onClick={() => handleInstantCreateCategory()}
                          >
                            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span>
                              Create &quot;{nextGeneratedCode} - {search.trim()}&quot;
                            </span>
                          </li>
                        ) : null}
                      </>
                    )}
                    {hasMore && (
                      <li className="px-3 py-1.5 text-xs text-muted-foreground border-t border-zinc-100 dark:border-border/50">
                        Scroll for more ({filtered.length} total)
                      </li>
                    )}
                  </ul>,
                  document.body
                )
              : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg shrink-0"
          disabled={busy || (!selectedCode && !search.trim())}
          onClick={() => void runAdd()}
        >
          {busy ? (
            <InlineLoading className="mr-2" size="md" aria-hidden />
          ) : (
            <Plus className="h-4 w-4 mr-2" aria-hidden />
          )}
          {busy ? "Adding…" : "Add category"}
        </Button>
      </div>
    </div>
  );
}

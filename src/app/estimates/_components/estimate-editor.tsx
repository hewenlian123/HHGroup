"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useHhPortalContainer, useHhTheme } from "@/contexts/hh-theme-context";
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
  saveEstimateMetaAction,
  addLineItemCatalogInlineAction,
  createCustomEstimateCategoryAction,
  updateLineItemInlineAction,
  toggleLineItemHideAmountOnPdfAction,
  deleteLineItemInlineAction,
  duplicateLineItemInlineAction,
  addPaymentMilestoneInlineAction,
  updatePaymentMilestoneInlineAction,
  deletePaymentMilestoneInlineAction,
  markPaymentMilestonePaidAction,
  reorderPaymentScheduleAction,
  applyPaymentTemplateAction,
  createPaymentTemplateAction,
  reorderEstimateCategoriesAction,
  reorderEstimateItemsAction,
  saveEstimateDocumentNotesInlineAction,
  setLineItemStatusAction,
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, EyeOff, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EstimatePaymentSchedule } from "./estimate-payment-schedule";
import type { EstimatePaymentScheduleInvoiceSummary } from "./estimate-payment-schedule";
import {
  EstimateSectionTitleMenu,
  type EstimateSectionOption,
} from "./estimate-section-title-menu";
import { formatEstimateCurrency, roundEstimateCurrencyValue } from "./estimate-currency";
import {
  EstimateBuilderCompactSummary,
  EstimateBuilderMobileSummary,
  type EstimateBuilderPaymentSummary,
} from "./estimate-builder-summary";
import { EstimateBuilderAdvanced } from "./estimate-builder-advanced";
import { EstimateEditCustomerSection } from "./estimate-edit-customer-section";
import { EB, ebGlassPanel, ebInput } from "./estimate-builder-ui";
import { EstimateLineItemPersistedMobile } from "./estimate-line-item-persisted-mobile";
import { ScopeSectionCollapsibleBody, ScopeSectionHeader } from "./estimate-line-items-local";
import { EstimateScopeSortableSection } from "./estimate-scope-section-sortable";
import { EstimateItemSortableRow } from "./estimate-item-sortable-row";
import { ProposalScopeWorkCard } from "./proposal-scope-work-card";
import { EstimateLineItemMoreMenu } from "./estimate-line-item-more-menu";
import { EstimateLineItemStatusPill } from "./estimate-line-item-status-pill";
import { EstimateNotesClarifications } from "./estimate-notes-clarifications";
import { useEstimateDocumentSave } from "./estimate-document-save-context";
import { EstimateLineItemGridHeader } from "./estimate-line-item-grid-header";
import { EstimateScopeToolbar } from "./estimate-scope-toolbar";
import {
  buildEstimateSectionCollapseState,
  shouldCommitEstimateLineFromPrice,
} from "./estimate-builder-productivity";
import { readEstimateBuilderReturnContext } from "./estimate-workflow-continuity";
import {
  buildEstimateItemMoveOrder,
  persistedEstimateItemOrder,
  type EstimateItemMoveTarget,
} from "@/lib/estimate-item-reorder";

function cssEscapeAttrSelector(value: string): string {
  const winCss =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS
      : undefined;
  if (winCss?.escape) return winCss.escape(value);
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
  invoiceProjectLink?: {
    canCreateInvoice: boolean;
    message?: string;
  };
  paymentInvoiceSummaries?: Record<string, EstimatePaymentScheduleInvoiceSummary>;
  /** When true, enable editing in the editor UI. */
  editing?: boolean;
  /** Controlled details-sheet state for the Existing Estimate command bar. */
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
  /** Persist the detail drawer through the parent edit flow when available. */
  onSaveDetails?: () => void;
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
  invoiceProjectLink,
  paymentInvoiceSummaries = {},
  editing = false,
  detailsOpen,
  onDetailsOpenChange,
  onSaveDetails,
}: EstimateEditorProps) {
  const isLocked = !["Draft", "Sent"].includes(status);
  const isReadOnly = isLocked || !editing;
  const today = new Date().toISOString().slice(0, 10);
  const { toast } = useToast();
  const router = useRouter();
  const workflowSearchParams = useSearchParams();
  const returnContext = readEstimateBuilderReturnContext(workflowSearchParams);
  const returnMilestoneId = workflowSearchParams.get("returnMilestone")?.trim() || null;
  const { markUnsaved, trackMutation } = useEstimateDocumentSave();

  React.useEffect(() => {
    if (!editing) return;
    const form = document.getElementById("estimate-meta-form");
    if (!form) return;
    const markDirty = (): void => void markUnsaved();
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
    };
  }, [editing, markUnsaved]);

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

  /** Local line-item view model, synced from server `items` on refresh. */
  const [localItems, setLocalItems] = React.useState(items);
  const [lineFocusTargetId, setLineFocusTargetId] = React.useState<string | null>(null);
  const [newLineFocusTarget, setNewLineFocusTarget] = React.useState<{
    categoryId: string;
    previousCount: number;
  } | null>(null);
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

  const addLineToCategory = React.useCallback(
    async (categoryId: string): Promise<void> => {
      markUnsaved();
      const result = await trackMutation(`line:add:${categoryId}`, () =>
        addLineItemCatalogInlineAction(
          estimateId,
          categoryId,
          getCategoryDisplayNameHint(categoryId)
        )
      );
      if (result.ok) {
        setNewLineFocusTarget({
          categoryId,
          previousCount: localItems.filter((item) => item.costCode === categoryId).length,
        });
        syncRouterNonBlocking(router);
        return;
      }
      toast({
        title: "Could not add line item",
        description: result.error ?? "Try again.",
        variant: "error",
      });
    },
    [estimateId, getCategoryDisplayNameHint, localItems, markUnsaved, router, toast, trackMutation]
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

  const estimateSectionMoveOptions = React.useMemo(
    () =>
      costBreakdownSections.map((section) => ({
        code: section.categoryId,
        label:
          localCategoryNames[section.categoryId] ??
          catalogNameByCode[section.categoryId] ??
          section.title,
      })),
    [catalogNameByCode, costBreakdownSections, localCategoryNames]
  );

  React.useLayoutEffect(() => {
    if (!lineFocusTargetId) return;
    const escapedId = cssEscapeAttrSelector(lineFocusTargetId);
    let focusFrame = 0;
    const closeFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const row = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-estimate-line-item-id="${escapedId}"]`)
        ).find((candidate) => candidate.getClientRects().length > 0);
        const target = row?.querySelector<HTMLElement>(
          'input[aria-label="Line item title"], input[aria-label^="Line item "][aria-label$=" title"], .eb-line-item-mobile-summary'
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
  }, [lineFocusTargetId, localItems]);

  React.useLayoutEffect(() => {
    if (!newLineFocusTarget) return;
    const section = costBreakdownSections.find(
      (candidate) => candidate.categoryId === newLineFocusTarget.categoryId
    );
    if (!section || section.rows.length <= newLineFocusTarget.previousCount) return;
    const newestRow = section.rows[section.rows.length - 1];
    if (!newestRow) return;
    setLineFocusTargetId(newestRow.id);
    setNewLineFocusTarget(null);
  }, [costBreakdownSections, newLineFocusTarget]);

  /** Cost code of the category treated as selected after create (same id as `categoryId` in breakdown). */
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const restoredWorkflowContextRef = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const restoreKey = [
      returnContext.sectionId ?? "",
      returnContext.scrollTop ?? "",
      returnMilestoneId ?? "",
    ].join("|");
    if (restoreKey === "||" || restoredWorkflowContextRef.current === restoreKey) return;

    const frame = window.requestAnimationFrame(() => {
      const milestoneTarget = returnMilestoneId
        ? document.querySelector<HTMLElement>(
            `[data-estimate-payment-milestone-id="${cssEscapeAttrSelector(returnMilestoneId)}"]`
          )
        : null;
      const sectionTarget = returnContext.sectionId
        ? (Array.from(
            document.querySelectorAll<HTMLElement>(
              `[data-estimate-section-id="${cssEscapeAttrSelector(
                returnContext.sectionId
              )}"], [data-estimate-section-mobile-id="${cssEscapeAttrSelector(
                returnContext.sectionId
              )}"]`
            )
          ).find((candidate) => candidate.getClientRects().length > 0) ?? null)
        : null;
      const target = milestoneTarget ?? sectionTarget;
      if (!target) return;

      if (milestoneTarget) {
        const details = milestoneTarget.closest("details");
        if (details instanceof HTMLDetailsElement) details.open = true;
        milestoneTarget.scrollIntoView({ behavior: "auto", block: "center" });
      } else {
        setSelectedCategoryId(returnContext.sectionId);
        const scrollRoot = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        if (scrollRoot && returnContext.scrollTop !== null) {
          scrollRoot.scrollTo({ top: returnContext.scrollTop, behavior: "auto" });
        } else {
          sectionTarget?.scrollIntoView({ behavior: "auto", block: "start" });
        }
      }

      target.dataset.estimateReturnHighlight = "true";
      target.focus({ preventScroll: true });
      restoredWorkflowContextRef.current = restoreKey;
      window.setTimeout(() => {
        delete target.dataset.estimateReturnHighlight;
      }, 1400);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    costBreakdownSections,
    paymentSchedule,
    returnContext.scrollTop,
    returnContext.sectionId,
    returnMilestoneId,
  ]);
  /** Wait until the new section exists in the list, then scroll + flash. */
  const [categoryScrollTargetCode, setCategoryScrollTargetCode] = React.useState<string | null>(
    null
  );
  const [flashHighlightCategoryId, setFlashHighlightCategoryId] = React.useState<string | null>(
    null
  );
  const [activeSectionInsertion, setActiveSectionInsertion] = React.useState<string | null>(null);

  React.useLayoutEffect(() => {
    if (!categoryScrollTargetCode) return;
    const target = categoryScrollTargetCode;
    if (!costBreakdownSections.some((s) => s.categoryId === target)) return;
    let focusFrame = 0;
    const closeFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            `[data-estimate-section-id="${cssEscapeAttrSelector(target)}"], [data-estimate-section-mobile-id="${cssEscapeAttrSelector(target)}"]`
          )
        );
        const el = candidates.find((candidate) => candidate.getClientRects().length > 0);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 88 || rect.bottom > window.innerHeight - 88) {
            const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
          }
          el.querySelector<HTMLElement>(
            'input[aria-label^="Section name"], input[aria-label="Line item title"]'
          )?.focus({ preventScroll: true });
        }
        setFlashHighlightCategoryId(target);
        setCategoryScrollTargetCode(null);
        window.setTimeout(() => setFlashHighlightCategoryId(null), 1000);
      });
    });
    return () => {
      window.cancelAnimationFrame(closeFrame);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, [categoryScrollTargetCode, costBreakdownSections]);

  const handleNewCategoryCreated = React.useCallback(
    async (code: string, displayName: string, insertAfterCode?: string | null) => {
      const currentOrder = costBreakdownSections
        .map((section) => section.categoryId)
        .filter((categoryId) => categoryId !== code);
      const anchorIndex = insertAfterCode ? currentOrder.indexOf(insertAfterCode) : -1;
      const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : currentOrder.length;
      const nextOrder = [...currentOrder];
      nextOrder.splice(insertIndex, 0, code);
      const nextNames: Record<string, string> = {};
      for (const categoryId of nextOrder) {
        const section = costBreakdownSections.find(
          (candidate) => candidate.categoryId === categoryId
        );
        nextNames[categoryId] =
          categoryId === code
            ? displayName
            : (localCategoryNames[categoryId] ??
              catalogNameByCode[categoryId] ??
              section?.title ??
              categoryId);
      }

      setLocalCategoryNames((prev) => ({ ...prev, [code]: displayName }));
      setLocalCategorySectionOrder(nextOrder);
      setSelectedCategoryId(code);
      setCategoryScrollTargetCode(code);
      setActiveSectionInsertion(null);

      markUnsaved();
      const result = await trackMutation("sections:order", () =>
        reorderEstimateCategoriesAction(estimateId, nextOrder, nextNames)
      );
      if (!result.ok) {
        toast({
          title: "Could not save section order",
          description: result.error ?? "Try again.",
          variant: "error",
        });
        setLocalCategorySectionOrder(null);
      }
    },
    [
      catalogNameByCode,
      costBreakdownSections,
      estimateId,
      localCategoryNames,
      markUnsaved,
      toast,
      trackMutation,
    ]
  );
  const focusExistingCategory = React.useCallback((code: string) => {
    setSelectedCategoryId(code);
    setCategoryScrollTargetCode(code);
  }, []);

  const categorySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [sectionDragging, setSectionDragging] = React.useState(false);
  const [overSectionId, setOverSectionId] = React.useState<string | null>(null);

  const handleCategoryDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      setSectionDragging(false);
      setOverSectionId(null);
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
      markUnsaved();
      const res = await trackMutation("sections:order", () =>
        reorderEstimateCategoriesAction(estimateId, nextOrder, nameMap)
      );
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
      markUnsaved,
      trackMutation,
    ]
  );

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

  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});
  const isSectionCollapsed = React.useCallback(
    (code: string) => collapsedSections[code] === true,
    [collapsedSections]
  );
  const toggleSectionCollapsed = React.useCallback((code: string) => {
    setCollapsedSections((prev) => ({ ...prev, [code]: !prev[code] }));
  }, []);

  const collapseAllSections = React.useCallback(() => {
    setCollapsedSections(
      buildEstimateSectionCollapseState(
        costBreakdownSections.map((section) => section.categoryId),
        true
      )
    );
  }, [costBreakdownSections]);

  const expandAllSections = React.useCallback(() => {
    setCollapsedSections(
      buildEstimateSectionCollapseState(
        costBreakdownSections.map((section) => section.categoryId),
        false
      )
    );
  }, [costBreakdownSections]);

  const outlineSections = React.useMemo(
    () =>
      costBreakdownSections.map((section) => ({
        id: section.categoryId,
        name:
          localCategoryNames[section.categoryId] ??
          catalogNameByCode[section.categoryId] ??
          section.title,
        itemCount: section.rows.length,
        subtotal: section.sectionTotal,
        collapsed: isSectionCollapsed(section.categoryId),
      })),
    [catalogNameByCode, costBreakdownSections, isSectionCollapsed, localCategoryNames]
  );

  const scopeSearchEntries = React.useMemo(
    () =>
      outlineSections.flatMap((section) => {
        const sourceSection = costBreakdownSections.find(
          (candidate) => candidate.categoryId === section.id
        );
        const rows = sourceSection?.rows ?? [];
        return [
          {
            id: `section-${section.id}`,
            sectionId: section.id,
            label: section.name,
            detail: `${section.itemCount} ${section.itemCount === 1 ? "item" : "items"}`,
            searchText: section.name,
          },
          ...rows.map((row, index) => {
            const title = row.desc.split("\n", 1)[0]?.trim();
            return {
              id: `line-${row.id}`,
              sectionId: section.id,
              lineItemId: row.id,
              label: title || `Line ${index + 1}`,
              detail: section.name,
              searchText: `${row.desc} ${section.name}`,
            };
          }),
        ];
      }),
    [costBreakdownSections, outlineSections]
  );

  const paymentSummary = React.useMemo((): EstimateBuilderPaymentSummary | null => {
    if (!paymentSchedule.length) return null;
    const scheduledTotal = paymentSchedule.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { milestoneCount: paymentSchedule.length, scheduledTotal };
  }, [paymentSchedule]);

  const [localDocumentNotes, setLocalDocumentNotes] = React.useState(meta.documentNotes ?? []);
  React.useEffect(() => {
    setLocalDocumentNotes(meta.documentNotes ?? []);
  }, [meta.documentNotes]);
  const updateDocumentNotes = React.useCallback(
    (nextNotes: typeof localDocumentNotes) => {
      setLocalDocumentNotes(nextNotes);
      if (isReadOnly) return;
      markUnsaved();
      void trackMutation("document-notes", () =>
        saveEstimateDocumentNotesInlineAction(estimateId, nextNotes)
      ).then((res) => {
        if (!res.ok) {
          toast({
            title: "Could not save notes",
            description: res.error ?? "Try again.",
            variant: "error",
          });
        }
      });
    },
    [estimateId, isReadOnly, markUnsaved, toast, trackMutation]
  );

  const [itemOrderBusy, setItemOrderBusy] = React.useState(false);
  const [itemMoveAnnouncement, setItemMoveAnnouncement] = React.useState("");
  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const itemOrderSections = React.useMemo(
    () =>
      costBreakdownSections.map((section) => ({
        costCode: section.categoryId,
        itemIds: section.rows.map((row) => row.id),
      })),
    [costBreakdownSections]
  );

  const persistItemMove = React.useCallback(
    async (itemId: string, target: EstimateItemMoveTarget): Promise<void> => {
      if (isReadOnly || itemOrderBusy) return;
      const orderedItems = buildEstimateItemMoveOrder(itemOrderSections, itemId, target);
      if (!orderedItems) return;

      const currentCostCode = localItems.find((item) => item.id === itemId)?.costCode;
      const expectedItems = persistedEstimateItemOrder(localItems);
      const expectedItemIds = expectedItems.map((item) => item.id);
      const orderedItemIds = orderedItems.map((item) => item.id);
      if (
        currentCostCode === target.costCode &&
        orderedItemIds.every((id, index) => id === expectedItemIds[index])
      ) {
        return;
      }

      markUnsaved();
      setItemOrderBusy(true);
      setItemMoveAnnouncement("Saving item order…");
      const result = await trackMutation(`items:order:${itemId}`, () =>
        reorderEstimateItemsAction(estimateId, expectedItems, orderedItems)
      );
      if (!result.ok) {
        setItemMoveAnnouncement(result.error ?? "Could not save item order.");
        toast({
          title: result.stale ? "Item order changed" : "Could not move item",
          description: result.error ?? "Try again.",
          variant: "error",
        });
        if (result.stale) router.refresh();
        setItemOrderBusy(false);
        return;
      }

      const nextById = new Map(
        orderedItems.map((item, sortOrder) => [item.id, { ...item, sortOrder }])
      );
      setLocalItems((previous) =>
        previous
          .map((item) => {
            const next = nextById.get(item.id);
            return next ? { ...item, costCode: next.costCode, sortOrder: next.sortOrder } : item;
          })
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      );
      const targetName = getCategoryDisplayNameHint(target.costCode);
      setItemMoveAnnouncement(`Item moved. Order saved in ${targetName}.`);
      toast({ title: "Item moved", description: `Order saved in ${targetName}.` });
      setItemOrderBusy(false);
      syncRouterNonBlocking(router);
    },
    [
      estimateId,
      getCategoryDisplayNameHint,
      isReadOnly,
      itemOrderBusy,
      itemOrderSections,
      localItems,
      markUnsaved,
      router,
      toast,
      trackMutation,
    ]
  );

  const moveLineToSection = React.useCallback(
    (itemId: string, currentCode: string, nextCode: string): void => {
      if (currentCode === nextCode) return;
      void persistItemMove(itemId, { costCode: nextCode, position: "end" });
    },
    [persistItemMove]
  );

  const moveLineByOffset = React.useCallback(
    (itemId: string, categoryId: string, offset: -1 | 1): void => {
      const section = costBreakdownSections.find(
        (candidate) => candidate.categoryId === categoryId
      );
      const itemIndex = section?.rows.findIndex((row) => row.id === itemId) ?? -1;
      const adjacent = itemIndex >= 0 ? section?.rows[itemIndex + offset] : null;
      if (!adjacent) return;
      void persistItemMove(itemId, {
        costCode: categoryId,
        position: offset < 0 ? "before" : "after",
        itemId: adjacent.id,
      });
    },
    [costBreakdownSections, persistItemMove]
  );

  const handleItemDragEnd = React.useCallback(
    (categoryId: string, rows: EstimateItemRow[], event: DragEndEvent): void => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        setItemMoveAnnouncement("");
        return;
      }
      const oldIndex = rows.findIndex((row) => row.id === String(active.id));
      const newIndex = rows.findIndex((row) => row.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) {
        setItemMoveAnnouncement("");
        return;
      }
      void persistItemMove(String(active.id), {
        costCode: categoryId,
        position: oldIndex < newIndex ? "after" : "before",
        itemId: String(over.id),
      });
    },
    [persistItemMove]
  );

  const restoreContextualActionFocus = React.useCallback((ariaLabel: string): void => {
    window.requestAnimationFrame(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          `button[aria-label="${cssEscapeAttrSelector(ariaLabel)}"]`
        )
      );
      candidates
        .find((candidate) => candidate.getClientRects().length > 0)
        ?.focus({
          preventScroll: true,
        });
    });
  }, []);

  const renderContextualSectionAction = React.useCallback(
    ({
      actionKey,
      insertAfterCode,
      label,
      ariaLabel,
      inputAriaLabel,
    }: {
      actionKey: string;
      insertAfterCode: string | null;
      label: string;
      ariaLabel: string;
      inputAriaLabel: string;
    }): React.ReactElement => {
      if (activeSectionInsertion === actionKey) {
        return (
          <AddCategoryBlock
            estimateId={estimateId}
            allCategoryCodes={sectionDropdownOptions.map((option) => option.code)}
            existingCategoryCodes={costBreakdownSections.map((section) => section.categoryId)}
            getCategoryDisplayName={getCategoryDisplayNameHint}
            onFocusExistingCategory={focusExistingCategory}
            onPostCreateCategoryUx={handleNewCategoryCreated}
            instanceId={actionKey.replace(/[^a-zA-Z0-9_-]/g, "-")}
            compact
            autoFocus
            commitOnSelect
            preferBelow
            insertAfterCategoryCode={insertAfterCode}
            inputAriaLabel={inputAriaLabel}
            onDismiss={(reason) => {
              setActiveSectionInsertion(null);
              if (reason !== "selection") restoreContextualActionFocus(ariaLabel);
            }}
          />
        );
      }
      return (
        <button
          type="button"
          className={EB.composerAddSection}
          aria-label={ariaLabel}
          onClick={() => setActiveSectionInsertion(actionKey)}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {label}
        </button>
      );
    },
    [
      activeSectionInsertion,
      costBreakdownSections,
      estimateId,
      focusExistingCategory,
      getCategoryDisplayNameHint,
      handleNewCategoryCreated,
      restoreContextualActionFocus,
      sectionDropdownOptions,
    ]
  );

  return (
    <React.Fragment>
      <span id="estimate-item-move-status" className="sr-only" aria-live="polite">
        {itemMoveAnnouncement}
      </span>
      <div>
        <div className="min-w-0 space-y-4 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-0">
          <EstimateEditCustomerSection
            meta={meta}
            estimateId={estimateId}
            today={today}
            isReadOnly={isReadOnly}
            detailsOpen={detailsOpen}
            onDetailsOpenChange={onDetailsOpenChange}
            tax={summary?.tax ?? 0}
            discount={summary?.discount ?? 0}
            estimateSubtotal={summary?.subtotal ?? 0}
            saveEstimateMetaAction={saveEstimateMetaAction}
            onSaveDetails={onSaveDetails}
          />

          <EstimateBuilderCompactSummary
            summary={summary}
            showInternal={editing && !isReadOnly}
            paymentSummary={paymentSummary}
          />

          <section className={EB.section}>
            <div className={ebGlassPanel("eb-scope-work-panel")}>
              <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={EB.scopeHeading}>Scope of work</h2>
                  <p className={EB.scopeSubtitle}>Proposal sections and line totals</p>
                </div>
              </div>

              <EstimateScopeToolbar
                sections={outlineSections}
                searchEntries={scopeSearchEntries}
                initialExplicitSectionId={returnContext.sectionId}
                onCollapseAll={collapseAllSections}
                onExpandAll={expandAllSections}
                onRevealSection={(sectionId) =>
                  setCollapsedSections((previous) => ({ ...previous, [sectionId]: false }))
                }
                onActiveSectionChange={setSelectedCategoryId}
                addSectionControl={
                  !isReadOnly
                    ? renderContextualSectionAction({
                        actionKey: "toolbar",
                        insertAfterCode:
                          costBreakdownSections[costBreakdownSections.length - 1]?.categoryId ??
                          null,
                        label: "Add Section",
                        ariaLabel: "Add Section",
                        inputAriaLabel: "Search or add section",
                      })
                    : undefined
                }
              />
              <div className="eb-scope-workspace-grid">
                <div className="eb-scope-builder-region min-w-0">
                  <div className="mb-4 space-y-3 lg:hidden">
                    {costBreakdownSections.map(({ categoryId, title, rows, sectionTotal }) => {
                      const displayName =
                        localCategoryNames[categoryId] ?? catalogNameByCode[categoryId] ?? title;
                      const collapsed = isSectionCollapsed(categoryId);
                      return (
                        <div
                          key={categoryId}
                          data-estimate-section-mobile-id={categoryId}
                          className={cn(
                            EB.scopeSectionMobile,
                            selectedCategoryId === categoryId && "eb-scope-section-current",
                            flashHighlightCategoryId === categoryId && EB.scopeSectionInserted
                          )}
                        >
                          <ScopeSectionHeader
                            code={categoryId}
                            catalogName={catalogNameByCode[categoryId] ?? title}
                            displayName={displayName}
                            itemCount={rows.length}
                            sectionSubtotal={sectionTotal}
                            collapsed={collapsed}
                            onToggleCollapse={() => toggleSectionCollapsed(categoryId)}
                            onDisplayNameChange={() => undefined}
                            onAddLine={
                              isReadOnly
                                ? undefined
                                : () => {
                                    setCollapsedSections((previous) => ({
                                      ...previous,
                                      [categoryId]: false,
                                    }));
                                    void addLineToCategory(categoryId);
                                  }
                            }
                            addLineAriaLabel={`Add line to ${displayName}`}
                            titleSlot={
                              isReadOnly ? (
                                <span className={cn(EB.scopeBlockTitle, "min-w-0 truncate")}>
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
                              )
                            }
                          />
                          <ScopeSectionCollapsibleBody collapsed={collapsed}>
                            <div className="space-y-3 pt-2">
                              {rows.map((row) => {
                                const lineOrdinal =
                                  flatPersistedRows.find((f) => f.row.id === row.id)?.rowIndex ?? 1;
                                return (
                                  <EstimateLineItemPersistedMobile
                                    key={row.id}
                                    row={row}
                                    rowIndex={lineOrdinal}
                                    estimateId={estimateId}
                                    categoryId={categoryId}
                                    isReadOnly={isReadOnly}
                                    updateLineItemAction={updateLineItemInlineAction}
                                    duplicateLineItemAction={duplicateLineItemInlineAction}
                                    deleteLineItemAction={deleteLineItemInlineAction}
                                    isLastRow={row.id === rows[rows.length - 1]?.id}
                                    onEnterAddNext={
                                      !isReadOnly && row.id === rows[rows.length - 1]?.id
                                        ? () => {
                                            void addLineToCategory(categoryId);
                                          }
                                        : undefined
                                    }
                                    sectionOptions={estimateSectionMoveOptions}
                                    onMoveToSection={(nextCode) =>
                                      void moveLineToSection(row.id, categoryId, nextCode)
                                    }
                                    canMoveUp={rows[0]?.id !== row.id}
                                    canMoveDown={rows[rows.length - 1]?.id !== row.id}
                                    onMoveUp={() => moveLineByOffset(row.id, categoryId, -1)}
                                    onMoveDown={() => moveLineByOffset(row.id, categoryId, 1)}
                                    reorderDisabled={itemOrderBusy}
                                    onDuplicated={(itemId) => setLineFocusTargetId(itemId)}
                                    onDeleted={() => {
                                      const rowIndex = rows.findIndex(
                                        (candidate) => candidate.id === row.id
                                      );
                                      const adjacentRow =
                                        rows[rowIndex + 1] ?? rows[rowIndex - 1] ?? null;
                                      if (adjacentRow) {
                                        setLineFocusTargetId(adjacentRow.id);
                                      } else {
                                        setCategoryScrollTargetCode(categoryId);
                                      }
                                    }}
                                  />
                                );
                              })}
                              {!isReadOnly ? (
                                <div className="px-1">
                                  <button
                                    type="button"
                                    className={cn(EB.addLineLink, "w-full")}
                                    onClick={() => void addLineToCategory(categoryId)}
                                  >
                                    <Plus className="h-3 w-3" aria-hidden />
                                    Add line
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </ScopeSectionCollapsibleBody>
                          {!isReadOnly ? (
                            <div className={EB.addNextSectionRow}>
                              {renderContextualSectionAction({
                                actionKey: `mobile:${categoryId}`,
                                insertAfterCode: categoryId,
                                label: "Add Next Section",
                                ariaLabel: `Add Next Section after ${displayName}`,
                                inputAriaLabel: `Search section after ${displayName}`,
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden lg:block">
                    {(() => {
                      const categoryNodes = costBreakdownSections.map(
                        ({ categoryId, title, rows, sectionTotal }) => {
                          const displayName =
                            localCategoryNames[categoryId] ??
                            catalogNameByCode[categoryId] ??
                            title;
                          const collapsed = isSectionCollapsed(categoryId);
                          const titleSlot = isReadOnly ? (
                            <span className={cn(EB.scopeBlockTitle, "min-w-0 truncate")}>
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
                          );
                          const categorySectionBody = (dragHandle: React.ReactNode | null) => (
                            <React.Fragment>
                              <ScopeSectionHeader
                                code={categoryId}
                                catalogName={catalogNameByCode[categoryId] ?? title}
                                displayName={displayName}
                                itemCount={rows.length}
                                sectionSubtotal={sectionTotal}
                                collapsed={collapsed}
                                onToggleCollapse={() => toggleSectionCollapsed(categoryId)}
                                onDisplayNameChange={() => undefined}
                                dragHandle={dragHandle}
                                onAddLine={
                                  isReadOnly
                                    ? undefined
                                    : () => {
                                        setCollapsedSections((previous) => ({
                                          ...previous,
                                          [categoryId]: false,
                                        }));
                                        void addLineToCategory(categoryId);
                                      }
                                }
                                addLineAriaLabel={`Add line to ${displayName}`}
                                titleSlot={titleSlot}
                              />
                              <ScopeSectionCollapsibleBody collapsed={collapsed}>
                                <div className="eb-scope-section-lines flex flex-col">
                                  <EstimateLineItemGridHeader />
                                  {isReadOnly ? (
                                    rows.map((row) => {
                                      const lineOrdinal =
                                        flatPersistedRows.find((f) => f.row.id === row.id)
                                          ?.rowIndex ?? 1;
                                      return (
                                        <LineItemRow
                                          key={row.id}
                                          row={row}
                                          estimateId={estimateId}
                                          categoryId={categoryId}
                                          lineOrdinal={lineOrdinal}
                                          isLocked
                                          sectionOptions={estimateSectionMoveOptions}
                                          onMoveToSection={(nextCode) =>
                                            void moveLineToSection(row.id, categoryId, nextCode)
                                          }
                                          updateLineItemAction={updateLineItemInlineAction}
                                          duplicateLineItemAction={duplicateLineItemInlineAction}
                                          deleteLineItemAction={deleteLineItemInlineAction}
                                        />
                                      );
                                    })
                                  ) : (
                                    <DndContext
                                      sensors={itemSensors}
                                      collisionDetection={closestCenter}
                                      onDragStart={() =>
                                        setItemMoveAnnouncement(
                                          "Moving item. Choose its new position."
                                        )
                                      }
                                      onDragCancel={() => setItemMoveAnnouncement("")}
                                      onDragEnd={(event) =>
                                        handleItemDragEnd(categoryId, rows, event)
                                      }
                                    >
                                      <SortableContext
                                        items={rows.map((row) => row.id)}
                                        strategy={verticalListSortingStrategy}
                                      >
                                        {rows.map((row) => {
                                          const lineOrdinal =
                                            flatPersistedRows.find(
                                              (candidate) => candidate.row.id === row.id
                                            )?.rowIndex ?? 1;
                                          return (
                                            <EstimateItemSortableRow
                                              key={row.id}
                                              id={row.id}
                                              lineOrdinal={lineOrdinal}
                                              disabled={itemOrderBusy}
                                            >
                                              {(itemDragHandle) => (
                                                <LineItemRow
                                                  row={row}
                                                  estimateId={estimateId}
                                                  categoryId={categoryId}
                                                  lineOrdinal={lineOrdinal}
                                                  isLocked={false}
                                                  sectionOptions={estimateSectionMoveOptions}
                                                  onMoveToSection={(nextCode) =>
                                                    void moveLineToSection(
                                                      row.id,
                                                      categoryId,
                                                      nextCode
                                                    )
                                                  }
                                                  canMoveUp={rows[0]?.id !== row.id}
                                                  canMoveDown={rows[rows.length - 1]?.id !== row.id}
                                                  onMoveUp={() =>
                                                    moveLineByOffset(row.id, categoryId, -1)
                                                  }
                                                  onMoveDown={() =>
                                                    moveLineByOffset(row.id, categoryId, 1)
                                                  }
                                                  reorderDisabled={itemOrderBusy}
                                                  dragHandle={itemDragHandle}
                                                  onCommitFromPrice={() => {
                                                    const rowIndex = rows.findIndex(
                                                      (candidate) => candidate.id === row.id
                                                    );
                                                    const nextRow =
                                                      rowIndex >= 0 ? rows[rowIndex + 1] : null;
                                                    if (nextRow) {
                                                      setLineFocusTargetId(nextRow.id);
                                                      return;
                                                    }
                                                    void addLineToCategory(categoryId);
                                                  }}
                                                  onDuplicated={(itemId) =>
                                                    setLineFocusTargetId(itemId)
                                                  }
                                                  onDeleted={() => {
                                                    const rowIndex = rows.findIndex(
                                                      (candidate) => candidate.id === row.id
                                                    );
                                                    const adjacentRow =
                                                      rows[rowIndex + 1] ??
                                                      rows[rowIndex - 1] ??
                                                      null;
                                                    if (adjacentRow) {
                                                      setLineFocusTargetId(adjacentRow.id);
                                                    } else {
                                                      setCategoryScrollTargetCode(categoryId);
                                                    }
                                                  }}
                                                  updateLineItemAction={updateLineItemInlineAction}
                                                  duplicateLineItemAction={
                                                    duplicateLineItemInlineAction
                                                  }
                                                  deleteLineItemAction={deleteLineItemInlineAction}
                                                />
                                              )}
                                            </EstimateItemSortableRow>
                                          );
                                        })}
                                      </SortableContext>
                                    </DndContext>
                                  )}
                                  {!isReadOnly ? (
                                    <div className="mt-2 inline-block px-1">
                                      <button
                                        type="button"
                                        className={EB.addLineLink}
                                        onClick={() => void addLineToCategory(categoryId)}
                                      >
                                        <Plus className="h-3 w-3" aria-hidden />
                                        Add line
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </ScopeSectionCollapsibleBody>
                              {!isReadOnly ? (
                                <div className={EB.addNextSectionRow}>
                                  {renderContextualSectionAction({
                                    actionKey: `desktop:${categoryId}`,
                                    insertAfterCode: categoryId,
                                    label: "Add Next Section",
                                    ariaLabel: `Add Next Section after ${displayName}`,
                                    inputAriaLabel: `Search section after ${displayName}`,
                                  })}
                                </div>
                              ) : null}
                            </React.Fragment>
                          );

                          return isReadOnly ? (
                            <div
                              key={categoryId}
                              data-estimate-section-id={categoryId}
                              tabIndex={-1}
                              className={cn(
                                EB.categoryGroup,
                                selectedCategoryId === categoryId && "eb-scope-section-current"
                              )}
                              aria-current={selectedCategoryId === categoryId ? "true" : undefined}
                            >
                              {categorySectionBody(null)}
                            </div>
                          ) : (
                            <EstimateScopeSortableSection
                              key={categoryId}
                              id={categoryId}
                              isDropTarget={overSectionId === categoryId}
                              className={cn(
                                "transition-colors duration-150",
                                selectedCategoryId === categoryId && "eb-scope-section-current",
                                flashHighlightCategoryId === categoryId && EB.scopeSectionInserted
                              )}
                              ariaCurrent={selectedCategoryId === categoryId ? "true" : undefined}
                            >
                              {(dh) => categorySectionBody(dh)}
                            </EstimateScopeSortableSection>
                          );
                        }
                      );
                      return isReadOnly ? (
                        <div className="eb-scope-sections-list flex flex-col">{categoryNodes}</div>
                      ) : (
                        <DndContext
                          sensors={categorySensors}
                          collisionDetection={closestCenter}
                          onDragStart={() => setSectionDragging(true)}
                          onDragOver={(e) => setOverSectionId(e.over ? String(e.over.id) : null)}
                          onDragCancel={() => {
                            setSectionDragging(false);
                            setOverSectionId(null);
                          }}
                          onDragEnd={(e) => void handleCategoryDragEnd(e)}
                        >
                          <SortableContext
                            items={costBreakdownSections.map((s) => s.categoryId)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div
                              className="eb-scope-sections-list flex flex-col"
                              data-section-dragging={sectionDragging ? "true" : undefined}
                            >
                              {categoryNodes}
                            </div>
                          </SortableContext>
                        </DndContext>
                      );
                    })()}
                  </div>
                  {!isReadOnly && costBreakdownSections.length > 0 ? (
                    <div className={cn(EB.addNextSectionRow, EB.addFinalSectionRow)}>
                      {renderContextualSectionAction({
                        actionKey: "final",
                        insertAfterCode:
                          costBreakdownSections[costBreakdownSections.length - 1]?.categoryId ??
                          null,
                        label: "Add Final Section",
                        ariaLabel: "Add Final Section",
                        inputAriaLabel: "Search final section",
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <EstimateNotesClarifications
            notes={localDocumentNotes}
            onNotesChange={updateDocumentNotes}
            disabled={isReadOnly}
            defaultCollapsed={localDocumentNotes.length === 0}
          />

          <EstimateBuilderAdvanced
            title="Payment schedule"
            defaultOpen={paymentSchedule.length > 0}
            className="mt-4"
          >
            <EstimatePaymentSchedule
              estimateId={estimateId}
              paymentSchedule={paymentSchedule}
              estimateTotal={summary?.grandTotal ?? 0}
              isLocked={isReadOnly}
              canCreateMilestoneInvoices={status === "Approved" || status === "Converted"}
              invoiceProjectLink={invoiceProjectLink}
              invoiceSummaries={paymentInvoiceSummaries}
              invoiceContext={{
                estimateNumber,
                customerName: meta.client.name,
                projectName: meta.project.name,
              }}
              nested
              paymentTemplates={paymentTemplates}
              addPaymentMilestoneAction={addPaymentMilestoneInlineAction}
              updatePaymentMilestoneAction={updatePaymentMilestoneInlineAction}
              deletePaymentMilestoneAction={deletePaymentMilestoneInlineAction}
              markPaymentMilestonePaidAction={markPaymentMilestonePaidAction}
              reorderPaymentScheduleAction={reorderPaymentScheduleAction}
              applyPaymentTemplateAction={applyPaymentTemplateAction}
              createPaymentTemplateAction={createPaymentTemplateAction}
            />
          </EstimateBuilderAdvanced>
        </div>
      </div>

      {isReadOnly ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-3 py-2 lg:hidden",
            EB.glassMobileBar
          )}
          aria-label="Estimate total"
        >
          <EstimateBuilderMobileSummary summary={summary} />
        </div>
      ) : null}
    </React.Fragment>
  );
}

function LineItemRow({
  row,
  estimateId,
  categoryId,
  lineOrdinal,
  isLocked,
  sectionOptions,
  onMoveToSection,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  reorderDisabled,
  dragHandle,
  onCommitFromPrice,
  onDuplicated,
  onDeleted,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
}: {
  row: EstimateItemRow;
  estimateId: string;
  categoryId: string;
  lineOrdinal: number;
  isLocked: boolean;
  sectionOptions: EstimateSectionOption[];
  onMoveToSection?: (costCode: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reorderDisabled?: boolean;
  dragHandle?: React.ReactNode;
  onCommitFromPrice?: () => void;
  onDuplicated?: (itemId: string) => void;
  onDeleted?: () => void;
  updateLineItemAction: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
  duplicateLineItemAction: (
    fd: FormData
  ) => Promise<{ ok: boolean; itemId?: string; error?: string }>;
  deleteLineItemAction: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const { markUnsaved, trackMutation } = useEstimateDocumentSave();
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
  const skipNextBlurRef = React.useRef(false);
  const combinedDesc = desc.trim() ? `${title}\n${desc}` : title;

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

  const lineItemFormData = React.useCallback((): FormData => {
    const formData = new FormData();
    formData.set("estimateId", estimateId);
    formData.set("itemId", row.id);
    formData.set("desc", combinedDesc);
    formData.set("qty", String(qty));
    formData.set("unit", unit);
    formData.set("unitCost", String(unitCost));
    return formData;
  }, [combinedDesc, estimateId, qty, row.id, unit, unitCost]);

  const submitForm = async (): Promise<boolean> => {
    if (isLocked) return true;
    const result = await trackMutation(`line:update:${row.id}`, () =>
      updateLineItemAction(lineItemFormData())
    );
    if (!result.ok) {
      toast({
        title: "Save failed",
        description: result.error ?? "Could not save this line item.",
        variant: "error",
      });
      return false;
    }
    return true;
  };

  const submitOnBlur = (): void => {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      return;
    }
    void submitForm();
  };

  const runLineAction = React.useCallback(
    async (
      action: (formData: FormData) => Promise<{ ok: boolean; itemId?: string; error?: string }>,
      failureTitle: string,
      operationKey: string,
      onSuccess?: (result: { ok: boolean; itemId?: string; error?: string }) => void
    ): Promise<void> => {
      markUnsaved();
      const formData = new FormData();
      formData.set("estimateId", estimateId);
      formData.set("itemId", row.id);
      const result = await trackMutation(operationKey, () => action(formData));
      if (result.ok) {
        onSuccess?.(result);
        router.refresh();
        return;
      }
      toast({
        title: failureTitle,
        description: result.error ?? "Try again.",
        variant: "error",
      });
    },
    [estimateId, markUnsaved, router, row.id, toast, trackMutation]
  );

  const lineActions = !isLocked ? (
    <>
      <EstimateLineItemMoreMenu
        hideAmountOnPdf={row.hideAmountOnPdf}
        showHideAmountOnPdf
        onToggleHideAmountOnPdf={() => {
          const fd = new FormData();
          fd.set("estimateId", estimateId);
          fd.set("itemId", row.id);
          fd.set("hideAmountOnPdf", row.hideAmountOnPdf ? "0" : "1");
          markUnsaved();
          void trackMutation(`line:hide:${row.id}`, () =>
            toggleLineItemHideAmountOnPdfAction(fd)
          ).then((res) => {
            if (res.ok) router.refresh();
          });
        }}
        showSetStatus
        currentStatus={row.status}
        onSetStatus={(nextStatus) => {
          const fd = new FormData();
          fd.set("estimateId", estimateId);
          fd.set("itemId", row.id);
          fd.set("status", nextStatus);
          markUnsaved();
          void trackMutation(`line:status:${row.id}`, () => setLineItemStatusAction(fd)).then(
            (res) => {
              if (res.ok) router.refresh();
            }
          );
        }}
        onDuplicate={() =>
          void runLineAction(
            duplicateLineItemAction,
            "Could not duplicate item",
            `line:duplicate:${row.id}`,
            (result) => {
              if (result.itemId) onDuplicated?.(result.itemId);
            }
          )
        }
        onDelete={() =>
          void runLineAction(
            deleteLineItemAction,
            "Could not delete item",
            `line:delete:${row.id}`,
            () => onDeleted?.()
          )
        }
        currentSectionCode={categoryId}
        moveSectionOptions={sectionOptions}
        onMoveToSection={onMoveToSection}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        reorderDisabled={reorderDisabled}
      />
    </>
  ) : null;

  const inlinePricing = (
    <>
      <div className={cn(EB.lineFieldStackContents, EB.linePricingQty)}>
        <span className={cn(EB.readLabel, EB.lineQtyLabel)}>Qty</span>
        {isLocked ? (
          <span
            className={cn(
              "flex h-8 min-h-8 items-center justify-end px-2 text-hh-table-cell text-foreground",
              EB.inputNumeric,
              EB.lineQtyInput
            )}
          >
            {row.qty}
          </span>
        ) : (
          <Input
            type="number"
            name="qty"
            step="1"
            min={0}
            value={qty}
            onChange={(e) => {
              markUnsaved();
              setQty(Math.max(0, Number(e.target.value) || 0));
            }}
            onBlur={submitOnBlur}
            className={ebInput(`h-8 min-h-8 w-full px-2 ${EB.inputNumeric} ${EB.lineQtyInput}`)}
            aria-label="Line item quantity"
          />
        )}
      </div>
      <div className={cn(EB.lineFieldStackContents, EB.linePricingMeasure)}>
        <span className={cn(EB.readLabel, EB.lineMeasureLabel)}>Unit</span>
        {isLocked ? (
          <span
            className={cn(
              "flex h-8 min-h-8 items-center px-2 text-hh-table-cell text-foreground",
              EB.inputMuted,
              EB.lineMeasureInput
            )}
          >
            {row.unit || "—"}
          </span>
        ) : (
          <Input
            type="text"
            value={unit}
            onChange={(e) => {
              markUnsaved();
              setUnit(e.target.value);
            }}
            onBlur={submitOnBlur}
            className={ebInput(`h-8 min-h-8 w-full px-2 ${EB.lineMeasureInput}`)}
            aria-label="Line item unit"
            placeholder="EA"
          />
        )}
      </div>
      <div className={cn(EB.lineFieldStackContents, EB.linePricingUnit)}>
        <span className={cn(EB.readLabel, EB.lineUnitLabel)}>Unit price</span>
        {isLocked ? (
          <span
            className={cn(
              "flex h-8 min-h-8 items-center justify-end px-2 text-hh-table-cell text-foreground",
              EB.inputNumeric,
              EB.lineUnitInput
            )}
          >
            {formatEstimateCurrency(row.unitCost)}
          </span>
        ) : (
          <Input
            type="number"
            name="unitCost"
            step="0.01"
            min={0}
            value={unitCost}
            onChange={(e) => {
              markUnsaved();
              setUnitCost(Math.max(0, Number(e.target.value) || 0));
            }}
            onBlur={submitOnBlur}
            onKeyDown={(event) => {
              if (!shouldCommitEstimateLineFromPrice(event)) return;
              event.preventDefault();
              void submitForm().then((saved) => {
                if (!saved) return;
                skipNextBlurRef.current = true;
                onCommitFromPrice?.();
              });
            }}
            className={ebInput(`h-8 min-h-8 w-full px-2 ${EB.inputNumeric} ${EB.lineUnitInput}`)}
            aria-label="Line item unit price"
          />
        )}
      </div>
      <div className={cn(EB.linePricingTotalCol, EB.lineTotalActionArea)}>
        <div className={EB.lineTotalBlock}>
          <span className={cn(EB.readLabel, EB.lineTotalLabel)}>Total</span>
          <div className={cn(EB.linePricingTotal, EB.lineTotalAmount)}>
            <span className={cn(EB.lineTotal, "leading-none")}>
              {formatEstimateCurrency(lineTotalDisplay)}
            </span>
          </div>
        </div>
        {lineActions}
      </div>
    </>
  );

  return (
    <div className={EB.lineItemCard} data-estimate-line-item-id={row.id}>
      <ProposalScopeWorkCard
        lineItemGridLayout
        readOnly={isLocked}
        title={title}
        description={desc}
        onTitleChange={
          isLocked
            ? undefined
            : (v) => {
                markUnsaved();
                setTitle(v);
              }
        }
        onDescriptionChange={
          isLocked
            ? undefined
            : (v) => {
                markUnsaved();
                setDesc(v);
              }
        }
        onTitleBlur={isLocked ? undefined : submitOnBlur}
        onDescriptionBlur={isLocked ? undefined : submitOnBlur}
        titleInputAriaLabel={isLocked ? undefined : "Line item title"}
        descriptionEditorAriaLabel={isLocked ? undefined : "Line item description"}
        lineIndex={lineOrdinal}
        titleTrailingSlot={
          <div className="flex flex-wrap items-center gap-1.5">
            <EstimateLineItemStatusPill status={row.status} />
            {row.hideAmountOnPdf ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/55 px-1.5 py-0.5 text-hh-status font-medium text-muted-foreground"
                aria-label="PDF amount hidden"
                title="This line's amount is hidden on Itemized PDF output"
              >
                <EyeOff className="h-3 w-3" aria-hidden />
                PDF amount hidden
              </span>
            ) : null}
          </div>
        }
        inlinePricing={inlinePricing}
        dragSlot={dragHandle}
        duplicateNode={undefined}
        deleteNode={undefined}
      />
    </div>
  );
}

function AddCategoryBlock({
  estimateId,
  allCategoryCodes,
  existingCategoryCodes,
  getCategoryDisplayName,
  pendingSelectNewCategory,
  onPendingSelectNewCategoryConsumed,
  onFocusExistingCategory,
  onPostCreateCategoryUx,
  instanceId,
  compact = false,
  autoFocus = false,
  commitOnSelect = false,
  preferBelow = false,
  insertAfterCategoryCode,
  inputAriaLabel = "Search or add section",
  onDismiss,
}: {
  estimateId: string;
  allCategoryCodes: string[];
  existingCategoryCodes: string[];
  getCategoryDisplayName: (code: string) => string;
  pendingSelectNewCategory?: { code: string; displayName: string } | null;
  onPendingSelectNewCategoryConsumed?: () => void;
  /** Focus an already-added section instead of adding another blank line item to it. */
  onFocusExistingCategory?: (code: string, displayName: string) => void;
  /** Scroll + highlight + bottom-bar selection after creating a category from this block. */
  onPostCreateCategoryUx?: (
    code: string,
    displayName: string,
    insertAfterCode?: string | null
  ) => void | Promise<void>;
  instanceId?: string;
  compact?: boolean;
  autoFocus?: boolean;
  commitOnSelect?: boolean;
  preferBelow?: boolean;
  insertAfterCategoryCode?: string | null;
  inputAriaLabel?: string;
  onDismiss?: (reason: "escape" | "outside" | "selection") => void;
}) {
  const router = useRouter();
  const portalContainer = useHhPortalContainer();
  const { context: hhContext, theme: hhTheme } = useHhTheme();
  const { toast } = useToast();
  const { markUnsaved, trackMutation } = useEstimateDocumentSave();
  const allCodesWithLabels = React.useMemo(
    () => allCategoryCodes.map((code) => ({ code, name: getCategoryDisplayName(code) })),
    [allCategoryCodes, getCategoryDisplayName]
  );
  const existingCategorySet = React.useMemo(
    () => new Set(existingCategoryCodes),
    [existingCategoryCodes]
  );
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [selectedCode, setSelectedCode] = React.useState<string | null>(null);
  /** When user uses “Create …”, store label for display + optional save with add category. */
  const [customCategoryLabel, setCustomCategoryLabel] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const inputId = instanceId ? `add-section-input-${instanceId}` : "add-section-input";
  const containerId = instanceId ? `estimate-add-section-${instanceId}` : "estimate-add-section";
  const containerRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = React.useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "above" | "below";
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
      if (!inContainer && !inMenu) {
        setOpen(false);
        onDismiss?.("outside");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onDismiss]);

  React.useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => {
      if (!containerRef.current?.getClientRects().length) return;
      inputRef.current?.focus({ preventScroll: true });
      setOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);

  const computeMenuPosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const desiredMax = 240;
    const padding = 12;
    let rect = anchor.getBoundingClientRect();
    let belowTop = rect.bottom + 4;
    let belowAvail = window.innerHeight - belowTop - padding;
    if (preferBelow && belowAvail < desiredMax) {
      const scrollAmount = Math.min(
        desiredMax - belowAvail,
        Math.max(0, rect.top - (88 + padding))
      );
      if (scrollAmount > 0) {
        let scrollParent: HTMLElement | null = anchor.parentElement;
        while (scrollParent) {
          const style = window.getComputedStyle(scrollParent);
          const scrollable =
            /(auto|scroll)/.test(style.overflowY) &&
            scrollParent.scrollHeight > scrollParent.clientHeight;
          if (scrollable) break;
          scrollParent = scrollParent.parentElement;
        }
        if (scrollParent) {
          // The workspace uses `scroll-smooth`; assigning scrollTop keeps this
          // positioning correction synchronous so the portal never flashes
          // outside the viewport while the animation catches up.
          const previousScrollBehavior = scrollParent.style.scrollBehavior;
          scrollParent.style.scrollBehavior = "auto";
          scrollParent.scrollTop += scrollAmount;
          window.requestAnimationFrame(() => {
            scrollParent.style.scrollBehavior = previousScrollBehavior;
          });
        } else {
          window.scrollTo(window.scrollX, window.scrollY + scrollAmount);
        }
        rect = anchor.getBoundingClientRect();
        belowTop = rect.bottom + 4;
        belowAvail = window.innerHeight - belowTop - padding;
      }
    }
    const maxWidth = Math.max(0, window.innerWidth - padding * 2);
    const width = Math.min(rect.width, maxWidth);
    const left = Math.min(Math.max(rect.left, padding), window.innerWidth - padding - width);
    if (preferBelow || belowAvail >= 160) {
      setMenuPos({
        top: belowTop,
        left,
        width,
        maxHeight: Math.max(120, Math.min(desiredMax, belowAvail)),
        placement: "below",
      });
      return;
    }
    const aboveAvail = rect.top - padding;
    const maxHeight = Math.max(120, Math.min(desiredMax, aboveAvail));
    setMenuPos({
      top: Math.max(padding, rect.top - 4 - maxHeight),
      left,
      width,
      maxHeight,
      placement: "above",
    });
  }, [preferBelow]);

  const reservedMenuHeight = React.useMemo(() => {
    if (!open) return 0;
    const optionCount = Math.max(1, visibleOptions.length + (canInstantCreate ? 1 : 0));
    const contentHeight = Math.min(240, optionCount * 36 + 8) + 4;
    if (preferBelow) return contentHeight;
    if (menuPos?.placement !== "below") return 0;
    return Math.min(menuPos.maxHeight, contentHeight) + 4;
  }, [canInstantCreate, menuPos, open, preferBelow, visibleOptions.length]);

  React.useLayoutEffect(() => {
    if (!open || !preferBelow || reservedMenuHeight <= 0) return;
    // A bottom-of-page selector can only scroll its nearest container after
    // the reserved menu space participates in layout.
    const frame = window.requestAnimationFrame(computeMenuPosition);
    return () => window.cancelAnimationFrame(frame);
  }, [computeMenuPosition, open, preferBelow, reservedMenuHeight]);

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
        markUnsaved();
        const res = await trackMutation(`section:create:${trimmed}`, () =>
          createCustomEstimateCategoryAction(estimateId, trimmed)
        );
        if (res.ok && res.costCode) {
          await onPostCreateCategoryUx?.(res.costCode, trimmed, insertAfterCategoryCode);
          setSelectedCode(res.costCode);
          setCustomCategoryLabel(trimmed);
          setSearch("");
          setOpen(false);
          onDismiss?.("selection");
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
    [
      estimateId,
      insertAfterCategoryCode,
      markUnsaved,
      onDismiss,
      onPostCreateCategoryUx,
      router,
      toast,
      trackMutation,
    ]
  );

  const handleInstantCreateCategory = () => {
    if (!canInstantCreate || busy) return;
    void createWithName(search);
  };

  const focusExistingSection = React.useCallback(
    (code: string, displayName: string) => {
      onFocusExistingCategory?.(code, displayName);
      setSelectedCode(null);
      setCustomCategoryLabel(null);
      setSearch("");
      setOpen(false);
      onDismiss?.("selection");
    },
    [onDismiss, onFocusExistingCategory]
  );

  const addSelectedCategory = React.useCallback(
    async (code: string, displayName?: string | null) => {
      setBusy(true);
      try {
        const name = displayName?.trim() ?? "";
        markUnsaved();
        const res = await trackMutation(`line:add:${code}`, () =>
          addLineItemCatalogInlineAction(estimateId, code, name)
        );
        if (res.ok) {
          const displayLabel = name || getCategoryDisplayName(code) || code;
          await onPostCreateCategoryUx?.(code, displayLabel, insertAfterCategoryCode);
          setSearch("");
          setSelectedCode(null);
          setCustomCategoryLabel(null);
          setOpen(false);
          onDismiss?.("selection");
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
    },
    [
      estimateId,
      getCategoryDisplayName,
      insertAfterCategoryCode,
      markUnsaved,
      onDismiss,
      onPostCreateCategoryUx,
      router,
      toast,
      trackMutation,
    ]
  );

  const runAdd = React.useCallback(async () => {
    if (busy) return;
    const typedName = search.trim();
    if (typedName) {
      await createWithName(typedName);
      return;
    }
    if (selectedCode) {
      await addSelectedCategory(selectedCode, customCategoryLabel);
      return;
    }
    inputRef.current?.focus();
    setOpen(true);
    toast({
      title: "Enter a section name",
      description: "Type a name to create one, or pick a section from the list.",
      variant: "error",
    });
  }, [addSelectedCategory, busy, createWithName, customCategoryLabel, search, selectedCode, toast]);

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
      onDismiss?.("escape");
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
        if (existingCategorySet.has(cc.code)) {
          focusExistingSection(cc.code, cc.name);
          return;
        }
        if (commitOnSelect) {
          void addSelectedCategory(cc.code, cc.name);
        } else {
          setSelectedCode(cc.code);
          setCustomCategoryLabel(null);
          setSearch("");
          setOpen(false);
        }
      }
    }
  };

  const handleSelect = (code: string) => {
    const displayName = getCategoryDisplayName(code);
    if (existingCategorySet.has(code)) {
      focusExistingSection(code, displayName);
      return;
    }
    if (commitOnSelect) {
      void addSelectedCategory(code, displayName);
      return;
    }
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
    <div
      id={containerId}
      ref={containerRef}
      className={cn(EB.addSectionComposer, compact ? "eb-add-section-composer--compact" : "mb-4")}
    >
      {!compact ? <p className="eb-composer-hint mb-2">New section</p> : null}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={cn("relative min-w-[200px] flex-1", !compact && "max-w-md")}>
          <Label htmlFor={inputId} className={compact ? "sr-only" : EB.label}>
            Section name
          </Label>
          <div ref={anchorRef} className="relative">
            <Input
              ref={inputRef}
              id={inputId}
              aria-label={inputAriaLabel}
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
              onClick={() => setOpen(true)}
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
                    data-hh-context={hhContext}
                    data-hh-theme={hhTheme}
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
                              "flex items-center gap-2",
                              highlightIndex === i && EB.commandMenuItemActive,
                              existingCategorySet.has(cc.code) && "opacity-55"
                            )}
                            onMouseEnter={() => setHighlightIndex(i)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelect(cc.code)}
                          >
                            <span>{cc.name}</span>
                            {existingCategorySet.has(cc.code) ? (
                              <span className="ml-auto text-hh-status text-zinc-500">
                                Already added
                              </span>
                            ) : null}
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
                            onMouseDown={(event) => event.preventDefault()}
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
                  portalContainer ?? document.body
                )
              : null}
          </div>
        </div>
        {!compact ? (
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
        ) : null}
      </div>
      {reservedMenuHeight > 0 ? (
        <div
          aria-hidden="true"
          data-testid="estimate-section-menu-space"
          style={{ height: reservedMenuHeight }}
        />
      ) : null}
    </div>
  );
}

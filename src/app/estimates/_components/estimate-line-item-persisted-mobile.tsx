"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { EstimateItemRow } from "@/lib/data";
import {
  combineLineItemDesc,
  editorLineTotalFromParts,
  rowToEditorLineItem,
  splitLineItemDesc,
  type EditorLineItem,
} from "./estimate-line-item-model";
import { EstimateLineItemMobileCard } from "./estimate-line-item-mobile-card";
import { formatEstimateCurrency, roundEstimateCurrencyValue } from "./estimate-currency";
import { setLineItemStatusAction, toggleLineItemHideAmountOnPdfAction } from "../[id]/actions";
import { useEstimateDocumentSave } from "./estimate-document-save-context";
import { createEstimateSerialMutationQueue } from "./estimate-mutation-coordinator";
import { useToast } from "@/components/toast/toast-provider";

type LineItemMutationResult = { ok: boolean; itemId?: string; error?: string };
type LineItemMutation = (formData: FormData) => Promise<LineItemMutationResult>;

export function EstimateLineItemPersistedMobile({
  row,
  rowIndex,
  estimateId,
  categoryId,
  isReadOnly,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
  isLastRow,
  onEnterAddNext,
  sectionOptions,
  onMoveToSection,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  reorderDisabled,
  onDuplicated,
  onDeleted,
}: {
  row: EstimateItemRow;
  rowIndex: number;
  estimateId: string;
  categoryId: string;
  isReadOnly: boolean;
  updateLineItemAction: LineItemMutation;
  duplicateLineItemAction: LineItemMutation;
  deleteLineItemAction: LineItemMutation;
  isLastRow?: boolean;
  onEnterAddNext?: () => void;
  sectionOptions: Array<{ code: string; label: string }>;
  onMoveToSection?: (costCode: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reorderDisabled?: boolean;
  onDuplicated?: (itemId: string) => void;
  onDeleted?: () => void;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const { markUnsaved, trackMutation } = useEstimateDocumentSave();
  const split = splitLineItemDesc(row.desc ?? "");
  const [title, setTitle] = React.useState(split.title);
  const [description, setDescription] = React.useState(split.description);
  const [qty, setQty] = React.useState(row.qty);
  const [unit, setUnit] = React.useState(row.unit);
  const [unitPrice, setUnitPrice] = React.useState(roundEstimateCurrencyValue(row.unitCost));
  const draftRef = React.useRef({
    title: split.title,
    description: split.description,
    qty: row.qty,
    unit: row.unit,
    unitPrice: roundEstimateCurrencyValue(row.unitCost),
  });
  const lineSaveQueueRef = React.useRef(createEstimateSerialMutationQueue());

  React.useEffect(() => {
    const s = splitLineItemDesc(row.desc ?? "");
    draftRef.current = {
      title: s.title,
      description: s.description,
      qty: row.qty,
      unit: row.unit,
      unitPrice: roundEstimateCurrencyValue(row.unitCost),
    };
    setTitle(s.title);
    setDescription(s.description);
    setQty(row.qty);
    setUnit(row.unit);
    setUnitPrice(roundEstimateCurrencyValue(row.unitCost));
  }, [row.id, row.desc, row.qty, row.unit, row.unitCost]);

  const item: EditorLineItem = React.useMemo(
    () => ({
      id: row.id,
      costCode: categoryId,
      title,
      description,
      qty,
      unit,
      unitPrice,
      hideAmountOnPdf: row.hideAmountOnPdf,
      status: row.status,
    }),
    [categoryId, description, qty, row.hideAmountOnPdf, row.id, row.status, title, unit, unitPrice]
  );

  const submitUpdate = (): void => {
    if (isReadOnly) return;
    const draft = draftRef.current;
    const formData = new FormData();
    formData.set("estimateId", estimateId);
    formData.set("itemId", row.id);
    formData.set("desc", combineLineItemDesc(draft.title, draft.description));
    formData.set("qty", String(draft.qty));
    formData.set("unit", draft.unit);
    formData.set("unitCost", String(draft.unitPrice));
    void trackMutation(`line:update:${row.id}`, () =>
      lineSaveQueueRef.current.enqueue(() => updateLineItemAction(formData))
    ).then((result) => {
      if (!result.ok) {
        toast({
          title: "Save failed",
          description: result.error ?? "Could not save this line item.",
          variant: "error",
        });
      }
    });
  };

  const runLineAction = async (
    action: LineItemMutation,
    failureTitle: string,
    operationKey: string,
    onSuccess?: (result: LineItemMutationResult) => void
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
  };

  const liveTotal = formatEstimateCurrency(editorLineTotalFromParts(qty, unitPrice));

  if (isReadOnly) {
    return (
      <EstimateLineItemMobileCard
        item={rowToEditorLineItem(row)}
        rowIndex={rowIndex}
        readOnly
        onChange={() => {}}
      />
    );
  }

  return (
    <div data-estimate-line-item-id={row.id}>
      <EstimateLineItemMobileCard
        item={{ ...item, unitPrice, qty, title }}
        rowIndex={rowIndex}
        isLastRow={isLastRow}
        onChange={(patch) => {
          markUnsaved();
          draftRef.current = { ...draftRef.current, ...patch };
          if (patch.title !== undefined) setTitle(patch.title);
          if (patch.description !== undefined) setDescription(patch.description);
          if (patch.qty !== undefined) setQty(patch.qty);
          if (patch.unit !== undefined) setUnit(patch.unit);
          if (patch.unitPrice !== undefined) setUnitPrice(patch.unitPrice);
        }}
        onBlurField={submitUpdate}
        onEnterAddNext={onEnterAddNext}
        currentSectionCode={categoryId}
        moveSectionOptions={sectionOptions}
        onMoveToSection={onMoveToSection}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        reorderDisabled={reorderDisabled}
        onDuplicate={() => {
          void runLineAction(
            duplicateLineItemAction,
            "Could not duplicate item",
            `line:duplicate:${row.id}`,
            (result) => {
              if (result.itemId) onDuplicated?.(result.itemId);
            }
          );
        }}
        onDelete={() => {
          void runLineAction(
            deleteLineItemAction,
            "Could not delete item",
            `line:delete:${row.id}`,
            () => onDeleted?.()
          );
        }}
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
        onSetStatus={(status) => {
          const fd = new FormData();
          fd.set("estimateId", estimateId);
          fd.set("itemId", row.id);
          fd.set("status", status);
          markUnsaved();
          void trackMutation(`line:status:${row.id}`, () => setLineItemStatusAction(fd)).then(
            (res) => {
              if (res.ok) router.refresh();
            }
          );
        }}
      />
      <span className="sr-only" aria-live="polite">
        Total {liveTotal}
      </span>
    </div>
  );
}

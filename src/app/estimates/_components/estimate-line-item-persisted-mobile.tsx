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

export function EstimateLineItemPersistedMobile({
  row,
  rowIndex,
  estimateId,
  categoryId,
  isReadOnly,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
  lineLiveValuesRef,
  isLastRow,
  onEnterAddNext,
}: {
  row: EstimateItemRow;
  rowIndex: number;
  estimateId: string;
  categoryId: string;
  isReadOnly: boolean;
  updateLineItemAction: (fd: FormData) => Promise<void>;
  duplicateLineItemAction: (fd: FormData) => Promise<void>;
  deleteLineItemAction: (fd: FormData) => Promise<void>;
  lineLiveValuesRef: React.MutableRefObject<
    Record<string, () => { qty: number; unit: string; unitCost: number; markupPct: number }>
  >;
  isLastRow?: boolean;
  onEnterAddNext?: () => void;
}): React.ReactElement {
  const router = useRouter();
  const split = splitLineItemDesc(row.desc ?? "");
  const [title, setTitle] = React.useState(split.title);
  const [description, setDescription] = React.useState(split.description);
  const [qty, setQty] = React.useState(row.qty);
  const [unit, setUnit] = React.useState(row.unit);
  const [unitPrice, setUnitPrice] = React.useState(roundEstimateCurrencyValue(row.unitCost));
  const formId = `line-mobile-${row.id}`;

  React.useEffect(() => {
    const s = splitLineItemDesc(row.desc ?? "");
    setTitle(s.title);
    setDescription(s.description);
    setQty(row.qty);
    setUnit(row.unit);
    setUnitPrice(roundEstimateCurrencyValue(row.unitCost));
  }, [row.id, row.desc, row.qty, row.unit, row.unitCost]);

  React.useLayoutEffect(() => {
    if (isReadOnly) return;
    const registry = lineLiveValuesRef.current;
    registry[row.id] = () => ({
      qty,
      unit,
      unitCost: unitPrice,
      markupPct: row.markupPct,
    });
    return () => {
      delete registry[row.id];
    };
  }, [isReadOnly, row.id, row.markupPct, qty, unit, unitPrice, lineLiveValuesRef]);

  const item: EditorLineItem = React.useMemo(
    () => ({
      id: row.id,
      costCode: categoryId,
      title,
      description,
      qty,
      unit,
      unitPrice,
      markupPct: row.markupPct,
      hideAmountOnPdf: row.hideAmountOnPdf,
      status: row.status,
    }),
    [
      categoryId,
      description,
      qty,
      row.hideAmountOnPdf,
      row.id,
      row.markupPct,
      row.status,
      title,
      unit,
      unitPrice,
    ]
  );

  const submitUpdate = (): void => {
    if (isReadOnly) return;
    (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
  };

  const combinedDesc = combineLineItemDesc(title, description);
  const liveTotal = formatEstimateCurrency(editorLineTotalFromParts(qty, unitPrice, row.markupPct));

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
    <div>
      <form id={formId} action={updateLineItemAction} className="hidden" aria-hidden>
        <input type="hidden" name="estimateId" value={estimateId} />
        <input type="hidden" name="itemId" value={row.id} />
        <input type="hidden" name="desc" value={combinedDesc} />
        <input type="hidden" name="qty" value={qty} />
        <input type="hidden" name="unit" value={unit} />
        <input type="hidden" name="unitCost" value={unitPrice} />
        <input type="hidden" name="markupPct" value={String(row.markupPct * 100)} />
      </form>
      <EstimateLineItemMobileCard
        item={{ ...item, unitPrice, qty, title }}
        rowIndex={rowIndex}
        isLastRow={isLastRow}
        onChange={(patch) => {
          if (patch.title !== undefined) setTitle(patch.title);
          if (patch.description !== undefined) setDescription(patch.description);
          if (patch.qty !== undefined) setQty(patch.qty);
          if (patch.unit !== undefined) setUnit(patch.unit);
          if (patch.unitPrice !== undefined) setUnitPrice(patch.unitPrice);
        }}
        onBlurField={submitUpdate}
        onEnterAddNext={onEnterAddNext}
        onDuplicate={() => {
          const fd = new FormData();
          fd.set("estimateId", estimateId);
          fd.set("itemId", row.id);
          void duplicateLineItemAction(fd);
        }}
        onDelete={() => {
          const fd = new FormData();
          fd.set("estimateId", estimateId);
          fd.set("itemId", row.id);
          void deleteLineItemAction(fd);
        }}
        onToggleHideAmountOnPdf={() => {
          const fd = new FormData();
          fd.set("estimateId", estimateId);
          fd.set("itemId", row.id);
          fd.set("hideAmountOnPdf", row.hideAmountOnPdf ? "0" : "1");
          void toggleLineItemHideAmountOnPdfAction(fd).then((res) => {
            if (res.ok) router.refresh();
          });
        }}
        onSetStatus={(status) => {
          const fd = new FormData();
          fd.set("estimateId", estimateId);
          fd.set("itemId", row.id);
          fd.set("status", status);
          void setLineItemStatusAction(fd).then((res) => {
            if (res.ok) router.refresh();
          });
        }}
      />
      <span className="sr-only" aria-live="polite">
        Total {liveTotal}
      </span>
    </div>
  );
}

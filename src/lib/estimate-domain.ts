import type { EstimateItemRow, PaymentScheduleItem } from "@/lib/estimates-db";

/** Visible line total = qty * unitCost. */
export function lineTotal<T extends Pick<EstimateItemRow, "qty" | "unitCost">>(item: T): number {
  return item.qty * item.unitCost;
}

export type EstimateCategorySectionRow = {
  categoryId: string;
  title: string;
  rows: EstimateItemRow[];
  sectionTotal: number;
};

export function groupEstimateItemsByCategoryId(
  items: EstimateItemRow[],
  categories: ReadonlyArray<{ costCode: string; displayName: string; orderIndex?: number }>,
  catalogNameByCode?: Readonly<Record<string, string>>
): EstimateCategorySectionRow[] {
  const byId = new Map<string, EstimateItemRow[]>();
  for (const item of items) {
    const id = item.costCode;
    let list = byId.get(id);
    if (!list) {
      list = [];
      byId.set(id, list);
    }
    list.push(item);
  }

  const persistedIds = new Set(categories.map((category) => category.costCode));
  const sortedPersisted = [...categories].sort((a, b) => {
    const orderA = a.orderIndex ?? 0;
    const orderB = b.orderIndex ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.costCode.localeCompare(b.costCode);
  });

  const sections: EstimateCategorySectionRow[] = [];
  for (const category of sortedPersisted) {
    const rows = byId.get(category.costCode) ?? [];
    sections.push({
      categoryId: category.costCode,
      title:
        category.displayName?.trim() ||
        catalogNameByCode?.[category.costCode]?.trim() ||
        "Category",
      rows,
      sectionTotal: rows.reduce((sum, row) => sum + lineTotal(row), 0),
    });
  }

  const orphanIds = [...byId.keys()]
    .filter((id) => !persistedIds.has(id))
    .sort((a, b) => a.localeCompare(b));
  for (const categoryId of orphanIds) {
    const rows = byId.get(categoryId)!;
    sections.push({
      categoryId,
      title: catalogNameByCode?.[categoryId]?.trim() || "Category",
      rows,
      sectionTotal: rows.reduce((sum, row) => sum + lineTotal(row), 0),
    });
  }

  return sections;
}

/** Authority contract: milestone amounts are stored fixed amounts. */
export function paymentMilestoneAmount(
  item: Pick<PaymentScheduleItem, "amount">,
  estimateTotal: number
): number {
  void estimateTotal;
  return item.amount;
}

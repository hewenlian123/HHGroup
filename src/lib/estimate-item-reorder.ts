export type EstimateItemOrderEntry = {
  id: string;
  costCode: string;
};

export type EstimateItemOrderSection = {
  costCode: string;
  itemIds: readonly string[];
};

export type EstimateItemMoveTarget =
  | { costCode: string; position: "end" }
  | { costCode: string; position: "before" | "after"; itemId: string };

/**
 * Builds the complete normalized item order sent to the atomic reorder RPC.
 * The result contains every source item exactly once and changes only the
 * moved item's Section relationship.
 */
export function buildEstimateItemMoveOrder(
  sections: readonly EstimateItemOrderSection[],
  movingItemId: string,
  target: EstimateItemMoveTarget
): EstimateItemOrderEntry[] | null {
  const seen = new Set<string>();
  let sourceCostCode: string | null = null;
  let invalid = false;
  const nextSections = sections.map((section) => {
    const itemIds: string[] = [];
    for (const itemId of section.itemIds) {
      if (!itemId || seen.has(itemId)) {
        invalid = true;
        continue;
      }
      seen.add(itemId);
      if (itemId === movingItemId) sourceCostCode = section.costCode;
      else itemIds.push(itemId);
    }
    return { costCode: section.costCode, itemIds };
  });

  if (invalid || !sourceCostCode) return null;
  const targetSection = nextSections.find((section) => section.costCode === target.costCode);
  if (!targetSection) return null;

  let insertIndex = targetSection.itemIds.length;
  if (target.position !== "end") {
    const targetIndex = targetSection.itemIds.indexOf(target.itemId);
    if (targetIndex < 0) return null;
    insertIndex = target.position === "before" ? targetIndex : targetIndex + 1;
  }
  targetSection.itemIds.splice(insertIndex, 0, movingItemId);

  return nextSections.flatMap((section) =>
    section.itemIds.map((id) => ({ id, costCode: section.costCode }))
  );
}

export function persistedEstimateItemOrder(
  items: ReadonlyArray<{ id: string; costCode: string; sortOrder: number }>
): EstimateItemOrderEntry[] {
  return items
    .slice()
    .sort((a, b) => {
      const delta = Number(a.sortOrder) - Number(b.sortOrder);
      return delta === 0 ? a.id.localeCompare(b.id) : delta;
    })
    .map((item) => ({ id: item.id, costCode: item.costCode }));
}

export function persistedEstimateItemIds(
  items: ReadonlyArray<{ id: string; costCode?: string; sortOrder: number }>
): string[] {
  return items
    .slice()
    .sort((a, b) => {
      const delta = Number(a.sortOrder) - Number(b.sortOrder);
      return delta === 0 ? a.id.localeCompare(b.id) : delta;
    })
    .map((item) => item.id);
}

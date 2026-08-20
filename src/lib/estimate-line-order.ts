export type EstimateLineOrderEntry = {
  id: string;
  costCode: string;
  sortOrder?: number | null;
};

/**
 * Returns a stable sort position directly after the source line when the
 * persisted ordering contract is available. Legacy rows without sort order
 * intentionally return undefined so callers retain their existing append path.
 */
export function resolveDuplicateEstimateLineSortOrder(
  rows: readonly EstimateLineOrderEntry[],
  sourceId: string
): number | undefined {
  const source = rows.find((row) => row.id === sourceId);
  if (source?.sortOrder == null || !Number.isFinite(Number(source.sortOrder))) return undefined;
  const sourceOrder = Number(source.sortOrder);

  const orderedSectionRows = rows
    .filter((row) => row.costCode === source.costCode && Number.isFinite(Number(row.sortOrder)))
    .slice()
    .sort((a, b) => {
      const orderDelta = Number(a.sortOrder) - Number(b.sortOrder);
      return orderDelta === 0 ? a.id.localeCompare(b.id) : orderDelta;
    });
  const sourceIndex = orderedSectionRows.findIndex((row) => row.id === sourceId);
  const nextOrder = Number(orderedSectionRows[sourceIndex + 1]?.sortOrder);

  if (Number.isFinite(nextOrder) && nextOrder > sourceOrder) {
    return sourceOrder + (nextOrder - sourceOrder) / 2;
  }
  return sourceOrder + 0.5;
}

export type EstimateLineOrderEntry = {
  id: string;
  costCode: string;
  sortOrder?: number | null;
};

/**
 * Append within the source section using the existing integer ordering contract.
 * Legacy rows without sort order retain the caller's existing append path.
 */
export function resolveDuplicateEstimateLineSortOrder(
  rows: readonly EstimateLineOrderEntry[],
  sourceId: string
): number | undefined {
  const source = rows.find((row) => row.id === sourceId);
  if (source?.sortOrder == null || !Number.isInteger(source.sortOrder)) return undefined;
  let maxOrder = source.sortOrder;
  for (const row of rows) {
    if (row.sortOrder != null && Number.isInteger(row.sortOrder)) {
      maxOrder = Math.max(maxOrder, row.sortOrder);
    }
  }
  return maxOrder + 1;
}

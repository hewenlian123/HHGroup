export type ReceiptQueueDirection = "previous" | "next";

/**
 * Resolve an adjacent receipt from the current filtered queue without wrapping.
 * The caller captures the result before a canonical mutation can remove the
 * current item from that queue.
 */
export function adjacentReceiptId(
  receiptIds: readonly string[],
  currentId: string,
  direction: ReceiptQueueDirection
): string | null {
  const currentIndex = receiptIds.indexOf(currentId);
  if (currentIndex < 0) return null;
  const targetIndex = currentIndex + (direction === "next" ? 1 : -1);
  return receiptIds[targetIndex] ?? null;
}

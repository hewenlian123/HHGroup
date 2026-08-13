export type ChangeOrderAmountRow = {
  total?: unknown;
  total_amount?: unknown;
};

/**
 * Production Change Order amount contract:
 * - `total` is the authoritative header amount used by approval and aggregation.
 * - `total_amount` is retained only as a legacy fallback when `total` is absent.
 *
 * Nullish selection deliberately preserves a legitimate stored zero.
 */
export const PROJECT_CHANGE_ORDER_AMOUNT_COLUMNS = "total,total_amount";

export function changeOrderAmountValue(row: ChangeOrderAmountRow): unknown {
  return row.total ?? row.total_amount;
}

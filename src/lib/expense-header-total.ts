export function roundExpenseMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function expenseLinesTotal(amounts: readonly number[]): number {
  return roundExpenseMoney(
    amounts.reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0)
  );
}

export function expenseHeaderMatchesLines(
  headerTotal: number | null | undefined,
  lineAmounts: readonly number[]
): boolean {
  if (headerTotal == null || !Number.isFinite(headerTotal)) return false;
  return Math.abs(roundExpenseMoney(headerTotal) - expenseLinesTotal(lineAmounts)) <= 0.009;
}

/**
 * Single-line drafts can take the line amount as the header.
 * Multi-line mismatches stay blocked so a silent header rewrite cannot hide a split error.
 */
export function singleLineHeaderSyncAmount(lineAmounts: readonly number[]): number | null {
  if (lineAmounts.length !== 1) return null;
  const amount = lineAmounts[0];
  if (amount == null || !Number.isFinite(amount)) return null;
  return roundExpenseMoney(amount);
}

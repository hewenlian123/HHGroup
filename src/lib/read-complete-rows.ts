/** Bounded reads: callers supply a fresh, exact-count query selecting a stable id. */
type ReadQuery<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}> & {
  order(column: string, options: { ascending: boolean }): ReadQuery<T>;
  range(from: number, to: number): ReadQuery<T>;
  abortSignal(signal: AbortSignal): ReadQuery<T>;
};

export async function readCompleteRows<T>(
  query: () => ReadQuery<T>,
  source = "ledger",
  identityColumn = "id"
): Promise<{ data: T[]; error: null }> {
  // ponytail: 10,000 rows per source; a snapshot aggregate RPC is required beyond this bounded read.
  const pageSize = 500;
  const ceiling = 10000;
  const data: T[] = [];
  const ids = new Set<string>();
  let expected: number | null = null;
  const signal = AbortSignal.timeout(30000);
  for (let offset = 0; offset < ceiling; offset += pageSize) {
    const page = await query()
      .order(identityColumn, { ascending: true })
      .range(offset, offset + pageSize - 1)
      .abortSignal(signal);
    if (page.error) throw new Error(`${source} unavailable: ${page.error.message}`);
    if (
      !Array.isArray(page.data) ||
      typeof page.count !== "number" ||
      !Number.isSafeInteger(page.count) ||
      page.count < 0
    )
      throw new Error(`${source} unavailable: missing rows or exact count`);
    expected ??= page.count;
    if (expected > ceiling || page.count !== expected)
      throw new Error(
        "Complete ledger read unavailable: source exceeds 10000 rows or changed during read"
      );
    if (page.data.length !== Math.min(pageSize, expected - offset))
      throw new Error("Complete ledger read unavailable: truncated or changing page");
    for (const row of page.data) {
      const id = (row as Record<string, unknown>)[identityColumn];
      if (typeof id !== "string" || !id || ids.has(id))
        throw new Error("Complete ledger read unavailable: missing or duplicate row identity");
      ids.add(id);
      data.push(row);
    }
    if (data.length === expected) return { data, error: null };
  }
  throw new Error("Complete ledger read unavailable: bounded read exhausted");
}

/**
 * Fixed Playwright / supabase/seed.sql labor worker UUID.
 * Must stay aligned with `tests/e2e-cleanup-db.ts` (`E2E_PRESERVED_WORKER_ID`).
 */
export const E2E_SEED_WORKER_ID = "22222222-2222-2222-2222-222222222222";

function normalizeWorkerId(id: string): string {
  return id.trim().toLowerCase();
}

/** Production Next builds should not surface the seed worker in Worker Balances (defense in depth). */
export function shouldOmitE2ESeedWorkerFromBalances(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Remove the seed worker from the balance list when running a production build. */
export function omitE2ESeedWorkerFromBalanceWorkers<T extends { id: string }>(workers: T[]): T[] {
  if (!shouldOmitE2ESeedWorkerFromBalances()) return workers;
  const key = normalizeWorkerId(E2E_SEED_WORKER_ID);
  return workers.filter((w) => normalizeWorkerId(w.id) !== key);
}

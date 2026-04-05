/**
 * Client-side UI action timing for perf checks (confirm <100ms feel, nav <200ms).
 * Logs to console so you can verify responsiveness in DevTools.
 */
export function uiActionMark(): number {
  if (typeof performance === "undefined") return 0;
  return performance.now();
}

export function uiActionLog(label: string, startedAt: number, budgetMs: number): void {
  if (typeof performance === "undefined") return;
  const elapsed = performance.now() - startedAt;
  const payload = { label, elapsedMs: Math.round(elapsed * 10) / 10, budgetMs };
  if (elapsed > budgetMs) {
    console.warn("[ui-perf] slow", payload);
  } else {
    console.debug("[ui-perf]", payload);
  }
}

export function uiNavMark(): number {
  return uiActionMark();
}

export function uiNavLog(label: string, startedAt: number, budgetMs = 200): void {
  uiActionLog(label, startedAt, budgetMs);
}

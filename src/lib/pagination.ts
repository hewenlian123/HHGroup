export function clampPage(page: number, totalPages: number): number {
  const tp = Math.max(1, totalPages);
  const p = Number.isFinite(page) ? page : 1;
  return Math.min(Math.max(1, Math.floor(p)), tp);
}

export function pageToRange(page: number, pageSize: number): { from: number; to: number } {
  const ps = Math.max(1, Math.floor(pageSize));
  const p = Math.max(1, Math.floor(page));
  const from = (p - 1) * ps;
  const to = from + ps - 1;
  return { from, to };
}


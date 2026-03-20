/**
 * Auto-generate the next 6-digit cost code from existing category codes on an estimate.
 * - Uses only strings that are entirely digits (1–6 chars); others ignored.
 * - Next value = max + 10000, formatted with padStart(6, "0").
 * - No valid codes → "010000".
 */
export function generateCode(categories: Iterable<string>): string {
  let max = 0;
  let any = false;
  for (const raw of categories) {
    const s = String(raw ?? "").trim();
    if (!/^\d+$/.test(s) || s.length > 6) continue;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 0 || n > 999_999) continue;
    any = true;
    if (n > max) max = n;
  }
  if (!any) return "010000";
  const next = max + 10_000;
  const clamped = Math.min(next, 999_999);
  return String(clamped).padStart(6, "0");
}

/** Next unused 6-digit code; aligns with server `generateUniqueCustomCostCode` / Add Category modal. */
export function pickNextUniqueCostCode(usedCostCodes: Iterable<string>): string {
  const used = new Set(Array.from(usedCostCodes, (c) => String(c ?? "").trim()).filter(Boolean));
  let candidate = generateCode(used);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!used.has(candidate)) return candidate;
    const n = Number.parseInt(candidate, 10);
    if (!Number.isFinite(n)) break;
    candidate = String(Math.min(n + 10_000, 999_999)).padStart(6, "0");
  }
  return candidate;
}

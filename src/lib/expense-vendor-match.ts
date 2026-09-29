export type VendorCandidate = {
  id: string;
  name: string;
};

export type VendorMatch =
  | { kind: "matched"; vendorId: string; name: string; score: number }
  | { kind: "suggest_create"; name: string; score: number }
  | { kind: "ambiguous"; name: string; candidates: VendorCandidate[] }
  | { kind: "none" };

const LEGAL_SUFFIX =
  /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|co|company|corp|corporation|the)\b/g;

export function normalizeVendorName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const count = grams.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      grams.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length - 2);
}

export function vendorNameSimilarity(left: string, right: string): number {
  const a = normalizeVendorName(left);
  const b = normalizeVendorName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4 && longer.includes(shorter)) {
    return Math.max(shorter.length / longer.length, 0.9);
  }
  return diceCoefficient(a, b);
}

export function vendorsAreSimilar(left: string, right: string): boolean {
  return vendorNameSimilarity(left, right) >= 0.72;
}

export function isPlaceholderVendor(value: string | null | undefined): boolean {
  const vendor = String(value ?? "").trim();
  return !vendor || /^(unknown|unknown vendor|needs review)$/i.test(vendor);
}

/**
 * Confident matches set vendor_id. A close but unmatched name is a create suggestion.
 * Two equally strong vendors stay ambiguous so the owner chooses.
 */
export function matchVendorName(
  extracted: string | null | undefined,
  vendors: readonly VendorCandidate[]
): VendorMatch {
  const name = String(extracted ?? "").trim();
  const normalized = normalizeVendorName(name);
  if (!name || !normalized || /^(unknown|unknown vendor|needs review)$/i.test(name)) {
    return { kind: "none" };
  }

  const ranked = vendors
    .map((vendor) => ({ vendor, score: vendorNameSimilarity(name, vendor.name) }))
    .filter((row) => row.score >= 0.72)
    .sort((a, b) => b.score - a.score || a.vendor.name.localeCompare(b.vendor.name));

  const best = ranked[0];
  if (!best) return { kind: "suggest_create", name: name.slice(0, 160), score: 0 };

  const second = ranked[1];
  const confident = best.score >= 0.86;
  const separated = !second || best.score - second.score >= 0.08;
  if (confident && separated) {
    return {
      kind: "matched",
      vendorId: best.vendor.id,
      name: best.vendor.name,
      score: best.score,
    };
  }
  if (ranked.length > 1 && !separated) {
    return {
      kind: "ambiguous",
      name: name.slice(0, 160),
      candidates: ranked.slice(0, 3).map((row) => row.vendor),
    };
  }
  return { kind: "suggest_create", name: name.slice(0, 160), score: best.score };
}

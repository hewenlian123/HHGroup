export const HH_ESTIMATE_TAX_PRESETS_STORAGE_KEY = "hh_estimate_tax_presets";

export type EstimateTaxPreset = {
  id: string;
  label: string;
  /** Percent rate applied to estimate subtotal (e.g. 4.712 = Hawaii GET). */
  ratePct: number;
};

/** Built-in Hawaii-area presets (rates are editable via Tax input after apply). */
export const BUILTIN_ESTIMATE_TAX_PRESETS: EstimateTaxPreset[] = [
  { id: "builtin-none", label: "No tax", ratePct: 0 },
  { id: "builtin-hawaii-get", label: "Hawaii GET", ratePct: 4.712 },
  { id: "builtin-oahu-honolulu", label: "Oahu / Honolulu", ratePct: 5.212 },
];

function safeRatePct(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function taxAmountFromSubtotalAndRate(subtotal: number, ratePct: number): number {
  const sub = Math.max(0, Number(subtotal) || 0);
  const rate = safeRatePct(ratePct);
  const amount = sub * (rate / 100);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function ratePctFromTaxAndSubtotal(subtotal: number, tax: number): number | null {
  const sub = Math.max(0, Number(subtotal) || 0);
  const taxAmt = Math.max(0, Number(tax) || 0);
  if (sub <= 0) return null;
  const pct = (taxAmt / sub) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round((pct + Number.EPSILON) * 100) / 100;
}

export function loadCustomEstimateTaxPresets(): EstimateTaxPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HH_ESTIMATE_TAX_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const label = typeof r.label === "string" ? r.label.trim() : "";
        const ratePct = Number(r.ratePct);
        if (!label || !Number.isFinite(ratePct) || ratePct < 0) return null;
        const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `custom-${label}`;
        return { id, label, ratePct: safeRatePct(ratePct) };
      })
      .filter((p): p is EstimateTaxPreset => p !== null);
  } catch {
    return [];
  }
}

export function saveCustomEstimateTaxPresets(presets: EstimateTaxPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HH_ESTIMATE_TAX_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore quota / private mode
  }
}

export function appendCustomEstimateTaxPreset(preset: EstimateTaxPreset): EstimateTaxPreset[] {
  const existing = loadCustomEstimateTaxPresets();
  const next = [...existing.filter((p) => p.id !== preset.id && p.label !== preset.label), preset];
  saveCustomEstimateTaxPresets(next);
  return next;
}

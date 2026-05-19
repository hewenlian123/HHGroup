/** Frontend-only line item presets — no schema change. */
export type EstimateLineItemPreset = {
  id: string;
  label: string;
  title: string;
  description?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  /** Decimal fraction, e.g. 0.1 = 10% */
  markupPct: number;
  /** Optional cost code hint when catalog has a match */
  costCodeHint?: string;
};

export const ESTIMATE_LINE_ITEM_PRESETS: EstimateLineItemPreset[] = [
  {
    id: "labor",
    label: "Labor",
    title: "Labor",
    qty: 1,
    unit: "HR",
    unitPrice: 0,
    markupPct: 0,
    costCodeHint: "LAB",
  },
  {
    id: "material",
    label: "Material",
    title: "Materials",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    markupPct: 0.1,
    costCodeHint: "MAT",
  },
  {
    id: "window",
    label: "Window Installation",
    title: "Window installation",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    markupPct: 0.1,
  },
  {
    id: "flooring",
    label: "Flooring Installation",
    title: "Flooring installation",
    qty: 1,
    unit: "SF",
    unitPrice: 0,
    markupPct: 0.1,
  },
  {
    id: "demo",
    label: "Demo",
    title: "Demolition",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    markupPct: 0,
  },
  {
    id: "concrete",
    label: "Concrete / CMU",
    title: "Concrete / CMU",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    markupPct: 0.1,
  },
  {
    id: "custom",
    label: "Custom Line",
    title: "",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    markupPct: 0,
  },
];

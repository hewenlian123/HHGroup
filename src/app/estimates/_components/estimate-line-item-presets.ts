import type { LineItemPresetInput } from "./estimate-builder-draft-storage";

/** Quick-add examples in Add line menu. */
export const LINE_ITEM_QUICK_PRESETS: readonly LineItemPresetInput[] = [
  { title: "Mobilization", description: "", qty: 1, unit: "LS", unitPrice: 0, markupPct: 0 },
  { title: "Site protection", description: "", qty: 1, unit: "LS", unitPrice: 0, markupPct: 0 },
  { title: "Dumpster", description: "", qty: 1, unit: "EA", unitPrice: 0, markupPct: 0 },
  {
    title: "Temporary protection",
    description: "",
    qty: 1,
    unit: "LS",
    unitPrice: 0,
    markupPct: 0,
  },
  { title: "Demolition labor", description: "", qty: 1, unit: "HR", unitPrice: 0, markupPct: 0 },
  { title: "Concrete slab", description: "", qty: 1, unit: "SF", unitPrice: 0, markupPct: 0 },
  { title: "Framing labor", description: "", qty: 1, unit: "HR", unitPrice: 0, markupPct: 0 },
  { title: "Drywall install", description: "", qty: 1, unit: "SF", unitPrice: 0, markupPct: 0 },
  { title: "Interior painting", description: "", qty: 1, unit: "SF", unitPrice: 0, markupPct: 0 },
  {
    title: "Flooring installation",
    description: "",
    qty: 1,
    unit: "SF",
    unitPrice: 0,
    markupPct: 0,
  },
  { title: "Tile installation", description: "", qty: 1, unit: "SF", unitPrice: 0, markupPct: 0 },
  { title: "Final cleanup", description: "", qty: 1, unit: "LS", unitPrice: 0, markupPct: 0 },
] as const;

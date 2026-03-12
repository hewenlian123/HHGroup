/**
 * Reference data: cost code master list only. No mock arrays.
 * All financial data is in Supabase; types are re-exported from *-db and data/index.
 */

export type CostCodeType = "material" | "labor" | "subcontractor";

export const costCodeMaster: Array<{ code: string; name: string; type: CostCodeType }> = [
  { code: "010000", name: "General Conditions", type: "labor" },
  { code: "020000", name: "Demolition", type: "labor" },
  { code: "030000", name: "Concrete", type: "material" },
  { code: "060000", name: "Framing", type: "labor" },
  { code: "070000", name: "Roofing", type: "subcontractor" },
  { code: "080000", name: "Doors & Windows", type: "subcontractor" },
  { code: "090000", name: "Finishes", type: "labor" },
  { code: "100000", name: "Cabinets / Millwork", type: "subcontractor" },
  { code: "120000", name: "Flooring", type: "subcontractor" },
  { code: "150000", name: "Plumbing", type: "subcontractor" },
  { code: "160000", name: "Electrical", type: "subcontractor" },
  { code: "170000", name: "HVAC / Mechanical", type: "subcontractor" },
  { code: "180000", name: "Site Work / Landscaping", type: "subcontractor" },
];

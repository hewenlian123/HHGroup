import type { CostCode } from "@/lib/data";

/** Built-in section names for Add Section template library. */
export const SECTION_TEMPLATE_NAMES: readonly string[] = [
  "General Conditions",
  "Demolition",
  "Site Work",
  "Concrete",
  "Masonry",
  "Framing",
  "Roofing",
  "Windows & Doors",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Insulation",
  "Drywall",
  "Painting",
  "Flooring",
  "Tile",
  "Cabinets",
  "Countertops",
  "Finish Carpentry",
  "Cleanup",
  "Punch List",
] as const;

const TEMPLATE_COST_CODE_ALIASES: Record<string, string> = {
  "Site Work": "Site Work / Landscaping",
  "Windows & Doors": "Doors & Windows",
  HVAC: "HVAC / Mechanical",
  Cabinets: "Cabinets / Millwork",
  Tile: "Finishes",
  Masonry: "Concrete",
  Insulation: "Finishes",
  Drywall: "Finishes",
  Painting: "Finishes",
  Countertops: "Cabinets / Millwork",
  "Finish Carpentry": "Framing",
  Cleanup: "General Conditions",
  "Punch List": "General Conditions",
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveSectionForTemplate(
  templateName: string,
  costCodes: CostCode[],
  usedCostCodes: ReadonlySet<string>
): { costCode: string; displayName: string } | null {
  const displayName = templateName.trim();
  const alias = TEMPLATE_COST_CODE_ALIASES[displayName];
  const targets = [displayName, alias].filter(Boolean) as string[];

  for (const target of targets) {
    const norm = normalizeName(target);
    const match = costCodes.find((c) => normalizeName(c.name) === norm);
    if (match && !usedCostCodes.has(match.code)) {
      return { costCode: match.code, displayName };
    }
  }

  for (const target of targets) {
    const norm = normalizeName(target);
    const partial = costCodes.find(
      (c) => normalizeName(c.name).includes(norm) || norm.includes(normalizeName(c.name))
    );
    if (partial && !usedCostCodes.has(partial.code)) {
      return { costCode: partial.code, displayName };
    }
  }

  const unused = costCodes.find((c) => !usedCostCodes.has(c.code));
  if (!unused) return null;
  return { costCode: unused.code, displayName };
}

export function resolveBlankSection(
  costCodes: CostCode[],
  usedCostCodes: ReadonlySet<string>
): { costCode: string; displayName: string } | null {
  const unused = costCodes.find((c) => !usedCostCodes.has(c.code));
  if (!unused) return null;
  return { costCode: unused.code, displayName: unused.name };
}

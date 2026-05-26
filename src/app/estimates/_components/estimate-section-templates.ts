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

const PROPOSAL_SECTION_ID_PREFIX = "proposal-section";

export function normalizeProposalSectionName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function createProposalSectionId(usedIds: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = `${PROPOSAL_SECTION_ID_PREFIX}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    if (!usedIds.has(id)) return id;
  }
  return `${PROPOSAL_SECTION_ID_PREFIX}-${crypto.randomUUID()}`;
}

export function resolveBlankSection(
  usedSectionIds: ReadonlySet<string>,
  displayName: string
): { costCode: string; displayName: string } | null {
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return { costCode: createProposalSectionId(usedSectionIds), displayName: trimmed };
}

export function resolveSectionForTemplate(
  templateName: string,
  usedSectionIds: ReadonlySet<string>
): { costCode: string; displayName: string } | null {
  const displayName = templateName.trim();
  if (!displayName) return null;
  return { costCode: createProposalSectionId(usedSectionIds), displayName };
}

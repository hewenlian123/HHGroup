type KeyboardShortcutLike = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
};

export type EstimateScopeSearchEntry = {
  id: string;
  sectionId: string;
  lineItemId?: string;
  label: string;
  detail: string;
  searchText: string;
};

export function isEstimateSaveShortcut(event: KeyboardShortcutLike): boolean {
  return (
    event.key.toLowerCase() === "s" &&
    Boolean(event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function shouldCommitEstimateLineFromPrice(event: KeyboardShortcutLike): boolean {
  return (
    event.key === "Enter" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.isComposing
  );
}

export function buildEstimateSectionCollapseState(
  sectionIds: readonly string[],
  collapsed: boolean
): Record<string, boolean> {
  return Object.fromEntries(sectionIds.map((sectionId) => [sectionId, collapsed]));
}

function uniqueEstimateSectionCodes(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of codes) {
    const code = value.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    ordered.push(code);
  }
  return ordered;
}

export function reconcileEstimateSectionOrder(
  sectionOrder: readonly string[],
  categoryNames: Readonly<Record<string, string>>,
  itemCostCodes: readonly string[]
): string[] {
  const availableCodes = uniqueEstimateSectionCodes([
    ...Object.keys(categoryNames),
    ...itemCostCodes,
  ]);
  const available = new Set(availableCodes);
  const ordered = uniqueEstimateSectionCodes(sectionOrder).filter((code) => available.has(code));
  return uniqueEstimateSectionCodes([...ordered, ...availableCodes]);
}

export function buildOrderedEstimateCategoryNames(
  sectionOrder: readonly string[],
  categoryNames: Readonly<Record<string, string>>,
  itemCostCodes: readonly string[],
  catalogNameByCode: Readonly<Record<string, string>> = {}
): Record<string, string> {
  const orderedCodes = reconcileEstimateSectionOrder(sectionOrder, categoryNames, itemCostCodes);
  return Object.fromEntries(
    orderedCodes.map((code) => [
      code,
      categoryNames[code]?.trim() || catalogNameByCode[code]?.trim() || code,
    ])
  );
}

export function filterEstimateScopeSearchResults<T extends EstimateScopeSearchEntry>(
  entries: readonly T[],
  query: string,
  limit = 8
): T[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  return entries
    .filter((entry) => {
      const haystack = `${entry.label} ${entry.detail} ${entry.searchText}`.toLocaleLowerCase();
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, Math.max(0, limit));
}

function estimateDescriptionPlainText(description: string): string {
  return description
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function isEstimateDescriptionLong(description: string): boolean {
  const text = estimateDescriptionPlainText(description);
  if (!text) return false;
  const nonEmptyLines = text.split(/\n+/).filter((line) => line.trim()).length;
  return nonEmptyLines > 2 || text.replace(/\s+/g, " ").length > 112;
}

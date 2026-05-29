export type EstimateDocumentStyle = "proposal" | "itemized";

export const DEFAULT_ESTIMATE_DOCUMENT_STYLE: EstimateDocumentStyle = "proposal";

/** Reserved namespace inside estimate_meta.cost_category_names (legacy jsonb column). */
export const ESTIMATE_META_JSON_NAMESPACE = "__hh";

export function normalizeEstimateDocumentStyle(value: unknown): EstimateDocumentStyle {
  return value === "itemized" ? "itemized" : DEFAULT_ESTIMATE_DOCUMENT_STYLE;
}

export function readEstimateDocumentStyleFromCostCategoryNames(
  costCategoryNames: unknown
): EstimateDocumentStyle {
  if (
    !costCategoryNames ||
    typeof costCategoryNames !== "object" ||
    Array.isArray(costCategoryNames)
  ) {
    return DEFAULT_ESTIMATE_DOCUMENT_STYLE;
  }
  const root = costCategoryNames as Record<string, unknown>;
  const namespace = root[ESTIMATE_META_JSON_NAMESPACE];
  if (!namespace || typeof namespace !== "object" || Array.isArray(namespace)) {
    return DEFAULT_ESTIMATE_DOCUMENT_STYLE;
  }
  return normalizeEstimateDocumentStyle((namespace as Record<string, unknown>).documentStyle);
}

export function mergeDocumentStyleIntoCostCategoryNames(
  existing: unknown,
  documentStyle: EstimateDocumentStyle
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const namespaceRaw = base[ESTIMATE_META_JSON_NAMESPACE];
  const namespace =
    namespaceRaw && typeof namespaceRaw === "object" && !Array.isArray(namespaceRaw)
      ? { ...(namespaceRaw as Record<string, unknown>) }
      : {};
  namespace.documentStyle = documentStyle;
  base[ESTIMATE_META_JSON_NAMESPACE] = namespace;
  return base;
}

/** Client-side bill category suggestions (localStorage only; no DB schema). */

export const BILLS_CATEGORIES_STORAGE_KEY = "hh_bills_categories";

export const MAX_CUSTOM_BILLS_CATEGORIES = 50;

export const DEFAULT_BILLS_CATEGORIES = [
  "Foundation",
  "Framing",
  "Concrete",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Roofing",
  "Drywall",
  "Painting",
  "Flooring",
  "Tile",
  "Cabinets",
  "Countertops",
  "Windows & Doors",
  "Permits",
  "Materials",
  "Labor",
  "Subcontractor",
  "Equipment Rental",
  "Dumpster",
  "Transportation",
  "Utilities",
  "Insurance",
  "Other",
] as const;

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase();
}

function isDefaultCategory(value: string): boolean {
  const key = normalizeCategoryKey(value);
  return DEFAULT_BILLS_CATEGORIES.some((d) => d.toLowerCase() === key);
}

function parseStoredCategories(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

/** Read user-saved custom categories from localStorage (browser only). */
export function readStoredBillCategories(): string[] {
  if (typeof window === "undefined") return [];
  return parseStoredCategories(window.localStorage.getItem(BILLS_CATEGORIES_STORAGE_KEY));
}

function writeStoredBillCategories(categories: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BILLS_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
}

/**
 * Merge defaults, stored customs, learned bill categories, and current value.
 * Case-insensitive dedupe; keeps first seen display casing.
 */
export function mergeBillCategoryOptions(
  learnedCategories: string[] = [],
  currentValue?: string | null
): string[] {
  const byKey = new Map<string, string>();

  const add = (name: string): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = normalizeCategoryKey(trimmed);
    if (!byKey.has(key)) byKey.set(key, trimmed);
  };

  for (const d of DEFAULT_BILLS_CATEGORIES) add(d);
  for (const s of readStoredBillCategories()) add(s);
  for (const l of learnedCategories) add(l);
  if (currentValue) add(currentValue);

  const defaultKeys = new Set(DEFAULT_BILLS_CATEGORIES.map((d) => d.toLowerCase()));
  const defaults = DEFAULT_BILLS_CATEGORIES.map((d) => byKey.get(d.toLowerCase()) ?? d).filter(
    Boolean
  );
  const rest = [...byKey.entries()]
    .filter(([key]) => !defaultKeys.has(key))
    .map(([, label]) => label)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return [...defaults, ...rest];
}

/** Persist a custom category (skipped if empty, duplicate, or default). */
export function persistBillCategory(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const key = normalizeCategoryKey(trimmed);
  if (isDefaultCategory(trimmed)) return trimmed;

  const stored = readStoredBillCategories();
  const withoutDup = stored.filter((s) => normalizeCategoryKey(s) !== key);
  const next = [trimmed, ...withoutDup].slice(0, MAX_CUSTOM_BILLS_CATEGORIES);
  writeStoredBillCategories(next);
  return trimmed;
}

import type { EstimateLineItemStatus } from "./estimate-line-item-status";

export const LS_RECENT_SECTIONS = "hh_estimate_recent_sections";
export const LS_RECENT_LINE_ITEMS = "hh_estimate_recent_line_items";
export const LS_SAVED_LINE_ITEMS = "hh_estimate_saved_line_items";

const RECENT_LINE_ITEMS_MAX = 30;

export type RecentSectionEntry = {
  displayName: string;
  costCode: string;
  usedAt: number;
};

export type StoredLineItemPreset = {
  id: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  status?: EstimateLineItemStatus;
  savedAt: number;
};

export type LineItemPresetInput = Omit<StoredLineItemPreset, "id" | "savedAt">;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function readRecentSections(): RecentSectionEntry[] {
  const list = readJson<RecentSectionEntry[]>(LS_RECENT_SECTIONS, []);
  return Array.isArray(list) ? list : [];
}

export function pushRecentSection(entry: Omit<RecentSectionEntry, "usedAt">): void {
  const usedAt = Date.now();
  const next: RecentSectionEntry = { ...entry, usedAt };
  const prev = readRecentSections().filter(
    (s) => !(s.costCode === next.costCode && s.displayName === next.displayName)
  );
  writeJson(LS_RECENT_SECTIONS, [next, ...prev].slice(0, 20));
}

export function readRecentLineItems(): StoredLineItemPreset[] {
  const list = readJson<StoredLineItemPreset[]>(LS_RECENT_LINE_ITEMS, []);
  return Array.isArray(list) ? list : [];
}

export function readSavedLineItems(): StoredLineItemPreset[] {
  const list = readJson<StoredLineItemPreset[]>(LS_SAVED_LINE_ITEMS, []);
  return Array.isArray(list) ? list : [];
}

function presetDedupeKey(p: Pick<StoredLineItemPreset, "title" | "description">): string {
  return `${p.title.trim().toLowerCase()}::${p.description.trim().toLowerCase()}`;
}

export function pushRecentLineItem(input: LineItemPresetInput): void {
  const preset: StoredLineItemPreset = {
    ...input,
    id: `recent-${Date.now()}`,
    savedAt: Date.now(),
  };
  const key = presetDedupeKey(preset);
  const prev = readRecentLineItems().filter((p) => presetDedupeKey(p) !== key);
  writeJson(LS_RECENT_LINE_ITEMS, [preset, ...prev].slice(0, RECENT_LINE_ITEMS_MAX));
}

export function saveLineItemPreset(input: LineItemPresetInput): void {
  const preset: StoredLineItemPreset = {
    ...input,
    id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: Date.now(),
  };
  const key = presetDedupeKey(preset);
  const prev = readSavedLineItems().filter((p) => presetDedupeKey(p) !== key);
  writeJson(LS_SAVED_LINE_ITEMS, [preset, ...prev]);
}

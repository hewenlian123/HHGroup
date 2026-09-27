export const ESTIMATE_NOTE_TYPES = [
  "exclusions",
  "assumptions",

  "warranty",
  "schedule_note",
  "custom",
] as const;

export type EstimateNoteType = (typeof ESTIMATE_NOTE_TYPES)[number];

export type EstimateNoteBlock = {
  id: string;
  type: EstimateNoteType;
  title: string;
  body: string;
};

export const NOTE_TYPE_LABELS: Record<EstimateNoteType, string> = {
  exclusions: "Exclusions",
  assumptions: "Assumptions",

  warranty: "Warranty",
  schedule_note: "Schedule Note",
  custom: "Custom Note",
};

export function defaultTitleForNoteType(type: EstimateNoteType): string {
  return NOTE_TYPE_LABELS[type];
}

export function normalizeEstimateNoteBlocks(input: unknown): EstimateNoteBlock[] {
  if (!Array.isArray(input)) return [];
  const out: EstimateNoteBlock[] = [];
  input.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    if (row.type === "payment_terms") return;
    const type = ESTIMATE_NOTE_TYPES.includes(row.type as EstimateNoteType)
      ? (row.type as EstimateNoteType)
      : "custom";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!title && !body) return;
    out.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `note-${index}-${type}`,
      type,
      title: title || defaultTitleForNoteType(type),
      body,
    });
  });
  return out;
}

/** Keep retired records in storage when editing customer notes; never expose them as cards. */
export function preserveRetiredEstimateNotes(
  existing: unknown,
  customerNotes: EstimateNoteBlock[]
): unknown[] {
  const retired = Array.isArray(existing)
    ? existing.filter((note) => note && typeof note === "object" && note.type === "payment_terms")
    : [];
  return [...customerNotes, ...retired];
}

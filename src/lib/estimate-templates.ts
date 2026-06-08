import {
  normalizeEstimateNoteBlocks,
  type EstimateNoteBlock,
  type EstimateNoteType,
} from "@/lib/estimate-notes";

export type EstimateTemplateLineItem = {
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  status?: string;
  hideAmountOnPdf?: boolean;
};

export type EstimateTemplateSection = {
  title: string;
  costCode?: string;
  items: EstimateTemplateLineItem[];
};

export type EstimateTemplateData = {
  version: 1;
  sections: EstimateTemplateSection[];
  notes?: EstimateNoteBlock[];
};

export type EstimateTemplateRecord = {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultTaxRate: number | null;
  defaultTerms: string | null;
  templateData: EstimateTemplateData;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const NOTE_TYPES = new Set<EstimateNoteType>([
  "exclusions",
  "assumptions",
  "payment_terms",
  "warranty",
  "schedule_note",
  "custom",
]);

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

export function normalizeEstimateTemplateData(input: unknown): EstimateTemplateData {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const sectionsInput = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: EstimateTemplateSection[] = [];

  for (const sectionRaw of sectionsInput) {
    if (!sectionRaw || typeof sectionRaw !== "object") continue;
    const section = sectionRaw as Record<string, unknown>;
    const title = cleanText(section.title);
    if (!title) continue;
    const itemInput = Array.isArray(section.items) ? section.items : [];
    const items: EstimateTemplateLineItem[] = [];
    for (const itemRaw of itemInput) {
      if (!itemRaw || typeof itemRaw !== "object") continue;
      const item = itemRaw as Record<string, unknown>;
      const lineTitle = cleanText(item.title);
      const description = cleanText(item.description);
      if (!lineTitle && !description) continue;
      items.push({
        title: lineTitle || "Line item",
        description,
        qty: cleanNumber(item.qty, 1),
        unit: cleanText(item.unit) || "EA",
        unitPrice: cleanNumber(item.unitPrice),
        status: cleanText(item.status) || "included",
        hideAmountOnPdf: Boolean(item.hideAmountOnPdf),
      });
    }

    sections.push({
      title,
      costCode: cleanText(section.costCode) || undefined,
      items,
    });
  }

  const notes = normalizeEstimateNoteBlocks(raw.notes).filter((note) => NOTE_TYPES.has(note.type));

  return {
    version: 1,
    sections,
    ...(notes.length ? { notes } : {}),
  };
}

export function splitEstimateTemplateItemDescription(desc: string): {
  title: string;
  description: string;
} {
  const i = desc.indexOf("\n");
  if (i < 0) return { title: desc.trim(), description: "" };
  return {
    title: desc.slice(0, i).trim(),
    description: desc.slice(i + 1).trim(),
  };
}

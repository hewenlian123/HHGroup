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

export type EstimateTemplateDraftItem = EstimateTemplateLineItem & { id: string };

export type EstimateTemplateDraftSection = Omit<EstimateTemplateSection, "items"> & {
  id: string;
  items: EstimateTemplateDraftItem[];
};

export type EstimateTemplateDraft = {
  id?: string;
  name: string;
  description: string;
  category: string;
  defaultTaxRate: string;
  defaultTerms: string;
  sections: EstimateTemplateDraftSection[];
  notes: EstimateNoteBlock[];
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

export function estimateTemplateDraftFromRecord(
  template: EstimateTemplateRecord,
  makeId: (prefix: string) => string
): EstimateTemplateDraft {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    defaultTaxRate: template.defaultTaxRate == null ? "" : String(template.defaultTaxRate),
    defaultTerms: template.defaultTerms ?? "",
    sections: template.templateData.sections.map((section) => ({
      id: makeId("template-section"),
      title: section.title,
      costCode: section.costCode,
      items: section.items.map((item) => ({
        id: makeId("template-item"),
        ...item,
      })),
    })),
    notes: template.templateData.notes?.map((note) => ({ ...note })) ?? [],
  };
}

export function estimateTemplateDataFromDraft(
  draft: Pick<EstimateTemplateDraft, "sections" | "notes">
): EstimateTemplateData {
  return normalizeEstimateTemplateData({
    version: 1,
    sections: draft.sections
      .map((section) => ({
        title: section.title.trim(),
        costCode: section.costCode,
        items: section.items
          .map((item) => ({
            title: item.title.trim() || "Line item",
            description: item.description.trim(),
            qty: Number.isFinite(item.qty) ? item.qty : 0,
            unit: item.unit.trim() || "EA",
            unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
            status: item.status,
            hideAmountOnPdf: Boolean(item.hideAmountOnPdf),
          }))
          .filter((item) => item.title || item.description),
      }))
      .filter((section) => section.title && section.items.length > 0),
    notes: draft.notes,
  });
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

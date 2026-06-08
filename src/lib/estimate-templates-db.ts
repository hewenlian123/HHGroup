import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupEstimateItemsByCategoryId,
  getEstimateCategories,
  getEstimateItems,
  getEstimateMeta,
  type EstimateItemRow,
} from "@/lib/estimates-db";
import {
  normalizeEstimateTemplateData,
  splitEstimateTemplateItemDescription,
  type EstimateTemplateData,
  type EstimateTemplateLineItem,
  type EstimateTemplateRecord,
} from "@/lib/estimate-templates";
import { normalizeEstimateNoteBlocks } from "@/lib/estimate-notes";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

type EstimateTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  default_tax_rate: number | string | null;
  default_terms: string | null;
  template_data: unknown;
  is_archived: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type EstimateTemplateWriteInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  defaultTaxRate?: number | null;
  defaultTerms?: string | null;
  templateData: EstimateTemplateData;
};

function client(explicitClient?: SupabaseClient | null): SupabaseClient {
  const c = explicitClient ?? getServerSupabaseAdmin();
  if (!c) throw new Error("Server Supabase admin client is not configured.");
  return c;
}

function isMissingTable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? "";
  return /estimate_templates|schema cache|relation.*does not exist|could not find the table/i.test(
    message
  );
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function cleanTaxRate(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10000) / 10000;
}

function rowToTemplate(row: EstimateTemplateRow): EstimateTemplateRecord {
  return {
    id: String(row.id),
    name: cleanText(row.name) || "Untitled template",
    description: cleanText(row.description),
    category: cleanText(row.category) || "General",
    defaultTaxRate: cleanTaxRate(row.default_tax_rate),
    defaultTerms: cleanNullableText(row.default_terms),
    templateData: normalizeEstimateTemplateData(row.template_data),
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function writePayload(input: EstimateTemplateWriteInput): Record<string, unknown> {
  const name = cleanText(input.name);
  if (!name) throw new Error("Template name is required.");
  return {
    name,
    description: cleanText(input.description),
    category: cleanText(input.category) || "General",
    default_tax_rate: cleanTaxRate(input.defaultTaxRate),
    default_terms: cleanNullableText(input.defaultTerms),
    template_data: normalizeEstimateTemplateData(input.templateData),
    updated_at: new Date().toISOString(),
  };
}

export async function listEstimateTemplates(
  options: { includeArchived?: boolean } = {},
  explicitClient?: SupabaseClient | null
): Promise<EstimateTemplateRecord[]> {
  const c = client(explicitClient);
  let query = c
    .from("estimate_templates")
    .select(
      "id, name, description, category, default_tax_rate, default_terms, template_data, is_archived, created_at, updated_at"
    )
    .order("is_archived", { ascending: true })
    .order("updated_at", { ascending: false });

  if (!options.includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as EstimateTemplateRow[]).map(rowToTemplate);
}

export async function getEstimateTemplateById(
  templateId: string,
  explicitClient?: SupabaseClient | null
): Promise<EstimateTemplateRecord | null> {
  const id = cleanText(templateId);
  if (!id) return null;
  const c = client(explicitClient);
  const { data, error } = await c
    .from("estimate_templates")
    .select(
      "id, name, description, category, default_tax_rate, default_terms, template_data, is_archived, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (isMissingTable(error)) return null;
    if (error) throw new Error(error.message);
    return null;
  }
  return rowToTemplate(data as EstimateTemplateRow);
}

export async function createEstimateTemplate(
  input: EstimateTemplateWriteInput,
  explicitClient?: SupabaseClient | null
): Promise<EstimateTemplateRecord> {
  const c = client(explicitClient);
  const { data, error } = await c
    .from("estimate_templates")
    .insert({
      ...writePayload(input),
      is_archived: false,
    })
    .select(
      "id, name, description, category, default_tax_rate, default_terms, template_data, is_archived, created_at, updated_at"
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create template.");
  return rowToTemplate(data as EstimateTemplateRow);
}

export async function updateEstimateTemplate(
  templateId: string,
  input: EstimateTemplateWriteInput,
  explicitClient?: SupabaseClient | null
): Promise<EstimateTemplateRecord> {
  const id = cleanText(templateId);
  if (!id) throw new Error("Template id is required.");
  const c = client(explicitClient);
  const { data, error } = await c
    .from("estimate_templates")
    .update(writePayload(input))
    .eq("id", id)
    .select(
      "id, name, description, category, default_tax_rate, default_terms, template_data, is_archived, created_at, updated_at"
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update template.");
  return rowToTemplate(data as EstimateTemplateRow);
}

export async function archiveEstimateTemplate(
  templateId: string,
  archived: boolean,
  explicitClient?: SupabaseClient | null
): Promise<void> {
  const id = cleanText(templateId);
  if (!id) throw new Error("Template id is required.");
  const c = client(explicitClient);
  const { error } = await c
    .from("estimate_templates")
    .update({ is_archived: archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEstimateTemplate(
  templateId: string,
  explicitClient?: SupabaseClient | null
): Promise<void> {
  const id = cleanText(templateId);
  if (!id) throw new Error("Template id is required.");
  const c = client(explicitClient);
  const { error } = await c.from("estimate_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicateEstimateTemplate(
  templateId: string,
  explicitClient?: SupabaseClient | null
): Promise<EstimateTemplateRecord> {
  const c = client(explicitClient);
  const source = await getEstimateTemplateById(templateId, c);
  if (!source) throw new Error("Template not found.");
  return createEstimateTemplate(
    {
      name: `${source.name} copy`,
      description: source.description,
      category: source.category,
      defaultTaxRate: source.defaultTaxRate,
      defaultTerms: source.defaultTerms,
      templateData: source.templateData,
    },
    c
  );
}

function rowToTemplateLineItem(row: EstimateItemRow): EstimateTemplateLineItem {
  const { title, description } = splitEstimateTemplateItemDescription(row.desc ?? "");
  return {
    title: title || "Line item",
    description,
    qty: row.qty,
    unit: row.unit || "EA",
    unitPrice: row.unitCost,
    status: "included",
    hideAmountOnPdf: Boolean(row.hideAmountOnPdf),
  };
}

export async function createEstimateTemplateFromEstimate(
  estimateId: string,
  input: Omit<EstimateTemplateWriteInput, "templateData">,
  explicitClient?: SupabaseClient | null
): Promise<EstimateTemplateRecord> {
  const id = cleanText(estimateId);
  if (!id) throw new Error("Estimate id is required.");
  const c = client(explicitClient);
  const [meta, items, categories] = await Promise.all([
    getEstimateMeta(id, c),
    getEstimateItems(id, c),
    getEstimateCategories(id, c),
  ]);
  if (!meta) throw new Error("Estimate not found.");

  const grouped = groupEstimateItemsByCategoryId(items, categories);
  const templateData: EstimateTemplateData = {
    version: 1,
    sections: grouped.map((section) => ({
      title: section.title,
      costCode: section.categoryId,
      items: section.rows
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(rowToTemplateLineItem),
    })),
    notes: normalizeEstimateNoteBlocks(meta.documentNotes),
  };

  return createEstimateTemplate(
    {
      ...input,
      templateData,
    },
    c
  );
}

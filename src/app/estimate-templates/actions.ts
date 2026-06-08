"use server";

import { revalidatePath } from "next/cache";
import {
  archiveEstimateTemplate,
  createEstimateTemplate,
  createEstimateTemplateFromEstimate,
  deleteEstimateTemplate,
  duplicateEstimateTemplate,
  updateEstimateTemplate,
} from "@/lib/estimate-templates-db";
import { normalizeEstimateTemplateData } from "@/lib/estimate-templates";

export type EstimateTemplateActionResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

function safeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (
    /schema cache|relation|column|permission denied|row-level security|\brls\b|duplicate key|violates|PGRST|Supabase|database/i.test(
      message
    )
  ) {
    return fallback;
  }
  return message;
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function templateInputFromForm(formData: FormData) {
  const rawTemplateData = formData.get("templateData");
  let parsedTemplateData: unknown = {};
  if (typeof rawTemplateData === "string" && rawTemplateData.trim()) {
    parsedTemplateData = JSON.parse(rawTemplateData);
  }
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    defaultTaxRate: optionalNumber(formData.get("defaultTaxRate")),
    defaultTerms: String(formData.get("defaultTerms") ?? ""),
    templateData: normalizeEstimateTemplateData(parsedTemplateData),
  };
}

function revalidateTemplates(): void {
  revalidatePath("/estimate-templates");
  revalidatePath("/estimates/new");
}

export async function createEstimateTemplateAction(
  formData: FormData
): Promise<EstimateTemplateActionResult> {
  try {
    const created = await createEstimateTemplate(templateInputFromForm(formData));
    revalidateTemplates();
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, error: safeError(error, "Could not create template.") };
  }
}

export async function updateEstimateTemplateAction(
  formData: FormData
): Promise<EstimateTemplateActionResult> {
  try {
    const id = String(formData.get("templateId") ?? "");
    const updated = await updateEstimateTemplate(id, templateInputFromForm(formData));
    revalidateTemplates();
    return { ok: true, id: updated.id };
  } catch (error) {
    return { ok: false, error: safeError(error, "Could not update template.") };
  }
}

export async function duplicateEstimateTemplateAction(
  templateId: string
): Promise<EstimateTemplateActionResult> {
  try {
    const duplicated = await duplicateEstimateTemplate(templateId);
    revalidateTemplates();
    return { ok: true, id: duplicated.id };
  } catch (error) {
    return { ok: false, error: safeError(error, "Could not duplicate template.") };
  }
}

export async function archiveEstimateTemplateAction(
  templateId: string,
  archived: boolean
): Promise<EstimateTemplateActionResult> {
  try {
    await archiveEstimateTemplate(templateId, archived);
    revalidateTemplates();
    return { ok: true, id: templateId };
  } catch (error) {
    return { ok: false, error: safeError(error, "Could not archive template.") };
  }
}

export async function deleteEstimateTemplateAction(
  templateId: string
): Promise<EstimateTemplateActionResult> {
  try {
    await deleteEstimateTemplate(templateId);
    revalidateTemplates();
    return { ok: true, id: templateId };
  } catch (error) {
    return { ok: false, error: safeError(error, "Could not delete template.") };
  }
}

export async function saveEstimateAsTemplateAction(
  formData: FormData
): Promise<EstimateTemplateActionResult> {
  try {
    const estimateId = String(formData.get("estimateId") ?? "");
    const created = await createEstimateTemplateFromEstimate(estimateId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      category: String(formData.get("category") ?? ""),
      defaultTaxRate: optionalNumber(formData.get("defaultTaxRate")),
      defaultTerms: String(formData.get("defaultTerms") ?? ""),
    });
    revalidateTemplates();
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, error: safeError(error, "Could not save estimate as template.") };
  }
}

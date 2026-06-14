"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MaterialSelectionSheetStatus } from "@/lib/material-selection-sheets";
import {
  createMaterialSelectionSheet,
  deleteMaterialSelectionSheet,
} from "@/lib/material-selection-sheets-db";

function nullableFormValue(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function selectionStatus(value: FormDataEntryValue | null): MaterialSelectionSheetStatus {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "shared" || raw === "approved") return raw;
  return "draft";
}

export async function createMaterialSelectionAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const selection = await createMaterialSelectionSheet({
    title,
    customerId: nullableFormValue(formData, "customerId"),
    projectId: nullableFormValue(formData, "projectId"),
    status: selectionStatus(formData.get("status")),
    notes: nullableFormValue(formData, "notes"),
  });
  redirect(`/materials/${selection.id}`);
}

export async function deleteMaterialSelectionAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteMaterialSelectionSheet(id);
    revalidatePath("/materials");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete material selection.",
    };
  }
}

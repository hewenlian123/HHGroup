"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
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
  const projectId = nullableFormValue(formData, "projectId");
  const guard = await requireOrganizationServerActionClient({
    noStore: true,
    write: true,
    ...(projectId ? { projectId } : {}),
  });
  if (!guard.ok) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const selection = await createMaterialSelectionSheet(
    {
      title,
      organizationId: guard.context.organizationId ?? undefined,
      customerId: nullableFormValue(formData, "customerId"),
      projectId,
      status: selectionStatus(formData.get("status")),
      notes: nullableFormValue(formData, "notes"),
    },
    guard.client
  );
  redirect(`/materials/${selection.id}`);
}

export async function deleteMaterialSelectionAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireOrganizationServerActionClient({ noStore: true });
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    const record = await guard.client
      .from("material_selections")
      .select("organization_id")
      .eq("id", id)
      .maybeSingle();
    if (record.error || !record.data)
      return { ok: false, error: "Material selection is unavailable." };
    const organizationId = record.data.organization_id;
    if (
      !guard.context.memberships.some(
        (member) => member.organization_id === organizationId && member.role !== "assistant"
      )
    )
      return { ok: false, error: "Organization administrator access required." };
    await deleteMaterialSelectionSheet(id, guard.client);
    revalidatePath("/materials");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete material selection.",
    };
  }
}

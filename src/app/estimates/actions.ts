"use server";

import { revalidatePath } from "next/cache";
import { deleteEstimate } from "@/lib/data";

export async function deleteEstimateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string" || !estimateId) {
    return { ok: false, error: "Missing estimate." };
  }
  const deleted = await deleteEstimate(estimateId);
  if (!deleted) return { ok: false, error: "Could not delete estimate." };
  revalidatePath("/estimates");
  return { ok: true };
}

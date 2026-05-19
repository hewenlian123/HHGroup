"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export async function deleteEstimateAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string" || !estimateId) {
    return { ok: false, error: "Missing estimate." };
  }
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "Database is not configured." };
  }
  const { error } = await admin.from("estimates").delete().eq("id", estimateId);
  if (error) return { ok: false, error: error.message || "Could not delete estimate." };
  revalidatePath("/estimates");
  return { ok: true };
}

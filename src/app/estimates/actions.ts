"use server";

import { revalidatePath } from "next/cache";
import { revalidateEstimatePaths } from "./revalidate-estimate-paths";
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
  const { data, error } = await admin
    .from("estimates")
    .delete()
    .eq("id", estimateId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message || "Could not delete estimate." };
  if (!data?.id) {
    return {
      ok: false,
      error:
        "Estimate was not deleted. Please refresh and try again, or check server delete permissions.",
    };
  }
  revalidatePath("/estimates");
  revalidateEstimatePaths(estimateId);
  return { ok: true };
}

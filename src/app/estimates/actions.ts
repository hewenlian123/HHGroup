"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createEstimateWithItems, updateEstimateStatus } from "@/lib/data";
import { deleteEstimate } from "@/lib/data";

/** Creates a test estimate with line items and sets status to Approved so you can try "Convert to Project". */
export async function createTestEstimateAction() {
  try {
    const id = await createEstimateWithItems({
      clientName: "Test Client",
      projectName: "Test Estimate for Convert",
      address: "123 Test St",
      estimateDate: new Date().toISOString().slice(0, 10),
      notes: "Test estimate — use Convert to Project to create a project.",
      overheadPct: 0.05,
      profitPct: 0.1,
      items: [
        { costCode: "010000", desc: "General Conditions", qty: 10, unit: "EA", unitCost: 500, markupPct: 0.15 },
        { costCode: "030000", desc: "Concrete", qty: 20, unit: "CY", unitCost: 120, markupPct: 0.1 },
        { costCode: "070000", desc: "Roofing", qty: 1, unit: "LS", unitCost: 15000, markupPct: 0.12 },
      ],
    });
    const ok = await updateEstimateStatus(id, "Approved");
    if (!ok) {
      redirect("/estimates?error=approve");
    }
    revalidatePath("/estimates");
    revalidatePath(`/estimates/${id}`);
    redirect(`/estimates/${id}`);
  } catch {
    revalidatePath("/estimates");
    redirect("/estimates?error=create");
  }
}

export async function deleteEstimateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string" || !estimateId) return;
  const deleted = await deleteEstimate(estimateId);
  if (!deleted) return;
  revalidatePath("/estimates");
  redirect("/estimates");
}

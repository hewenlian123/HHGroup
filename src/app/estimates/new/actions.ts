"use server";

import { redirect } from "next/navigation";
import { createEstimate } from "@/lib/data";

export async function createEstimateAction(formData: FormData) {
  const clientName = (formData.get("clientName") as string)?.trim() ?? "";
  const projectName = (formData.get("projectName") as string)?.trim() ?? "";
  const address = (formData.get("address") as string)?.trim() ?? "";
  const id = createEstimate({ clientName, projectName, address });
  redirect(`/estimates/${id}`);
}

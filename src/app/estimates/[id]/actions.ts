"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createEstimateSnapshot, createNewVersionFromSnapshot, convertEstimateSnapshotToProject, addLineItem } from "@/lib/data";

export async function approveEstimateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const snapshot = createEstimateSnapshot(estimateId);
    if (!snapshot) return;
    revalidatePath(`/estimates/${estimateId}`);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function createNewVersionAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const ok = createNewVersionFromSnapshot(estimateId);
    if (!ok) return;
    revalidatePath(`/estimates/${estimateId}`);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function convertToProjectAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const record = convertEstimateSnapshotToProject(estimateId);
    if (!record) return;
    revalidatePath(`/estimates/${estimateId}`);
    revalidatePath("/estimates");
    revalidatePath("/projects");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function addLineItemAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const costCode = formData.get("costCode");
  if (typeof estimateId !== "string" || typeof costCode !== "string") return;
  try {
    const item = addLineItem(estimateId, {
      costCode,
      desc: "New item",
      qty: 1,
      unit: "EA",
      unitCost: 0,
      markupPct: 0.1,
    });
    if (!item) return;
    revalidatePath(`/estimates/${estimateId}`);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

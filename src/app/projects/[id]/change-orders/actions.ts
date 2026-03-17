"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  updateChangeOrderStatus as updateStatus,
  updateChangeOrder as updateCO,
  addChangeOrderItem as addItem,
  deleteChangeOrderItem as deleteItem,
  createChangeOrder,
} from "@/lib/data";
import type { ChangeOrderStatus } from "@/lib/data";

export async function createChangeOrderAction(projectId: string, formData: FormData): Promise<void> {
  try {
    const title = (formData.get("title") as string)?.trim() || "";
    const description = (formData.get("description") as string)?.trim() || null;
    const amountRaw = formData.get("amount");
    const amount = amountRaw != null && amountRaw !== "" ? Number(amountRaw) : null;
    const costImpactRaw = formData.get("costImpact");
    const costImpact = costImpactRaw != null && costImpactRaw !== "" ? Number(costImpactRaw) : null;
    const scheduleImpactDaysRaw = formData.get("scheduleImpactDays");
    const scheduleImpactDays =
      scheduleImpactDaysRaw != null && scheduleImpactDaysRaw !== "" ? Number(scheduleImpactDaysRaw) : null;
    const co = await createChangeOrder(projectId, {
      title: title || null,
      description,
      amount: amount != null && Number.isFinite(amount) ? amount : null,
      costImpact: costImpact != null && Number.isFinite(costImpact) ? costImpact : null,
      scheduleImpactDays: scheduleImpactDays != null && Number.isFinite(scheduleImpactDays) ? scheduleImpactDays : null,
    });
    revalidatePath(`/projects/${projectId}`);
    redirect(`/projects/${projectId}/change-orders/${co.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (typeof (e as { digest?: string })?.digest === "string") throw e;
    throw new Error(`Change order could not be created: ${msg}`);
  }
}

export async function updateChangeOrderStatus(
  changeOrderId: string,
  projectId: string,
  status: ChangeOrderStatus,
  options?: { approvedBy?: string | null }
): Promise<{ ok: boolean }> {
  const ok = await updateStatus(changeOrderId, status, options);
  if (ok) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
  }
  return { ok };
}

export async function updateChangeOrderAction(
  changeOrderId: string,
  projectId: string,
  formData: FormData
): Promise<{ ok: boolean }> {
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const amountRaw = formData.get("amount");
  const amount = amountRaw != null && amountRaw !== "" && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : undefined;
  const costImpactRaw = formData.get("costImpact");
  const costImpact = costImpactRaw != null && costImpactRaw !== "" && Number.isFinite(Number(costImpactRaw)) ? Number(costImpactRaw) : undefined;
  const scheduleImpactDaysRaw = formData.get("scheduleImpactDays");
  const scheduleImpactDays =
    scheduleImpactDaysRaw != null && scheduleImpactDaysRaw !== "" && Number.isFinite(Number(scheduleImpactDaysRaw))
      ? Number(scheduleImpactDaysRaw)
      : undefined;
  const patch: import("@/lib/data").UpdateChangeOrderPatch = {};
  if (title !== undefined) patch.title = title || null;
  if (description !== undefined) patch.description = description || null;
  if (amount !== undefined) patch.amount = amount;
  if (costImpact !== undefined) patch.costImpact = costImpact;
  if (scheduleImpactDays !== undefined) patch.scheduleImpactDays = scheduleImpactDays;
  const ok = Object.keys(patch).length > 0 ? await updateCO(changeOrderId, patch) : true;
  if (ok) {
    revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
    revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}/edit`);
  }
  return { ok };
}

export async function addChangeOrderItemAction(
  changeOrderId: string,
  projectId: string,
  item: { costCode: string; description: string; qty: number; unit: string; unitPrice: number }
): Promise<{ ok: boolean }> {
  const added = await addItem(changeOrderId, item);
  if (added) {
    revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
    revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}/edit`);
  }
  return { ok: !!added };
}

export async function deleteChangeOrderItemAction(
  changeOrderId: string,
  projectId: string,
  itemId: string
): Promise<{ ok: boolean }> {
  const ok = await deleteItem(changeOrderId, itemId);
  if (ok) {
    revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
    revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}/edit`);
  }
  return { ok };
}

export async function addChangeOrderAttachmentAction(
  changeOrderId: string,
  projectId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file || !file.size) return { ok: false, error: "No file selected." };
  const { getSupabaseClient } = await import("@/lib/supabase");
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const bucket = "attachments";
  const ext = file.name.replace(/^.+\./, "") || "";
  const path = `change-orders/${changeOrderId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) return { ok: false, error: uploadError.message };
  const { addChangeOrderAttachment } = await import("@/lib/data");
  const att = await addChangeOrderAttachment(changeOrderId, {
    fileName: file.name,
    storagePath: path,
    mimeType: file.type || null,
    sizeBytes: file.size,
  });
  if (!att) return { ok: false, error: "Failed to save attachment record." };
  revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
  return { ok: true };
}

export async function deleteChangeOrderAttachmentAction(
  attachmentId: string,
  projectId: string,
  changeOrderId: string
): Promise<{ ok: boolean }> {
  const { deleteChangeOrderAttachment, getChangeOrderAttachments } = await import("@/lib/data");
  const list = await getChangeOrderAttachments(changeOrderId);
  const att = list.find((a) => a.id === attachmentId);
  if (att) {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const supabase = getSupabaseClient();
    if (supabase) await supabase.storage.from("attachments").remove([att.storagePath]);
  }
  const ok = await deleteChangeOrderAttachment(attachmentId);
  if (ok) revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
  return { ok };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  updateChangeOrderStatus as updateStatus,
  updateChangeOrder as updateCO,
  addChangeOrderItem as addItem,
  deleteChangeOrderItem as deleteItem,
} from "@/lib/data";
import { createChangeOrderWithClient } from "@/lib/change-orders-db";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
import { uploadDocumentFile } from "@/lib/document-storage";
import { deleteDocument } from "@/lib/documents-db";
import type { ChangeOrderStatus } from "@/lib/data";

async function requireChangeOrderOwnerAction(projectId: string, changeOrderId?: string) {
  const guard = await requireOrganizationServerActionClient({
    projectId,
    write: true,
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) return guard;
  if (changeOrderId) {
    const result = await guard.client
      .from("project_change_orders")
      .select("id")
      .eq("id", changeOrderId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (result.error || !result.data)
      return { ok: false as const, error: "Change order not found." };
  }
  return guard;
}

export async function createChangeOrderAction(
  projectId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  try {
    const clientGuard = await requireChangeOrderOwnerAction(projectId);
    if (!clientGuard.ok) return { ok: false, error: clientGuard.error };
    const title = (formData.get("title") as string)?.trim() || "";
    const description = (formData.get("description") as string)?.trim() || null;
    const amountRaw = formData.get("amount");
    const amount = amountRaw != null && amountRaw !== "" ? Number(amountRaw) : null;
    const costImpactRaw = formData.get("costImpact");
    const costImpact = costImpactRaw != null && costImpactRaw !== "" ? Number(costImpactRaw) : null;
    const scheduleImpactDaysRaw = formData.get("scheduleImpactDays");
    const scheduleImpactDays =
      scheduleImpactDaysRaw != null && scheduleImpactDaysRaw !== ""
        ? Number(scheduleImpactDaysRaw)
        : null;
    const server = clientGuard.client;
    if (!server) return { ok: false, error: "Server Supabase is not configured." };
    const co = await createChangeOrderWithClient(server, projectId, {
      title: title || null,
      description,
      amount: amount != null && Number.isFinite(amount) ? amount : null,
      costImpact: costImpact != null && Number.isFinite(costImpact) ? costImpact : null,
      scheduleImpactDays:
        scheduleImpactDays != null && Number.isFinite(scheduleImpactDays)
          ? scheduleImpactDays
          : null,
    });
    revalidatePath(`/projects/${projectId}`);
    redirect(`/projects/${projectId}/change-orders/${co.id}`);
  } catch (e) {
    // Let Next handle redirects/notFound; those are implemented as exceptions.
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (
      typeof digest === "string" &&
      (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"))
    ) {
      throw e;
    }

    // Never throw here — throwing would render the error boundary with a Digest.
    // Log for server-side debugging.
    // eslint-disable-next-line no-console
    console.error("[createChangeOrderAction] failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Failed to create change order." };
  }
  // Unreachable after redirect(), but keep TS happy.
  return { ok: true };
}

export async function updateChangeOrderStatus(
  changeOrderId: string,
  projectId: string,
  status: ChangeOrderStatus,
  options?: { approvedBy?: string | null }
): Promise<{ ok: boolean }> {
  const authorization = await requireChangeOrderOwnerAction(projectId, changeOrderId);
  if (!authorization.ok) return { ok: false };
  const ok = await updateStatus(changeOrderId, status, options, authorization.client);
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
  const authorization = await requireChangeOrderOwnerAction(projectId, changeOrderId);
  if (!authorization.ok) return { ok: false };
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const amountRaw = formData.get("amount");
  const amount =
    amountRaw != null && amountRaw !== "" && Number.isFinite(Number(amountRaw))
      ? Number(amountRaw)
      : undefined;
  const costImpactRaw = formData.get("costImpact");
  const costImpact =
    costImpactRaw != null && costImpactRaw !== "" && Number.isFinite(Number(costImpactRaw))
      ? Number(costImpactRaw)
      : undefined;
  const scheduleImpactDaysRaw = formData.get("scheduleImpactDays");
  const scheduleImpactDays =
    scheduleImpactDaysRaw != null &&
    scheduleImpactDaysRaw !== "" &&
    Number.isFinite(Number(scheduleImpactDaysRaw))
      ? Number(scheduleImpactDaysRaw)
      : undefined;
  const patch: import("@/lib/data").UpdateChangeOrderPatch = {};
  if (title !== undefined) patch.title = title || null;
  if (description !== undefined) patch.description = description || null;
  if (amount !== undefined) patch.amount = amount;
  if (costImpact !== undefined) patch.costImpact = costImpact;
  if (scheduleImpactDays !== undefined) patch.scheduleImpactDays = scheduleImpactDays;
  const ok =
    Object.keys(patch).length > 0
      ? await updateCO(changeOrderId, patch, authorization.client)
      : true;
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
  const authorization = await requireChangeOrderOwnerAction(projectId, changeOrderId);
  if (!authorization.ok) return { ok: false };
  const added = await addItem(changeOrderId, item, authorization.client);
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
  const authorization = await requireChangeOrderOwnerAction(projectId, changeOrderId);
  if (!authorization.ok) return { ok: false };
  const ok = await deleteItem(changeOrderId, itemId, authorization.client);
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
  const authorization = await requireChangeOrderOwnerAction(projectId, changeOrderId);
  if (!authorization.ok) return authorization;
  const file = formData.get("file") as File | null;
  if (!file || !file.size) return { ok: false, error: "No file selected." };
  const document = await uploadDocumentFile(
    authorization.client,
    {
      file_name: file.name,
      file_type: "Other",
      mime_type: file.type || null,
      size_bytes: file.size,
      project_id: projectId,
      related_module: "change_orders",
      related_id: changeOrderId,
    },
    file
  );
  const { addChangeOrderAttachment } = await import("@/lib/data");
  const att = await addChangeOrderAttachment(
    changeOrderId,
    {
      fileName: file.name,
      storagePath: document.file_path,
      mimeType: file.type || null,
      sizeBytes: file.size,
    },
    authorization.client
  );
  if (!att) {
    await deleteDocument(document.id, true, authorization.client);
    return { ok: false, error: "Failed to save attachment record." };
  }
  revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
  return { ok: true };
}

export async function deleteChangeOrderAttachmentAction(
  attachmentId: string,
  projectId: string,
  changeOrderId: string
): Promise<{ ok: boolean }> {
  const authorization = await requireChangeOrderOwnerAction(projectId, changeOrderId);
  if (!authorization.ok) return { ok: false };
  const { deleteChangeOrderAttachment, getChangeOrderAttachments } = await import("@/lib/data");
  const list = await getChangeOrderAttachments(changeOrderId, authorization.client);
  const att = list.find((a) => a.id === attachmentId);
  if (!att) return { ok: false };
  const document = await authorization.client
    .from("documents")
    .select("id")
    .eq("file_path", att.storagePath)
    .eq("project_id", projectId)
    .maybeSingle();
  if (document.error || !document.data) return { ok: false };
  await deleteDocument(document.data.id, true, authorization.client);
  const ok = await deleteChangeOrderAttachment(attachmentId, authorization.client);
  if (ok) revalidatePath(`/projects/${projectId}/change-orders/${changeOrderId}`);
  return { ok };
}

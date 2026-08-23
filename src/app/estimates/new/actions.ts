"use server";

import { revalidatePath } from "next/cache";
import { revalidateEstimatePaths } from "@/app/estimates/revalidate-estimate-paths";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { createEstimateWithItemsWithClient, type EstimateLineItemStatus } from "@/lib/estimates-db";
import { estimateActivityActorFromAuth } from "@/lib/estimate-activity";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import type { EstimateNoteBlock } from "@/lib/estimate-notes";

export type CreateEstimatePayload = {
  customerId?: string;
  clientName: string;
  projectName: string;
  address: string;
  clientPhone?: string;
  clientEmail?: string;
  estimateDate?: string;
  validUntil?: string;
  notes?: string;
  documentNotes?: EstimateNoteBlock[];
  salesPerson?: string;
  tax?: number;
  discount?: number;
  overheadPct?: number;
  profitPct?: number;
  documentStyle?: import("@/lib/estimate-document-style").EstimateDocumentStyle;
  costCategoryNames?: Record<string, string>;
  items: Array<{
    costCode: string;
    desc: string;
    qty: number;
    unit: string;
    unitCost: number;
    hideAmountOnPdf?: boolean;
    status?: EstimateLineItemStatus;
    sortOrder?: number;
  }>;
  paymentSchedule?: Array<{
    title: string;
    description?: string | null;
    amount: number;
    dueDate?: string | null;
  }>;
};

function safeCreateEstimateError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (!message) return "Could not create estimate. Please try again.";
  if (
    /schema cache|relation|column|permission denied|row-level security|\brls\b|duplicate key|violates|PGRST|Supabase|database/i.test(
      message
    )
  ) {
    return "Could not create estimate. Please refresh and try again.";
  }
  return message;
}

export async function createEstimateWithItemsAction(
  payload: CreateEstimatePayload
): Promise<{ ok: boolean; estimateId?: string; error?: string }> {
  const auth = await requireSupabaseOwnerOrAdminServerAction();
  if (!auth.ok) return { ok: false, error: "Authentication required." };

  const clientName = payload.clientName.trim();
  if (!clientName) return { ok: false, error: "Client name is required." };
  const projectName = payload.projectName.trim();
  if (!projectName) return { ok: false, error: "Project name is required." };
  if (
    (payload.items ?? []).some(
      (item) =>
        !Number.isFinite(Number(item.qty)) ||
        Number(item.qty) < 0 ||
        !Number.isFinite(Number(item.unitCost)) ||
        Number(item.unitCost) < 0
    )
  ) {
    return { ok: false, error: "Line item quantity and unit price must be non-negative numbers." };
  }
  const items = (payload.items ?? [])
    .map((i) => ({
      ...i,
      costCode: i.costCode.trim(),
      desc: i.desc.trim(),
      unit: i.unit?.trim() || "EA",
      qty: Number(i.qty) || 0,
      unitCost: Number(i.unitCost) || 0,
      hideAmountOnPdf: Boolean(i.hideAmountOnPdf),
      status: i.status,
      sortOrder: Number.isFinite(i.sortOrder) ? Number(i.sortOrder) : undefined,
    }))
    .filter((i) => i.costCode && i.desc.length > 0);

  if (items.length === 0) {
    return { ok: false, error: "At least one line item is required." };
  }

  try {
    const server = getServerSupabaseAdmin();
    if (!server) return { ok: false, error: "Server Supabase is not configured." };

    const id = await createEstimateWithItemsWithClient(server, {
      customerId: payload.customerId?.trim() || undefined,
      clientName,
      projectName,
      address: payload.address?.trim() ?? "",
      clientPhone: payload.clientPhone?.trim() ?? "",
      clientEmail: payload.clientEmail?.trim() ?? "",
      estimateDate: payload.estimateDate || undefined,
      validUntil: payload.validUntil || undefined,
      notes: payload.notes?.trim() || undefined,
      documentNotes: payload.documentNotes,
      salesPerson: payload.salesPerson?.trim() || undefined,
      tax: payload.tax ?? 0,
      discount: payload.discount ?? 0,
      overheadPct: payload.overheadPct ?? 0,
      profitPct: payload.profitPct ?? 0,
      documentStyle: payload.documentStyle,
      categoryNames: payload.costCategoryNames,
      items: items.map((i) => ({
        costCode: i.costCode,
        desc: i.desc,
        qty: i.qty,
        unit: i.unit,
        unitCost: i.unitCost,
        markupPct: 0,
        hideAmountOnPdf: Boolean(i.hideAmountOnPdf),
        status: i.status,
        sortOrder: i.sortOrder,
      })),
      paymentSchedule: payload.paymentSchedule?.length ? payload.paymentSchedule : undefined,
      activityActor: estimateActivityActorFromAuth(auth.context),
    });

    revalidatePath("/estimates");
    revalidateEstimatePaths(id);
    return { ok: true, estimateId: id };
  } catch (error) {
    return { ok: false, error: safeCreateEstimateError(error) };
  }
}

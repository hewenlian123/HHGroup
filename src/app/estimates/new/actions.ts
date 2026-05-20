"use server";

import { revalidatePath } from "next/cache";
import { revalidateEstimatePaths } from "@/app/estimates/revalidate-estimate-paths";
import { createEstimateWithItemsWithClient } from "@/lib/estimates-db";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export type CreateEstimatePayload = {
  clientName: string;
  projectName: string;
  address: string;
  clientPhone?: string;
  clientEmail?: string;
  estimateDate?: string;
  validUntil?: string;
  notes?: string;
  salesPerson?: string;
  tax?: number;
  discount?: number;
  overheadPct?: number;
  profitPct?: number;
  costCategoryNames?: Record<string, string>;
  items: Array<{
    costCode: string;
    desc: string;
    qty: number;
    unit: string;
    unitCost: number;
    markupPct: number;
  }>;
  paymentSchedule?: Array<{
    title: string;
    description?: string | null;
    amount: number;
    dueDate?: string | null;
  }>;
};

export async function createEstimateWithItemsAction(
  payload: CreateEstimatePayload
): Promise<{ ok: boolean; estimateId?: string; error?: string }> {
  const clientName = payload.clientName.trim();
  if (!clientName) return { ok: false, error: "Client name is required." };
  const projectName = payload.projectName.trim();
  if (!projectName) return { ok: false, error: "Project name is required." };
  const items = (payload.items ?? [])
    .map((i) => ({
      ...i,
      costCode: i.costCode.trim(),
      desc: i.desc.trim(),
      unit: i.unit?.trim() || "EA",
      qty: Number(i.qty) || 0,
      unitCost: Number(i.unitCost) || 0,
      markupPct: Number(i.markupPct) || 0,
    }))
    .filter((i) => i.costCode && i.desc.length > 0);

  if (items.length === 0) {
    return { ok: false, error: "At least one line item is required." };
  }

  try {
    const server = getServerSupabaseAdmin();
    if (!server) return { ok: false, error: "Server Supabase is not configured." };

    const id = await createEstimateWithItemsWithClient(server, {
      clientName,
      projectName,
      address: payload.address?.trim() ?? "",
      clientPhone: payload.clientPhone?.trim() ?? "",
      clientEmail: payload.clientEmail?.trim() ?? "",
      estimateDate: payload.estimateDate || undefined,
      validUntil: payload.validUntil || undefined,
      notes: payload.notes?.trim() || undefined,
      salesPerson: payload.salesPerson?.trim() || undefined,
      tax: payload.tax ?? 0,
      discount: payload.discount ?? 0,
      overheadPct: payload.overheadPct ?? 0.05,
      profitPct: payload.profitPct ?? 0.1,
      categoryNames: payload.costCategoryNames,
      items: items.map((i) => ({
        costCode: i.costCode,
        desc: i.desc,
        qty: i.qty,
        unit: i.unit,
        unitCost: i.unitCost,
        markupPct: i.markupPct,
      })),
      paymentSchedule: payload.paymentSchedule?.length ? payload.paymentSchedule : undefined,
    });

    revalidatePath("/estimates");
    revalidatePath("/projects");
    revalidatePath("/projects/[id]", "page");
    revalidateEstimatePaths(id);
    return { ok: true, estimateId: id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

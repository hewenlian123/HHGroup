"use server";

import { revalidatePath } from "next/cache";
import { revalidateEstimatePaths } from "@/app/estimates/revalidate-estimate-paths";
import { createEstimateWithItems } from "@/lib/data";

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
    amountType: "percent" | "fixed";
    value: number;
    dueRule: string;
    dueDate?: string | null;
    notes?: string | null;
  }>;
};

export async function createEstimateWithItemsAction(
  payload: CreateEstimatePayload
): Promise<{ ok: boolean; estimateId?: string; error?: string }> {
  const clientName = payload.clientName.trim();
  if (!clientName) return { ok: false, error: "Client name is required" };
  const projectName = payload.projectName.trim();
  if (!projectName) return { ok: false, error: "Project name is required" };

  try {
    const id = await createEstimateWithItems({
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
      costCategoryNames: payload.costCategoryNames,
      items: payload.items.map((i) => ({
        costCode: i.costCode,
        desc: i.desc.trim() || "Line item",
        qty: Number(i.qty) || 0,
        unit: i.unit?.trim() || "EA",
        unitCost: Number(i.unitCost) || 0,
        markupPct: Number(i.markupPct) ?? 0.1,
      })),
      paymentSchedule: payload.paymentSchedule?.length ? payload.paymentSchedule : undefined,
    });

    revalidatePath("/estimates");
    revalidateEstimatePaths(id);
    return { ok: true, estimateId: id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

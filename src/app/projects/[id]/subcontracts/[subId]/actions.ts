"use server";

import { revalidatePath } from "next/cache";
import {
  createApBillFromScheduleItem,
  insertPaymentScheduleItem,
} from "@/lib/subcontract-payment-schedule-db";
import { updateSubcontractStatus as updateSubcontractStatusDefault } from "@/lib/data";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";

export async function updateSubcontractStatusAction(
  projectId: string,
  subcontractId: string,
  status: "Draft" | "Active" | "Completed" | "Cancelled"
): Promise<{ ok: boolean; error?: string }> {
  try {
    await updateSubcontractStatusDefault(subcontractId, status);
    revalidatePath(`/projects/${projectId}/subcontracts`);
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update status." };
  }
}

export async function addPaymentScheduleItemAction(input: {
  projectId: string;
  subcontractId: string;
  subcontractorId: string;
  title: string;
  description?: string | null;
  amount: number;
  dueDate?: string | null;
}): Promise<{
  ok: boolean;
  item?: Awaited<ReturnType<typeof insertPaymentScheduleItem>>;
  error?: string;
}> {
  try {
    const supabase = getServerSupabaseInternalNoStore();
    if (!supabase) throw new Error("Supabase is not configured.");
    const item = await insertPaymentScheduleItem(
      {
        projectId: input.projectId,
        subcontractId: input.subcontractId,
        subcontractorId: input.subcontractorId,
        title: input.title,
        description: input.description,
        amount: input.amount,
        dueDate: input.dueDate,
      },
      supabase
    );
    revalidatePath(`/projects/${input.projectId}/subcontracts`);
    revalidatePath(`/projects/${input.projectId}/subcontracts/${input.subcontractId}`);
    return { ok: true, item };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add schedule item." };
  }
}

export async function createApBillFromScheduleAction(input: {
  projectId: string;
  subcontractId: string;
  scheduleId: string;
}): Promise<{ ok: boolean; billId?: string; created?: boolean; error?: string }> {
  try {
    const supabase = getServerSupabaseInternalNoStore();
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await createApBillFromScheduleItem(input.scheduleId, supabase);
    revalidatePath(`/projects/${input.projectId}/subcontracts`);
    revalidatePath(`/projects/${input.projectId}/subcontracts/${input.subcontractId}`);
    revalidatePath("/bills");
    revalidatePath(`/bills/${result.apBillId}`);
    return { ok: true, billId: result.apBillId, created: result.created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create AP bill.",
    };
  }
}

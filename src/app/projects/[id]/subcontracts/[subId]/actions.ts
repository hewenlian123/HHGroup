"use server";

import { revalidatePath } from "next/cache";
import {
  createApBillFromScheduleItem,
  insertPaymentScheduleItem,
} from "@/lib/subcontract-payment-schedule-db";
import { updateSubcontractStatus as updateSubcontractStatusDefault } from "@/lib/data";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";

async function subcontractClient(projectId: string, subcontractId: string) {
  const guard = await requireOrganizationServerActionClient({
    projectId,
    write: true,
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) throw new Error(guard.error);
  const subcontract = await guard.client
    .from("subcontracts")
    .select("id,subcontractor_id")
    .eq("id", subcontractId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (subcontract.error || !subcontract.data) throw new Error("Subcontract not found.");
  return { client: guard.client, subcontract: subcontract.data };
}

export async function updateSubcontractStatusAction(
  projectId: string,
  subcontractId: string,
  status: "Draft" | "Active" | "Completed" | "Cancelled"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { client } = await subcontractClient(projectId, subcontractId);
    await updateSubcontractStatusDefault(subcontractId, status, client);
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
    const { client: supabase, subcontract } = await subcontractClient(
      input.projectId,
      input.subcontractId
    );
    if (subcontract.subcontractor_id !== input.subcontractorId)
      throw new Error("Subcontractor mismatch.");
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
    const { client: supabase } = await subcontractClient(input.projectId, input.subcontractId);
    const schedule = await supabase
      .from("subcontract_payment_schedule")
      .select("id")
      .eq("id", input.scheduleId)
      .eq("subcontract_id", input.subcontractId)
      .maybeSingle();
    if (schedule.error || !schedule.data) throw new Error("Payment schedule item not found.");
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

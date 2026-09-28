"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
import {
  insertSubcontractBill,
  approveSubcontractBill,
  deleteSubcontractBillDraft,
  updateSubcontractBill,
  voidSubcontractBill,
  recordSubcontractPayment,
} from "@/lib/data";

async function authenticatedFinancialClient(
  projectId: string,
  subcontractId: string,
  billId?: string
) {
  const guard = await requireOrganizationServerActionClient({
    projectId,
    write: true,
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) throw new Error(guard.error);
  const subcontract = await guard.client
    .from("subcontracts")
    .select("id")
    .eq("id", subcontractId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (subcontract.error || !subcontract.data) throw new Error("Subcontract not found.");
  if (billId) {
    const bill = await guard.client
      .from("subcontract_bills")
      .select("id")
      .eq("id", billId)
      .eq("subcontract_id", subcontractId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (bill.error || !bill.data) throw new Error("Bill not found.");
  }
  return guard.client;
}

export async function addSubcontractBillAction(draft: {
  subcontract_id: string;
  project_id: string;
  bill_date: string;
  due_date?: string | null;
  amount: number;
  description?: string | null;
}) {
  await insertSubcontractBill(
    draft,
    await authenticatedFinancialClient(draft.project_id, draft.subcontract_id)
  );
}

export async function approveSubcontractBillAction(
  projectId: string,
  subcontractId: string,
  billId: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const result = await approveSubcontractBill(
      billId,
      await authenticatedFinancialClient(projectId, subcontractId, billId)
    );
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}/bills`);
    return {
      ok: true,
      message: result.alreadyApproved ? "Bill was already approved." : "Bill approved.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to approve bill." };
  }
}

export async function updateSubcontractBillAction(
  projectId: string,
  subcontractId: string,
  billId: string,
  patch: {
    bill_date?: string;
    due_date?: string | null;
    amount?: number;
    description?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await updateSubcontractBill(
      billId,
      patch,
      await authenticatedFinancialClient(projectId, subcontractId, billId)
    );
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}/bills`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update bill." };
  }
}

export async function deleteSubcontractBillDraftAction(
  projectId: string,
  subcontractId: string,
  billId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await deleteSubcontractBillDraft(
      billId,
      await authenticatedFinancialClient(projectId, subcontractId, billId)
    );
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}/bills`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete bill." };
  }
}

export async function voidSubcontractBillAction(
  projectId: string,
  subcontractId: string,
  billId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await voidSubcontractBill(
      billId,
      await authenticatedFinancialClient(projectId, subcontractId, billId)
    );
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}/bills`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to void bill." };
  }
}

export async function recordSubcontractPaymentAction(
  projectId: string,
  subcontractId: string,
  input: {
    subcontract_id: string;
    bill_id: string;
    payment_date: string;
    amount: number;
    method?: string | null;
    note?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (input.subcontract_id !== subcontractId) throw new Error("Subcontract mismatch.");
    await recordSubcontractPayment(
      input,
      await authenticatedFinancialClient(projectId, subcontractId, input.bill_id)
    );
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}/bills`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record payment." };
  }
}

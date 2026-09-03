"use server";

import { revalidatePath } from "next/cache";
import { authorizedAppRole } from "@/lib/auth-role";
import { FinancialDataUnavailableError } from "@/lib/financial-availability";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  insertSubcontractBill,
  approveSubcontractBill,
  deleteSubcontractBillDraft,
  updateSubcontractBill,
  voidSubcontractBill,
  recordSubcontractPayment,
} from "@/lib/data";

async function authenticatedFinancialClient() {
  const client = await createServerSupabaseClient({ noStore: true });
  if (!client) throw new FinancialDataUnavailableError("subcontract payment session", null);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error) throw new FinancialDataUnavailableError("subcontract payment session", error);
  if (!user || !authorizedAppRole(user)) {
    throw new FinancialDataUnavailableError("subcontract payment session", {
      code: "42501",
      message: "Owner or admin authentication required.",
    });
  }
  return client;
}

export async function addSubcontractBillAction(draft: {
  subcontract_id: string;
  project_id: string;
  bill_date: string;
  due_date?: string | null;
  amount: number;
  description?: string | null;
}) {
  await insertSubcontractBill(draft);
}

export async function approveSubcontractBillAction(
  projectId: string,
  subcontractId: string,
  billId: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const result = await approveSubcontractBill(billId);
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
    await updateSubcontractBill(billId, patch);
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
    await deleteSubcontractBillDraft(billId);
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
    await voidSubcontractBill(billId);
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
    await recordSubcontractPayment(input, await authenticatedFinancialClient());
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}/bills`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record payment." };
  }
}

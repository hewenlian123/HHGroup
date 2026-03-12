"use server";

import { revalidatePath } from "next/cache";
import {
  insertSubcontractBill,
  approveSubcontractBill,
  deleteSubcontractBillDraft,
  updateSubcontractBill,
  voidSubcontractBill,
  recordSubcontractPayment,
} from "@/lib/data";

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

export async function approveSubcontractBillAction(billId: string) {
  await approveSubcontractBill(billId);
}

export async function updateSubcontractBillAction(
  projectId: string,
  subcontractId: string,
  billId: string,
  patch: { bill_date?: string; due_date?: string | null; amount?: number; description?: string | null }
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
  input: { subcontract_id: string; bill_id: string; payment_date: string; amount: number; method?: string | null; note?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await recordSubcontractPayment(input);
    revalidatePath(`/projects/${projectId}/subcontracts/${subcontractId}/bills`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record payment." };
  }
}

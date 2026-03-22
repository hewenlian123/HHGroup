"use server";

import { revalidatePath } from "next/cache";
import { deleteApBillDraft, voidApBill } from "@/lib/data";

export async function voidBillAction(billId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await voidApBill(billId);
    revalidatePath("/bills");
    revalidatePath(`/bills/${billId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to void bill." };
  }
}

export async function deleteBillDraftAction(
  billId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await deleteApBillDraft(billId);
    revalidatePath("/bills");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete bill." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { deleteInvoice as deleteInvoiceData } from "@/lib/data";

export async function deleteInvoiceAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const deleted = await deleteInvoiceData(invoiceId);
    if (!deleted)
      return {
        ok: false,
        error: "Cannot delete: void instead",
      };
    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete invoice." };
  }
}

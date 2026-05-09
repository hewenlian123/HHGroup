"use server";

import { revalidatePath } from "next/cache";
import {
  deleteInvoice as deleteInvoiceData,
  updateInvoice as updateInvoiceData,
  type InvoiceLineItem,
} from "@/lib/data";

function toSafeLineItems(
  lineItems: Array<{ description: string; qty: number; unitPrice: number }>
): InvoiceLineItem[] {
  return lineItems
    .map((item) => {
      const description = (item.description ?? "").trim();
      const qty = Math.max(0, Number(item.qty) || 0);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      return {
        description,
        qty,
        unitPrice,
        amount: qty * unitPrice,
      };
    })
    .filter((item) => item.description.length > 0);
}

export async function updateInvoiceAction(
  invoiceId: string,
  payload: {
    projectId: string;
    clientName: string;
    issueDate: string;
    dueDate: string;
    taxPct?: number;
    notes?: string;
    lineItems: Array<{ description: string; qty: number; unitPrice: number }>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const projectId = payload.projectId?.trim();
  if (!projectId) return { ok: false, error: "Project is required." };

  const clientName = payload.clientName?.trim();
  if (!clientName) return { ok: false, error: "Client name is required." };

  const lineItems = toSafeLineItems(payload.lineItems ?? []);
  if (lineItems.length === 0) {
    return { ok: false, error: "At least one line item is required." };
  }

  try {
    const updated = await updateInvoiceData(invoiceId, {
      projectId,
      clientName,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      taxPct: Math.max(0, Number(payload.taxPct ?? 0) || 0),
      notes: payload.notes ?? "",
      lineItems,
    });
    if (!updated) return { ok: false, error: "Only draft invoices can be edited." };
    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update invoice." };
  }
}

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

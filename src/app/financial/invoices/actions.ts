"use server";

import { revalidatePath } from "next/cache";
import {
  deleteInvoice as deleteInvoiceData,
  getInvoiceDeleteDependencies,
  getInvoiceById,
  unlinkInvoiceFromPaymentScheduleItem,
  updateInvoice as updateInvoiceData,
  type InvoiceDeleteDependenciesResult,
  type InvoiceLineItem,
} from "@/lib/data";
import { createServerSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";

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
    customerId?: string | null;
    invoiceNo?: string;
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
    const existing = await getInvoiceById(invoiceId);
    const updated = await updateInvoiceData(invoiceId, {
      projectId,
      ...(payload.customerId !== undefined ? { customerId: payload.customerId } : {}),
      invoiceNo: payload.invoiceNo,
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
    revalidatePath(`/financial/invoices/${invoiceId}/preview`);
    revalidatePath(`/financial/invoices/${invoiceId}/print`);
    if (existing?.projectId) revalidatePath(`/projects/${existing.projectId}`);
    if (projectId) revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update invoice." };
  }
}

export async function markInvoiceSentAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = getServerSupabaseAdmin();
    const supabase = admin ?? (await createServerSupabaseClient());
    if (!supabase) return { ok: false, error: "Supabase is not configured." };
    if (!admin) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) return { ok: false, error: "You must be signed in." };
    }

    const invoiceRes = await supabase
      .from("invoices")
      .select("id, status, project_id, client_name")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceRes.error) {
      return { ok: false, error: invoiceRes.error.message ?? "Failed to load invoice." };
    }
    const invoice = invoiceRes.data as {
      id: string;
      status?: string | null;
      project_id?: string | null;
      client_name?: string | null;
    } | null;
    if (!invoice) return { ok: false, error: "Invoice not found." };
    if (String(invoice.status ?? "") !== "Draft") {
      return { ok: false, error: "Only draft invoices can be marked as sent." };
    }
    if (!invoice.project_id || !String(invoice.client_name ?? "").trim()) {
      return { ok: false, error: "Project and client are required before marking sent." };
    }

    const itemRes = await supabase
      .from("invoice_items")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceId);
    if (itemRes.error) {
      return { ok: false, error: itemRes.error.message ?? "Failed to load invoice items." };
    }
    if ((itemRes.count ?? 0) <= 0) {
      return { ok: false, error: "At least one line item is required before marking sent." };
    }

    const { error } = await supabase
      .from("invoices")
      .update({ status: "Sent" })
      .eq("id", invoiceId)
      .eq("status", "Draft");
    if (error) return { ok: false, error: error.message ?? "Failed to mark invoice sent." };

    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    revalidatePath(`/financial/invoices/${invoiceId}/preview`);
    revalidatePath(`/financial/invoices/${invoiceId}/print`);
    if (invoice.project_id) revalidatePath(`/projects/${invoice.project_id}`);
    revalidatePath("/financial/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark invoice sent." };
  }
}

export async function deleteInvoiceAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string; dependencies?: InvoiceDeleteDependenciesResult }> {
  try {
    const dependencies = await getInvoiceDeleteDependencies(invoiceId);
    if (dependencies.blockers.length > 0) {
      return {
        ok: false,
        error:
          dependencies.blockers[0]?.type === "invoice_status"
            ? "Only voided invoices can be permanently deleted."
            : "This invoice cannot be deleted yet because it is linked to other records.",
        dependencies,
      };
    }

    const deleted = await deleteInvoiceData(invoiceId);
    if (!deleted)
      return {
        ok: false,
        error: "This invoice could not be deleted. Refresh and try again.",
      };
    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    if (dependencies.projectId) revalidatePath(`/projects/${dependencies.projectId}`);
    revalidatePath("/financial/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete invoice." };
  }
}

export async function checkInvoiceDeleteDependenciesAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string; dependencies?: InvoiceDeleteDependenciesResult }> {
  try {
    return { ok: true, dependencies: await getInvoiceDeleteDependencies(invoiceId) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to check invoice dependencies.",
    };
  }
}

export async function unlinkInvoiceScheduleItemAction(
  invoiceId: string,
  scheduleItemId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await unlinkInvoiceFromPaymentScheduleItem(invoiceId, scheduleItemId);
    if (!result.ok) return { ok: false, error: result.error ?? "Failed to unlink schedule item." };
    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    if (result.estimateId) revalidatePath(`/estimates/${result.estimateId}`);
    revalidatePath("/financial/owner");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to unlink schedule item.",
    };
  }
}

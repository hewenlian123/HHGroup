"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionWithClient } from "@/lib/auth-boundary";
import {
  createInvoice as createInvoiceData,
  deleteInvoice as deleteInvoiceData,
  getInvoiceDeleteDependencies,
  getInvoiceById,
  getInvoiceByIdWithDerived,
  unlinkInvoiceFromPaymentScheduleItem,
  revertInvoiceToDraft as revertInvoiceToDraftData,
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

function safeInvoiceActionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (
    /permission denied|row-level security|rls|schema cache|relation .* does not exist|column .* does not exist|violates|duplicate key|supabase|postgrest|jwt/i.test(
      message
    )
  ) {
    return fallback;
  }
  return message;
}

async function getInvoiceActionClient() {
  const guard = await requireSupabaseOwnerOrAdminServerActionWithClient(getServerSupabaseAdmin);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const admin = guard.client;
  const supabase = admin ?? (await createServerSupabaseClient());
  if (!supabase) return { ok: false as const, error: "Supabase is not configured." };
  return { ok: true as const, client: supabase };
}

function revalidateInvoicePaths(invoiceId: string, projectId?: string | null) {
  revalidatePath("/financial/invoices");
  revalidatePath(`/financial/invoices/${invoiceId}`);
  revalidatePath(`/financial/invoices/${invoiceId}/preview`);
  revalidatePath(`/financial/invoices/${invoiceId}/print`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/financial/owner");
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
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;

    const existing = await getInvoiceById(invoiceId, clientResult.client);
    const updated = await updateInvoiceData(
      invoiceId,
      {
        projectId,
        ...(payload.customerId !== undefined ? { customerId: payload.customerId } : {}),
        invoiceNo: payload.invoiceNo,
        clientName,
        issueDate: payload.issueDate,
        dueDate: payload.dueDate,
        taxPct: Math.max(0, Number(payload.taxPct ?? 0) || 0),
        notes: payload.notes ?? "",
        lineItems,
      },
      clientResult.client
    );
    if (!updated) return { ok: false, error: "Only draft invoices can be edited." };
    revalidateInvoicePaths(invoiceId, projectId);
    if (existing?.projectId) revalidatePath(`/projects/${existing.projectId}`);
    return { ok: true };
  } catch (e) {
    console.error("[invoice/actions] failed to update invoice", e);
    return { ok: false, error: safeInvoiceActionError(e, "Failed to update invoice.") };
  }
}

export async function markInvoiceSentAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;
    const supabase = clientResult.client;

    const invoiceRes = await supabase
      .from("invoices")
      .select("id, status, project_id, client_name")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceRes.error) {
      console.error("[invoice/actions] failed to load invoice before mark sent", invoiceRes.error);
      return { ok: false, error: "Failed to load invoice." };
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
      console.error(
        "[invoice/actions] failed to load invoice items before mark sent",
        itemRes.error
      );
      return { ok: false, error: "Failed to load invoice items." };
    }
    if ((itemRes.count ?? 0) <= 0) {
      return { ok: false, error: "At least one line item is required before marking sent." };
    }

    const { data: updated, error } = await supabase
      .from("invoices")
      .update({ status: "Sent" })
      .eq("id", invoiceId)
      .eq("status", "Draft")
      .select("id, status")
      .maybeSingle();
    if (error) {
      console.error("[invoice/actions] failed to mark invoice sent", error);
      return { ok: false, error: "Failed to mark invoice sent." };
    }
    if (!updated) {
      return { ok: false, error: "Invoice was not updated. Refresh and try again." };
    }

    revalidateInvoicePaths(invoiceId, invoice.project_id);
    return { ok: true };
  } catch (e) {
    console.error("[invoice/actions] failed to mark invoice sent", e);
    return { ok: false, error: safeInvoiceActionError(e, "Failed to mark invoice sent.") };
  }
}

export async function revertInvoiceToDraftAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;

    const invoice = await getInvoiceByIdWithDerived(invoiceId);
    const ok = await revertInvoiceToDraftData(invoiceId);
    if (!ok) {
      return {
        ok: false,
        error: "Only invoices without payments can be returned to draft.",
      };
    }
    revalidateInvoicePaths(invoiceId, invoice?.projectId ?? null);
    return { ok: true };
  } catch (e) {
    console.error("[invoice/actions] failed to return invoice to draft", e);
    return { ok: false, error: safeInvoiceActionError(e, "Failed to return invoice to draft.") };
  }
}

export async function duplicateInvoiceAction(
  invoiceId: string
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  try {
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;

    const invoice = await getInvoiceById(invoiceId, clientResult.client);
    if (!invoice || invoice.status === "Void") {
      return { ok: false, error: "Void invoices cannot be duplicated." };
    }
    const today = new Date().toISOString().slice(0, 10);
    const duplicated = await createInvoiceData(
      {
        projectId: invoice.projectId,
        customerId: invoice.customerId ?? null,
        clientName: invoice.clientName,
        issueDate: today,
        dueDate: today,
        lineItems: invoice.lineItems,
        taxPct: invoice.taxPct,
        notes: invoice.notes,
      },
      clientResult.client
    );
    revalidateInvoicePaths(duplicated.id, duplicated.projectId);
    return { ok: true, invoiceId: duplicated.id };
  } catch (e) {
    console.error("[invoice/actions] failed to duplicate invoice", e);
    return { ok: false, error: safeInvoiceActionError(e, "Failed to duplicate invoice.") };
  }
}

async function syncInvoiceStatusAfterPaymentDelete(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  invoiceId: string
) {
  if (!supabase) return;
  const [invoiceRes, paymentsRes] = await Promise.all([
    supabase.from("invoices").select("id, total, status").eq("id", invoiceId).maybeSingle(),
    supabase.from("invoice_payments").select("amount, status").eq("invoice_id", invoiceId),
  ]);
  if (invoiceRes.error || paymentsRes.error || !invoiceRes.data) return;
  const invoice = invoiceRes.data as { total?: number | null; status?: string | null };
  const status = String(invoice.status ?? "");
  if (status === "Void" || status === "Draft") return;
  const total = Number(invoice.total ?? 0) || 0;
  const paidTotal = (
    (paymentsRes.data ?? []) as Array<{ amount?: number | null; status?: string | null }>
  )
    .filter((payment) => String(payment.status ?? "") !== "Voided")
    .reduce((sum, payment) => sum + (Number(payment.amount ?? 0) || 0), 0);
  const nextStatus =
    paidTotal <= 0.0000001 ? "Sent" : paidTotal + 0.0000001 >= total ? "Paid" : "Partially Paid";
  await supabase.from("invoices").update({ status: nextStatus }).eq("id", invoiceId);
}

export async function deleteInvoicePaymentAction(
  invoiceId: string,
  paymentId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;
    const supabase = clientResult.client;

    const paymentRes = await supabase
      .from("invoice_payments")
      .select("id, invoice_id, amount, status, payment_received_id")
      .eq("id", paymentId)
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (paymentRes.error) {
      console.error(
        "[invoice/actions] failed to load invoice payment before delete",
        paymentRes.error
      );
      return { ok: false, error: "Failed to load invoice payment." };
    }
    const payment = paymentRes.data as {
      id?: string;
      invoice_id?: string | null;
      payment_received_id?: string | null;
    } | null;
    if (!payment?.id) return { ok: false, error: "Invoice payment not found." };
    if (payment.payment_received_id) {
      return {
        ok: false,
        error: "This payment is linked to Payments Received. Void it from the Payments page.",
      };
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("invoice_payments")
      .delete()
      .eq("id", paymentId)
      .eq("invoice_id", invoiceId)
      .select("id")
      .maybeSingle();
    if (deleteError) {
      console.error("[invoice/actions] failed to delete invoice payment", deleteError);
      return { ok: false, error: "Failed to delete invoice payment." };
    }
    if (!deleted) {
      return { ok: false, error: "Invoice payment was not deleted. Refresh and try again." };
    }

    await syncInvoiceStatusAfterPaymentDelete(supabase, invoiceId);
    revalidateInvoicePaths(invoiceId);
    return { ok: true };
  } catch (e) {
    console.error("[invoice/actions] failed to delete invoice payment", e);
    return { ok: false, error: safeInvoiceActionError(e, "Failed to delete invoice payment.") };
  }
}

export async function deleteInvoiceAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string; dependencies?: InvoiceDeleteDependenciesResult }> {
  try {
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;

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
    console.error("[invoice/actions] failed to delete invoice", e);
    return { ok: false, error: safeInvoiceActionError(e, "Failed to delete invoice.") };
  }
}

export async function checkInvoiceDeleteDependenciesAction(
  invoiceId: string
): Promise<{ ok: boolean; error?: string; dependencies?: InvoiceDeleteDependenciesResult }> {
  try {
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;

    return { ok: true, dependencies: await getInvoiceDeleteDependencies(invoiceId) };
  } catch (e) {
    console.error("[invoice/actions] failed to check invoice dependencies", e);
    return {
      ok: false,
      error: safeInvoiceActionError(e, "Failed to check invoice dependencies."),
    };
  }
}

export async function unlinkInvoiceScheduleItemAction(
  invoiceId: string,
  scheduleItemId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const clientResult = await getInvoiceActionClient();
    if (!clientResult.ok) return clientResult;

    const result = await unlinkInvoiceFromPaymentScheduleItem(invoiceId, scheduleItemId);
    if (!result.ok) return { ok: false, error: result.error ?? "Failed to unlink schedule item." };
    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    if (result.estimateId) revalidatePath(`/estimates/${result.estimateId}`);
    revalidatePath("/financial/owner");
    return { ok: true };
  } catch (e) {
    console.error("[invoice/actions] failed to unlink invoice schedule item", e);
    return {
      ok: false,
      error: safeInvoiceActionError(e, "Failed to unlink schedule item."),
    };
  }
}

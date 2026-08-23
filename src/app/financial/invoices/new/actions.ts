"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionWithClient } from "@/lib/auth-boundary";
import { createServerSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { getEstimateInvoicePrefill } from "./estimate-prefill";
import {
  estimateActivityActorFromAuth,
  linkEstimateMilestoneInvoiceWithActivityWithClient,
} from "@/lib/estimate-activity";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isQuantityColumnUnsupported(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /quantity/i.test(message) && /column|generated|schema cache|could not find/i.test(message);
}

async function removeRejectedEstimateInvoice(
  db: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  invoiceId: string
): Promise<void> {
  if (!db) throw new Error("Draft Invoice cleanup is unavailable.");
  const itemsDelete = await db.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (itemsDelete.error) {
    throw new Error("Draft Invoice cleanup failed after Estimate linkage was rejected.");
  }
  const invoiceDelete = await db.from("invoices").delete().eq("id", invoiceId);
  if (invoiceDelete.error) {
    throw new Error("Draft Invoice cleanup failed after Estimate linkage was rejected.");
  }
}

export async function createInvoiceDraftAction(payload: {
  invoiceNo?: string;
  projectId: string;
  customerId?: string | null;
  clientName: string;
  issueDate: string;
  dueDate: string;
  taxPct?: number;
  notes?: string;
  sourceEstimateId?: string;
  paymentScheduleItemId?: string;
  lineItems: Array<{ description: string; qty: number; unitPrice: number }>;
  allowIncomplete?: boolean;
}): Promise<{ ok: boolean; invoiceId?: string; error?: string }> {
  const projectId = payload.projectId?.trim();
  if (!projectId && !payload.allowIncomplete) return { ok: false, error: "Project is required." };

  const clientName = payload.clientName?.trim();
  if (!clientName && !payload.allowIncomplete)
    return { ok: false, error: "Client name is required." };

  const items = (payload.lineItems ?? [])
    .map((l) => ({
      description: (l.description ?? "").trim(),
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }))
    .filter((l) => l.description.length > 0);

  if (items.length === 0 && !payload.allowIncomplete)
    return { ok: false, error: "At least one line item is required." };

  try {
    const clientGuard =
      await requireSupabaseOwnerOrAdminServerActionWithClient(getServerSupabaseAdmin);
    if (!clientGuard.ok) return { ok: false, error: clientGuard.error };
    const admin = clientGuard.client;
    const supabase = admin ?? (await createServerSupabaseClient());
    if (!supabase) return { ok: false, error: "Supabase is not configured." };
    const activityActor = estimateActivityActorFromAuth(clientGuard.context);

    const safeIssueDate = String(payload.issueDate ?? "").slice(0, 10);
    const safeDueDate = String(payload.dueDate ?? "").slice(0, 10);
    const customerId = payload.customerId?.trim() || null;
    const sourceEstimateId = payload.sourceEstimateId?.trim() || "";
    const paymentScheduleItemId = payload.paymentScheduleItemId?.trim() || "";
    let subtotal = items.reduce((s, l) => s + Math.max(0, l.qty) * Math.max(0, l.unitPrice), 0);
    let taxPct = toNum(payload.taxPct ?? 0);
    let taxAmount = Math.round(subtotal * (taxPct / 100) * 100) / 100;
    let total = subtotal + taxAmount;

    if (Boolean(sourceEstimateId) !== Boolean(paymentScheduleItemId)) {
      return { ok: false, error: "Both source estimate and payment milestone are required." };
    }
    if (sourceEstimateId && paymentScheduleItemId) {
      const source = await getEstimateInvoicePrefill(
        sourceEstimateId,
        paymentScheduleItemId,
        supabase
      );
      if (!source.ok) {
        if (source.existingInvoiceId) {
          return { ok: true, invoiceId: source.existingInvoiceId };
        }
        return { ok: false, error: source.error };
      }
      if (projectId !== source.prefill.projectId) {
        return { ok: false, error: "Invoice project must match the estimate milestone project." };
      }
      if (!customerId || customerId !== source.prefill.customerId) {
        return { ok: false, error: "Invoice customer must match the estimate milestone customer." };
      }
      const roundedSubtotal = Math.round(subtotal * 100) / 100;
      const roundedTotal = Math.round(total * 100) / 100;
      if (
        roundedSubtotal !== source.prefill.invoiceSubtotal ||
        Math.abs(taxPct - source.prefill.invoiceTaxPct) > 0.000001 ||
        roundedTotal !== source.prefill.invoiceTotal
      ) {
        return {
          ok: false,
          error: `Invoice financial breakdown must match the authoritative ${source.prefill.amount.toLocaleString(
            "en-US",
            {
              style: "currency",
              currency: "USD",
            }
          )} milestone total.`,
        };
      }
      subtotal = source.prefill.invoiceSubtotal;
      taxPct = source.prefill.invoiceTaxPct;
      taxAmount = source.prefill.invoiceTaxAmount;
      total = source.prefill.invoiceTotal;
    }

    const customInvoiceNo = payload.invoiceNo?.trim();
    let invoiceNo = customInvoiceNo ?? "";
    if (!invoiceNo) {
      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true });
      const nextNum = (count ?? 0) + 1;
      invoiceNo = `INV-${String(nextNum).padStart(4, "0")}`;
    }

    const { data: invRow, error: invErr } = await supabase
      .from("invoices")
      .insert({
        invoice_no: invoiceNo,
        project_id: projectId || null,
        customer_id: customerId,
        client_name: clientName,
        issue_date: safeIssueDate,
        due_date: safeDueDate,
        status: "Draft",
        notes: payload.notes ?? null,
        tax_pct: taxPct,
        subtotal,
        tax_amount: taxAmount,
        total,
      })
      .select("id")
      .single();
    if (invErr || !invRow?.id)
      return { ok: false, error: invErr?.message ?? "Failed to create invoice." };

    const invoiceId = String(invRow.id);
    const itemRows = items.map((l) => ({
      invoice_id: invoiceId,
      description: l.description,
      qty: Math.max(0, l.qty),
      quantity: Math.max(0, l.qty),
      unit_price: Math.max(0, l.unitPrice),
      amount: Math.max(0, l.qty) * Math.max(0, l.unitPrice),
    }));
    if (itemRows.length > 0) {
      let { error: itemsErr } = await supabase.from("invoice_items").insert(itemRows);
      if (itemsErr && isQuantityColumnUnsupported(itemsErr)) {
        const fallbackRows = itemRows.map(
          ({ invoice_id, description, qty, unit_price, amount }) => ({
            invoice_id,
            description,
            qty,
            unit_price,
            amount,
          })
        );
        const fallback = await supabase.from("invoice_items").insert(fallbackRows);
        itemsErr = fallback.error;
      }
      if (itemsErr) {
        await supabase.from("invoices").delete().eq("id", invoiceId);
        return { ok: false, error: itemsErr.message ?? "Failed to create invoice items." };
      }
    }

    if (sourceEstimateId && paymentScheduleItemId) {
      let linked: { invoiceId: string; linked: boolean };
      try {
        linked = await linkEstimateMilestoneInvoiceWithActivityWithClient(supabase, {
          estimateId: sourceEstimateId,
          scheduleItemId: paymentScheduleItemId,
          invoiceId,
          actor: activityActor,
        });
      } catch (error) {
        try {
          await removeRejectedEstimateInvoice(supabase, invoiceId);
        } catch (cleanupError) {
          return {
            ok: false,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : "Draft Invoice cleanup failed after Estimate linkage was rejected.",
          };
        }
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to link estimate milestone.",
        };
      }
      if (!linked.linked) {
        await removeRejectedEstimateInvoice(supabase, invoiceId);
        const existingInvoiceId = linked.invoiceId.trim();
        if (existingInvoiceId) {
          revalidatePath(`/estimates/${sourceEstimateId}`);
          revalidatePath(`/financial/invoices/${existingInvoiceId}`);
          return { ok: true, invoiceId: existingInvoiceId };
        }
        return { ok: false, error: "Could not link invoice to estimate milestone." };
      }
    }

    await supabase
      .from("invoices")
      .update({
        subtotal,
        tax_pct: taxPct,
        tax_amount: taxAmount,
        total,
      })
      .eq("id", invoiceId);

    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    if (projectId) revalidatePath(`/projects/${projectId}`);
    if (sourceEstimateId) revalidatePath(`/estimates/${sourceEstimateId}`);
    revalidatePath("/financial/owner");

    return { ok: true, invoiceId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

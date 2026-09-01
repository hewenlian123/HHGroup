"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionWithClient } from "@/lib/auth-boundary";
import { createServerSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { getEstimateInvoicePrefill } from "./estimate-prefill";
import { estimateActivityActorFromAuth } from "@/lib/estimate-activity";
import {
  createEstimateMilestoneInvoiceAtomicWithClient,
  createInvoiceAtomicWithClient,
} from "@/lib/invoices-db";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function createInvoiceDraftAction(payload: {
  idempotencyKey?: string;
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

    const idempotencyKey =
      sourceEstimateId && paymentScheduleItemId
        ? `invoice-milestone:${sourceEstimateId}:${paymentScheduleItemId}`
        : payload.idempotencyKey?.trim() || globalThis.crypto.randomUUID();
    const invoiceCreatePayload = {
      idempotencyKey,
      invoiceNo: payload.invoiceNo,
      projectId,
      customerId,
      clientName,
      issueDate: safeIssueDate,
      dueDate: safeDueDate,
      taxPct,
      notes: payload.notes,
      lineItems: items.map((item) => ({
        ...item,
        amount: Math.max(0, item.qty) * Math.max(0, item.unitPrice),
      })),
    };
    const created =
      sourceEstimateId && paymentScheduleItemId
        ? await createEstimateMilestoneInvoiceAtomicWithClient(
            {
              ...invoiceCreatePayload,
              estimateId: sourceEstimateId,
              scheduleItemId: paymentScheduleItemId,
              actor: activityActor,
            },
            supabase
          )
        : await createInvoiceAtomicWithClient(invoiceCreatePayload, supabase);
    const invoiceId = created.id;

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

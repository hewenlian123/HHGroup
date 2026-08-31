"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionWithClient } from "@/lib/auth-boundary";
import { createServerSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { getEstimateInvoicePrefill } from "./estimate-prefill";
import {
  estimateActivityActorFromAuth,
  linkEstimateMilestoneInvoiceWithActivityWithClient,
} from "@/lib/estimate-activity";
import { createInvoiceAtomicWithClient } from "@/lib/invoices-db";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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
      payload.idempotencyKey?.trim() ||
      (sourceEstimateId && paymentScheduleItemId
        ? `invoice-milestone:${sourceEstimateId}:${paymentScheduleItemId}`
        : globalThis.crypto.randomUUID());
    const created = await createInvoiceAtomicWithClient(
      {
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
      },
      supabase
    );
    const invoiceId = created.id;

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
        let linkageCheck: Awaited<ReturnType<typeof getEstimateInvoicePrefill>>;
        try {
          linkageCheck = await getEstimateInvoicePrefill(
            sourceEstimateId,
            paymentScheduleItemId,
            supabase
          );
        } catch {
          return {
            ok: false,
            error: "Invoice linkage could not be verified after an ambiguous response.",
          };
        }
        if (!linkageCheck.ok) {
          const linkedInvoiceId = linkageCheck.existingInvoiceId?.trim() ?? "";
          if (linkedInvoiceId === invoiceId) {
            revalidatePath(`/estimates/${sourceEstimateId}`);
            revalidatePath(`/financial/invoices/${linkedInvoiceId}`);
            return { ok: true, invoiceId: linkedInvoiceId };
          }
          return {
            ok: false,
            error: "Invoice linkage could not be verified after an ambiguous response.",
          };
        }
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
        const existingInvoiceId = linked.invoiceId.trim();
        if (existingInvoiceId === invoiceId) {
          revalidatePath(`/estimates/${sourceEstimateId}`);
          revalidatePath(`/financial/invoices/${existingInvoiceId}`);
          return { ok: true, invoiceId: existingInvoiceId };
        }
        await removeRejectedEstimateInvoice(supabase, invoiceId);
        if (existingInvoiceId) {
          revalidatePath(`/estimates/${sourceEstimateId}`);
          revalidatePath(`/financial/invoices/${existingInvoiceId}`);
          return { ok: true, invoiceId: existingInvoiceId };
        }
        return { ok: false, error: "Could not link invoice to estimate milestone." };
      }
    }

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

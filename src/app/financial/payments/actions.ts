"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  createPaymentReceived as createPaymentReceivedData,
  getPaymentAttachmentPreviewUrl as getPaymentAttachmentPreviewUrlData,
  getPaymentReceivedById as getPaymentReceivedByIdData,
  updatePaymentReceived as updatePaymentReceivedData,
  type CreatePaymentReceivedPayload,
  type PaymentReceivedDetail,
  type UpdatePaymentReceivedPayload,
} from "@/lib/payments-received-db";

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|could not find the .* column|schema cache/i.test(m);
}

type PaymentReceivedDetailWithPreviewUrls = PaymentReceivedDetail & {
  attachments: Array<PaymentReceivedDetail["attachments"][number] & { preview_url: string | null }>;
};

function safePaymentActionError(error: unknown, fallback: string): string {
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

async function getPaymentActionClient() {
  const admin = getServerSupabaseAdmin();
  const c = admin ?? (await createServerSupabaseClient());
  if (!c) return { ok: false as const, error: "Supabase is not configured." };
  if (!admin) {
    const {
      data: { user },
      error: authError,
    } = await c.auth.getUser();
    if (authError || !user) return { ok: false as const, error: "You must be signed in." };
  }
  return { ok: true as const, client: c };
}

function revalidatePaymentPaths(invoiceId?: string | null, projectId?: string | null) {
  revalidatePath("/financial/payments");
  revalidatePath("/financial/payments-received");
  revalidatePath("/financial/invoices");
  if (invoiceId) {
    revalidatePath(`/financial/invoices/${invoiceId}`);
    revalidatePath(`/financial/invoices/${invoiceId}/preview`);
    revalidatePath(`/financial/invoices/${invoiceId}/print`);
  }
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/financial/owner");
}

export async function getPaymentReceivedForEditAction(
  paymentId: string
): Promise<
  { ok: true; payment: PaymentReceivedDetailWithPreviewUrls } | { ok: false; error: string }
> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;
    const payment = await getPaymentReceivedByIdData(paymentId, clientResult.client);
    if (!payment) return { ok: false, error: "Payment not found." };

    const attachments = await Promise.all(
      (payment.attachments ?? []).map(async (attachment) => {
        try {
          return {
            ...attachment,
            preview_url: await getPaymentAttachmentPreviewUrlData(attachment, clientResult.client),
          };
        } catch {
          return { ...attachment, preview_url: null };
        }
      })
    );

    return { ok: true, payment: { ...payment, attachments } };
  } catch (e) {
    console.error("[payments/actions] failed to load payment for edit", e);
    return {
      ok: false,
      error: safePaymentActionError(e, "Failed to load payment."),
    };
  }
}

export async function createPaymentReceivedAction(
  payload: CreatePaymentReceivedPayload
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  try {
    const admin = getServerSupabaseAdmin();
    const c = admin ?? (await createServerSupabaseClient());
    if (!c) return { ok: false, error: "Supabase is not configured." };
    if (!admin) {
      const {
        data: { user },
        error: authError,
      } = await c.auth.getUser();
      if (authError || !user) return { ok: false, error: "You must be signed in." };
    }

    const payment = await createPaymentReceivedData(payload, c);
    revalidatePaymentPaths(payment.invoice_id, payment.project_id ?? payload.project_id ?? null);
    return { ok: true, paymentId: payment.id };
  } catch (e) {
    console.error("[payments/actions] failed to record payment", e);
    return { ok: false, error: safePaymentActionError(e, "Failed to record payment.") };
  }
}

export async function updatePaymentReceivedAction(
  payload: UpdatePaymentReceivedPayload
): Promise<{ ok: true; payment: PaymentReceivedDetail } | { ok: false; error: string }> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;

    const payment = await updatePaymentReceivedData(payload, clientResult.client);
    revalidatePaymentPaths(payment.invoice_id, payment.project_id ?? null);
    return { ok: true, payment };
  } catch (e) {
    console.error("[payments/actions] failed to update payment", e);
    return {
      ok: false,
      error: safePaymentActionError(e, "Failed to update payment."),
    };
  }
}

export async function deletePaymentReceivedAction(
  paymentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = getServerSupabaseAdmin();
    const c = admin ?? (await createServerSupabaseClient());
    if (!c) return { ok: false, error: "Supabase is not configured." };
    if (!admin) {
      const {
        data: { user },
        error: authError,
      } = await c.auth.getUser();
      if (authError || !user) return { ok: false, error: "You must be signed in." };
    }

    // Financial safety system:
    // payments_received with deposits cannot be deleted; void instead.
    const { data: pay, error: fetchErr } = await c
      .from("payments_received")
      .select("id, invoice_id, project_id, payment_date, amount, notes, deposit_account, status")
      .eq("id", paymentId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message ?? "Failed to load payment.");
    if (!pay) return { ok: false, error: "Payment not found." };

    const depRes = await c.from("deposits").select("id, status").eq("payment_id", paymentId);
    if (depRes.error) throw new Error(depRes.error.message ?? "Failed to load deposit.");
    const hasNonVoidDeposit = (depRes.data ?? []).some(
      (d: { status?: string | null }) => String(d.status ?? "recorded") !== "void"
    );
    // If a deposit exists, we must void (never hard-delete).
    if (hasNonVoidDeposit) {
      const { error: depVoidErr } = await c
        .from("deposits")
        .update({ status: "void" })
        .eq("payment_id", paymentId);
      if (depVoidErr) throw new Error(depVoidErr.message ?? "Failed to void deposit.");
    }

    // Best-effort: remove corresponding invoice_payment row (no FK; match by invoice_id, amount, date).
    if (pay.invoice_id) {
      try {
        const direct = await c
          .from("invoice_payments")
          .update({ status: "Voided" })
          .eq("payment_received_id", paymentId);
        if (!direct.error || !isMissingColumn(direct.error)) {
          if (direct.error) throw direct.error;
        }
      } catch {
        // Missing link or older schema: fall back to legacy matching below.
      }
      try {
        const paidAt = typeof pay.payment_date === "string" ? pay.payment_date.slice(0, 10) : null;
        const amount = Number((pay as { amount?: number }).amount ?? 0);
        let q = c
          .from("invoice_payments")
          .update({ status: "Voided" })
          .eq("invoice_id", pay.invoice_id)
          .eq("amount", amount);
        if (paidAt) q = q.eq("paid_at", paidAt);
        const memo =
          (pay as { notes?: string }).notes ??
          (pay as { deposit_account?: string }).deposit_account;
        if (typeof memo === "string" && memo.trim()) q = q.eq("memo", memo.trim());
        await q;
      } catch {
        // schema or match may differ; continue
      }
    }

    // Payment itself: do not delete. Mark void.
    const { error: updErr } = await c
      .from("payments_received")
      .update({ status: "void" })
      .eq("id", paymentId);
    if (updErr) throw new Error(updErr.message ?? "Failed to void payment.");

    revalidatePaymentPaths(
      (pay as { invoice_id?: string | null }).invoice_id ?? null,
      (pay as { project_id?: string | null }).project_id ?? null
    );
    return { ok: true };
  } catch (e) {
    console.error("[payments/actions] failed to delete payment", e);
    return { ok: false, error: safePaymentActionError(e, "Failed to delete payment.") };
  }
}

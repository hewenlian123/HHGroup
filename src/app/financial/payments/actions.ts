"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionWithClient } from "@/lib/auth-boundary";
import { createServerSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  createPaymentReceived as createPaymentReceivedData,
  deletePaymentReceived as deletePaymentReceivedData,
  getPaymentAttachmentPreviewUrl as getPaymentAttachmentPreviewUrlData,
  getPaymentReceivedDeleteDependencies,
  getPaymentReceivedById as getPaymentReceivedByIdData,
  updatePaymentReceived as updatePaymentReceivedData,
  voidPaymentReceived as voidPaymentReceivedData,
  type CreatePaymentReceivedPayload,
  type PaymentReceivedDeleteDependenciesResult,
  type PaymentReceivedDetail,
  type UpdatePaymentReceivedPayload,
  type VoidPaymentReceivedAtomicResult,
} from "@/lib/payments-received-db";

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
  const guard = await requireSupabaseOwnerOrAdminServerActionWithClient(getServerSupabaseAdmin);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const admin = guard.client;
  const c = admin ?? (await createServerSupabaseClient());
  if (!c) return { ok: false as const, error: "Supabase is not configured." };
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
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;
    const c = clientResult.client;

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

export async function voidPaymentReceivedAction(
  paymentId: string
): Promise<{ ok: true; result: VoidPaymentReceivedAtomicResult } | { ok: false; error: string }> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;

    const result = await voidPaymentReceivedData(paymentId, clientResult.client);
    revalidatePaymentPaths(result.invoice_id, result.project_id);
    return { ok: true, result };
  } catch (e) {
    console.error("[payments/actions] failed to void payment", e);
    return { ok: false, error: safePaymentActionError(e, "Failed to void payment.") };
  }
}

export async function checkPaymentReceivedDeleteDependenciesAction(
  paymentId: string
): Promise<
  { ok: true; dependencies: PaymentReceivedDeleteDependenciesResult } | { ok: false; error: string }
> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;
    return {
      ok: true,
      dependencies: await getPaymentReceivedDeleteDependencies(paymentId, clientResult.client),
    };
  } catch (e) {
    console.error("[payments/actions] failed to check payment delete dependencies", e);
    return {
      ok: false,
      error: safePaymentActionError(e, "Failed to check payment dependencies."),
    };
  }
}

export async function deletePaymentReceivedAction(
  paymentId: string
): Promise<
  | { ok: true }
  | { ok: false; error: string; dependencies?: PaymentReceivedDeleteDependenciesResult }
> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;

    const dependencies = await getPaymentReceivedDeleteDependencies(paymentId, clientResult.client);
    if (dependencies.blockers.length > 0) {
      return {
        ok: false,
        error:
          dependencies.blockers[0]?.type === "payment_status"
            ? "Only voided payments can be permanently deleted."
            : "This payment cannot be deleted yet because it is linked to other records.",
        dependencies,
      };
    }

    const deleted = await deletePaymentReceivedData(paymentId, clientResult.client);
    if (!deleted) return { ok: false, error: "Payment was not deleted. Refresh and try again." };

    revalidatePaymentPaths(dependencies.invoiceId ?? null, dependencies.projectId ?? null);
    return { ok: true };
  } catch (e) {
    console.error("[payments/actions] failed to permanently delete payment", e);
    return { ok: false, error: safePaymentActionError(e, "Failed to delete payment.") };
  }
}

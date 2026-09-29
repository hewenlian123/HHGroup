"use server";

import { revalidatePath } from "next/cache";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import {
  createPaymentReceived as createPaymentReceivedData,
  deletePaymentReceived as deletePaymentReceivedData,
  getPaymentAttachmentPreviewUrl as getPaymentAttachmentPreviewUrlData,
  getPaymentReceivedDeleteDependencies,
  getPaymentReceivedById as getPaymentReceivedByIdData,
  linkUnappliedPaymentToInvoice as linkUnappliedPaymentToInvoiceData,
  listOpenInvoicesForUnappliedPayment as listOpenInvoicesForUnappliedPaymentData,
  updatePaymentReceived as updatePaymentReceivedData,
  voidPaymentReceived as voidPaymentReceivedData,
  type CreatePaymentReceivedPayload,
  type LinkableInvoiceOption,
  type LinkedUnappliedPaymentResult,
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
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) return { ok: false as const, error: guard.error };
  return { ok: true as const, client: guard.client };
}

function revalidatePaymentPaths(invoiceId?: string | null, projectId?: string | null) {
  revalidatePath("/financial/ar");
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
): Promise<
  { ok: true; paymentId: string } | { ok: false; error: string; outcome?: "rejected" | "unknown" }
> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;
    const c = clientResult.client;

    const payment = await createPaymentReceivedData(payload, c);
    try {
      revalidatePaymentPaths(payment.invoice_id, payment.project_id ?? null);
    } catch (error) {
      console.warn("[payments/actions] payment committed; cache refresh unavailable", error);
    }
    return { ok: true, paymentId: payment.id };
  } catch (e) {
    console.error("[payments/actions] failed to record payment", e);
    return {
      ok: false,
      error: safePaymentActionError(e, "Failed to record payment."),
      outcome:
        e &&
        typeof e === "object" &&
        "code" in e &&
        typeof e.code === "string" &&
        /^(22|23|42|P0)/.test(e.code)
          ? "rejected"
          : "unknown",
    };
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

export async function listOpenInvoicesForUnappliedPaymentAction(
  paymentId: string
): Promise<{ ok: true; invoices: LinkableInvoiceOption[] } | { ok: false; error: string }> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;
    const invoices = await listOpenInvoicesForUnappliedPaymentData(paymentId, clientResult.client);
    return { ok: true, invoices };
  } catch (e) {
    console.error("[payments/actions] failed to list invoices for an unapplied payment", e);
    return { ok: false, error: safePaymentActionError(e, "Failed to load open invoices.") };
  }
}

export async function linkUnappliedPaymentToInvoiceAction(
  paymentId: string,
  invoiceId: string
): Promise<{ ok: true; result: LinkedUnappliedPaymentResult } | { ok: false; error: string }> {
  try {
    const clientResult = await getPaymentActionClient();
    if (!clientResult.ok) return clientResult;
    const result = await linkUnappliedPaymentToInvoiceData(
      paymentId,
      invoiceId,
      clientResult.client
    );
    revalidatePaymentPaths(result.invoiceId, result.projectId);
    return { ok: true, result };
  } catch (e) {
    console.error("[payments/actions] failed to link an unapplied payment", e);
    return { ok: false, error: safePaymentActionError(e, "Failed to link the payment.") };
  }
}

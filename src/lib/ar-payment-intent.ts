import type { CreatePaymentReceivedPayload } from "@/lib/payments-received-db";
import { idempotentSubmissionForPayload } from "@/lib/financial-idempotency";

type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const storageKey = (userId: string, invoiceId: string) => `hh:ar-payment:${userId}:${invoiceId}`;

export function getArPaymentIntent(
  storage: IntentStorage,
  userId: string,
  invoiceId: string
): CreatePaymentReceivedPayload | null {
  const value = storage.getItem(storageKey(userId, invoiceId));
  if (!value) return null;
  const payload = JSON.parse(value) as CreatePaymentReceivedPayload;
  if (
    !payload ||
    payload.invoice_id !== invoiceId ||
    !payload.idempotency_key ||
    !Number.isFinite(payload.amount) ||
    payload.amount <= 0
  )
    throw new Error(
      "Previous payment request is unavailable. Resolve it before recording another payment."
    );
  return payload;
}

export function beginArPaymentIntent(
  storage: IntentStorage,
  userId: string,
  draft: Omit<CreatePaymentReceivedPayload, "idempotency_key">
): CreatePaymentReceivedPayload {
  const previous = getArPaymentIntent(storage, userId, draft.invoice_id);
  if (previous) {
    const previousDraft: Partial<CreatePaymentReceivedPayload> = { ...previous };
    delete previousDraft.idempotency_key;
    if (JSON.stringify(previousDraft) !== JSON.stringify(draft))
      throw new Error("Confirm the previous payment request before changing its details.");
    return previous;
  }
  const payload = { ...draft, idempotency_key: idempotentSubmissionForPayload(null, draft).key };
  storage.setItem(storageKey(userId, draft.invoice_id), JSON.stringify(payload));
  return payload;
}

export function clearArPaymentIntent(
  storage: IntentStorage,
  userId: string,
  invoiceId: string,
  confirmedKey: string
): void {
  if (getArPaymentIntent(storage, userId, invoiceId)?.idempotency_key === confirmedKey)
    storage.removeItem(storageKey(userId, invoiceId));
}

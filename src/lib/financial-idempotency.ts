export type IdempotentSubmission = {
  fingerprint: string;
  key: string;
};

export function idempotentSubmissionForPayload(
  current: IdempotentSubmission | null,
  payload: unknown,
  createKey: () => string = () => crypto.randomUUID()
): IdempotentSubmission {
  const fingerprint = JSON.stringify(payload);
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, key: createKey() };
}

export function getPendingSubmission(
  storage: Pick<Storage, "getItem">,
  storageKey: string
): IdempotentSubmission | null {
  const value = storage.getItem(storageKey);
  if (!value) return null;
  const pending = JSON.parse(value) as IdempotentSubmission;
  if (
    !pending ||
    typeof pending.key !== "string" ||
    !pending.key ||
    typeof pending.fingerprint !== "string"
  )
    throw new Error(
      "Previous payment request is unavailable. Resolve it before recording another payment."
    );
  JSON.parse(pending.fingerprint);
  return pending;
}

export function beginPendingSubmission(
  storage: Pick<Storage, "getItem" | "setItem">,
  storageKey: string,
  payload: unknown
): IdempotentSubmission {
  const previous = getPendingSubmission(storage, storageKey);
  if (previous && previous.fingerprint !== JSON.stringify(payload))
    throw new Error("Confirm the previous payment request before changing its details.");
  const pending = idempotentSubmissionForPayload(previous, payload);
  storage.setItem(storageKey, JSON.stringify(pending));
  return pending;
}

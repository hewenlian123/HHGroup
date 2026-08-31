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

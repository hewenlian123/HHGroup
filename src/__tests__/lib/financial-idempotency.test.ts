import { describe, expect, it, vi } from "vitest";
import {
  beginPendingSubmission,
  idempotentSubmissionForPayload,
} from "@/lib/financial-idempotency";

describe("idempotentSubmissionForPayload", () => {
  it("reuses the same key for the same payload and rotates it when intent changes", () => {
    const createKey = vi.fn().mockReturnValueOnce("key-1").mockReturnValueOnce("key-2");

    const first = idempotentSubmissionForPayload(
      null,
      { invoiceId: "invoice-1", amount: 100 },
      createKey
    );
    const retry = idempotentSubmissionForPayload(
      first,
      { invoiceId: "invoice-1", amount: 100 },
      createKey
    );
    const changed = idempotentSubmissionForPayload(
      retry,
      { invoiceId: "invoice-1", amount: 101 },
      createKey
    );

    expect(retry).toBe(first);
    expect(changed).toEqual({
      fingerprint: JSON.stringify({ invoiceId: "invoice-1", amount: 101 }),
      key: "key-2",
    });
    expect(createKey).toHaveBeenCalledTimes(2);
  });
});

it("persists one unresolved intent across reloads and rejects changed payment details", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const first = beginPendingSubmission(storage, "user:bill", { amount: 40 });
  expect(beginPendingSubmission(storage, "user:bill", { amount: 40 })).toEqual(first);
  expect(() => beginPendingSubmission(storage, "user:bill", { amount: 41 })).toThrow(/previous/i);
  values.set("user:bill", "broken");
  expect(() => beginPendingSubmission(storage, "user:bill", { amount: 40 })).toThrow();
});

import { describe, expect, it, vi } from "vitest";
import { idempotentSubmissionForPayload } from "@/lib/financial-idempotency";

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

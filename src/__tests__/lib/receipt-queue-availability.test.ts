import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  fetchReceiptQueueRows,
  updateReceiptQueueRow,
  deleteReceiptQueueRow,
} from "@/lib/receipt-queue";

function clientFor(data: unknown) {
  return createClient("http://127.0.0.1:54321", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async () =>
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  });
}

describe("receipt queue availability", () => {
  it("distinguishes an unavailable read from an empty queue", async () => {
    await expect(fetchReceiptQueueRows(clientFor(null))).rejects.toThrow();
    await expect(fetchReceiptQueueRows(clientFor([]))).resolves.toEqual([]);
  });
  it("rejects an update that affected no accessible receipt", async () => {
    await expect(
      updateReceiptQueueRow(clientFor([]), "missing", { status: "pending" })
    ).rejects.toThrow();
    await expect(
      updateReceiptQueueRow(clientFor([{ id: "receipt" }]), "receipt", { status: "pending" })
    ).resolves.toBeUndefined();
  });
  it("rejects deletion when no receipt was deleted", async () => {
    await expect(deleteReceiptQueueRow(clientFor([]), "missing")).rejects.toThrow();
    await expect(
      deleteReceiptQueueRow(clientFor([{ id: "receipt" }]), "receipt")
    ).resolves.toBeUndefined();
  });
});

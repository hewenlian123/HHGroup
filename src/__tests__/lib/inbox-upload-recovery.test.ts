import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), ocr: vi.fn() }));
vi.mock("@/lib/expense-receipt-upload-browser", () => ({ uploadReceiptToStorage: mocks.upload }));
vi.mock("@/lib/expense-inbox-draft-ocr", () => ({ scheduleInboxDraftExpenseOcr: mocks.ocr }));
import { createInboxDraftFromReceiptFile } from "@/lib/expense-inbox-draft-upload-browser";

function database(
  existing: { id: string } | null,
  attachments: unknown[] = [],
  error: unknown = null
) {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        limit: async () => ({ data: attachments, error }),
        maybeSingle: async () => ({ data: existing, error }),
      };
      expect(["expenses", "attachments"]).toContain(table);
      return query;
    },
  } as unknown as Parameters<typeof createInboxDraftFromReceiptFile>[0];
}
const file = new File(["%PDF-1.4 receipt recovery"], "receipt.pdf", { type: "application/pdf" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.upload.mockResolvedValue({
    attachmentPath: "quick-expense/inbox-fixture.pdf",
    storedFileName: "receipt.pdf",
    storedMimeType: "application/pdf",
    storedSize: file.size,
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("canonical receipt upload recovery", () => {
  it("uses the receipt reference as create identity and a stable attachment ID across retry", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        requests.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true, expense: { id: "expense-1" } }));
      })
    );
    await createInboxDraftFromReceiptFile(database(null), file);
    await createInboxDraftFromReceiptFile(database({ id: "expense-1" }), file);
    expect(requests).toHaveLength(2);
    expect(requests[0].idempotencyKey).toBe(requests[0].referenceNo);
    expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey);
    expect((requests[1].attachments as { id: string }[])[0].id).toBe(
      (requests[0].attachments as { id: string }[])[0].id
    );
    expect(mocks.upload.mock.calls[0][2]).toBe(requests[0].referenceNo);
  });
  it("a committed expense without attachment is recovered, not accepted as a complete duplicate", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, expense: { id: "expense-1" } }))
    );
    vi.stubGlobal("fetch", fetch);
    const result = await createInboxDraftFromReceiptFile(database({ id: "expense-1" }), file);
    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, expenseId: "expense-1", duplicate: false });
  });
  it("a verified attached expense is a duplicate without another upload", async () => {
    const result = await createInboxDraftFromReceiptFile(
      database({ id: "expense-1" }, [{ id: "attachment-1" }]),
      file
    );
    expect(result).toMatchObject({ ok: true, duplicate: true });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("failed preflight does not create an untracked Storage object", async () => {
    await expect(
      createInboxDraftFromReceiptFile(database(null, [], { message: "permission denied" }), file)
    ).rejects.toThrow(/unavailable|permission denied/i);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

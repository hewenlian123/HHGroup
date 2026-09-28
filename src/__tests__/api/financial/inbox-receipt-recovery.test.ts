import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  client: null as unknown,
  storage: null as unknown,
  create: vi.fn(),
  attach: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: async () => ({ ok: true }),
  requireSupabaseOwnerOrAdminWithClient: async () => ({ ok: true, client: state.client }),
}));
vi.mock("@/lib/auth-request-security", () => ({
  validateSameOriginMutation: () => ({ ok: true }),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: () => state.storage,
  getServerSupabaseInternalNoStore: () => state.client,
  SUPABASE_MISSING_SERVER_ENV_MESSAGE: "Unavailable",
}));
vi.mock("@/lib/expenses-db", () => ({
  createQuickExpenseWithClient: state.create,
  addExpenseAttachmentWithClient: state.attach,
  getExpenseById: state.read,
}));
import { POST as save } from "@/app/api/financial/expenses/quick-expense/route";
import { POST as upload } from "@/app/api/quick-expense/upload-attachment/route";
const reference = `INBOX-UP-${"a".repeat(64)}`;
const attachment = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  fileName: "receipt.pdf",
  mimeType: "application/pdf",
  size: 12,
  url: `quick-expense/inbox-${"a".repeat(64)}.pdf`,
};
const saveRequest = () =>
  new Request("http://127.0.0.1/api/financial/expenses/quick-expense", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referenceNo: reference,
      idempotencyKey: reference,
      sourceType: "receipt_upload",
      initialStatus: "draft",
      totalAmount: 0.01,
      attachments: [attachment],
    }),
  });
beforeEach(() => vi.resetAllMocks());
describe("receipt expense recovery boundary", () => {
  it("repairs metadata on the already committed expense without creating or overwriting it", async () => {
    let existing: { id: string; source_type: string } | null = null;
    const expense = { id: "expense-1", vendorName: "Reviewed original", status: "draft" };
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: existing, error: null }),
    };
    state.client = { from: () => query };
    state.create.mockImplementation(async () => {
      existing = { id: expense.id, source_type: "receipt_upload" };
      return expense;
    });
    state.read.mockResolvedValue(expense);
    state.attach
      .mockRejectedValueOnce(new Error("metadata unavailable"))
      .mockResolvedValue(expense);
    expect((await save(saveRequest())).status).toBe(500);
    expect(existing).not.toBeNull();
    expect((await save(saveRequest())).status).toBe(200);
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.attach.mock.calls.map((call) => call[1])).toEqual([expense.id, expense.id]);
    expect(state.attach.mock.calls[1][2]).toMatchObject(attachment);
    expect(state.read).toHaveBeenCalledWith(expense.id, state.client);
  });
  it("does not continue through an unavailable recovery lookup", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: null, error: { message: "permission denied" } }),
    };
    state.client = { from: () => query };
    expect((await save(saveRequest())).status).toBe(500);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.attach).not.toHaveBeenCalled();
  });
});
describe("immutable receipt upload retries", () => {
  it("reuses exact bytes after a lost acknowledgement and never overwrites or removes the object", async () => {
    const objects = new Map<string, File>();
    const remove = vi.fn();
    const bucket = {
      upload: vi.fn(async (path: string, file: File, options: { upsert: boolean }) => {
        expect(options.upsert).toBe(false);
        if (objects.has(path)) return { error: { message: "already exists" } };
        objects.set(path, file);
        return { error: { message: "acknowledgement lost" } };
      }),
      download: vi.fn(async (path: string) => ({ data: objects.get(path), error: null })),
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "http://127.0.0.1/fixture" },
        error: null,
      })),
      remove,
    };
    state.storage = { storage: { from: () => bucket } };
    const request = (content: string) => {
      const form = new FormData();
      form.set("file", new File([content], "receipt.pdf", { type: "application/pdf" }));
      form.set("receipt_reference", reference);
      return new Request("http://127.0.0.1/api/quick-expense/upload-attachment", {
        method: "POST",
        body: form,
      });
    };
    const first = await upload(request("original bytes"));
    const retry = await upload(request("original bytes"));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect((await first.json()).path).toBe((await retry.json()).path);
    expect(objects.size).toBe(1);
    expect((await upload(request("different bytes"))).status).toBe(409);
    expect(await [...objects.values()][0].text()).toBe("original bytes");
    expect(remove).not.toHaveBeenCalled();
  });
  it("rejects invalid identity before writing a Storage object", async () => {
    const write = vi.fn();
    state.storage = { storage: { from: () => ({ upload: write }) } };
    const form = new FormData();
    form.set("file", new File(["receipt"], "receipt.pdf", { type: "application/pdf" }));
    form.set("receipt_reference", "invalid");
    expect(
      (
        await upload(
          new Request("http://127.0.0.1/api/quick-expense/upload-attachment", {
            method: "POST",
            body: form,
          })
        )
      ).status
    ).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
});

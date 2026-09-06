import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addExpenseAttachmentWithClient } from "@/lib/expenses-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptQueueRow } from "@/lib/receipt-queue";

const mocks = vi.hoisted(() => ({
  createQuickExpense: vi.fn(),
  addExpenseAttachment: vi.fn(),
  updateExpenseForReview: vi.fn(),
  deleteReceiptQueueRow: vi.fn(),
  notifyReceiptQueueChanged: vi.fn(),
}));

vi.mock("@/lib/data", () => mocks);
vi.mock("@/lib/receipt-queue", () => mocks);

import { finalizeReceiptQueueExpense } from "@/lib/receipt-queue-expense";

const client = {} as SupabaseClient;
const row: ReceiptQueueRow = {
  id: "queue-1",
  status: "pending",
  storage_path: null,
  receipt_public_url: null,
  file_name: "receipt.jpg",
  mime_type: "image/jpeg",
  size_bytes: 100,
  vendor_name: "Supplier",
  amount: "25.50",
  expense_date: "2026-09-05",
  project_id: "project-1",
  category: "Materials",
  source_type: "receipt_upload",
  worker_id: "worker-1",
  payment_account_id: "account-1",
  ocr_source: "manual",
  error_message: null,
  created_at: "2026-09-05T12:00:00Z",
  updated_at: "2026-09-05T12:00:00Z",
};

describe("receipt finalization availability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createQuickExpense.mockResolvedValue({ id: "expense-1" });
    mocks.updateExpenseForReview.mockResolvedValue({ id: "expense-1" });
  });

  it.each(["confirm", "bulk"] as const)(
    "retains the queue when the worker link fails during %s and retries the same expense intent",
    async (mode) => {
      mocks.updateExpenseForReview.mockResolvedValueOnce(null);

      await expect(finalizeReceiptQueueExpense(client, row, mode)).rejects.toThrow();
      expect(mocks.deleteReceiptQueueRow).not.toHaveBeenCalled();
      expect(mocks.notifyReceiptQueueChanged).not.toHaveBeenCalled();

      await finalizeReceiptQueueExpense(client, row, mode);

      expect(mocks.createQuickExpense).toHaveBeenCalledTimes(2);
      for (const [payload] of mocks.createQuickExpense.mock.calls) {
        expect(payload).toMatchObject({
          idempotencyKey: "receipt-queue:queue-1",
          date: "2026-09-05",
          vendorName: "Supplier",
          totalAmount: 25.5,
          sourceType: "reimbursement",
          category: "Materials",
          projectId: "project-1",
          paymentAccountId: "account-1",
        });
      }
      expect(mocks.updateExpenseForReview).toHaveBeenLastCalledWith("expense-1", {
        workerId: "worker-1",
      });
      expect(mocks.deleteReceiptQueueRow).toHaveBeenCalledExactlyOnceWith(client, "queue-1");
      expect(mocks.notifyReceiptQueueChanged).toHaveBeenCalledTimes(1);
    }
  );
});

function attachmentClient() {
  const attachments = new Map<string, Record<string, unknown>>();
  let failNextExpenseRead = false;
  const client = createClient("http://127.0.0.1:54321", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1);
        const reply = (data: unknown, status = 200) =>
          new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        if (table === "attachments") {
          if (init?.method === "POST") {
            const row = JSON.parse(String(init.body)) as Record<string, unknown>;
            const id = String(row.id ?? crypto.randomUUID());
            if (attachments.has(id))
              return reply({ code: "23505", message: "duplicate attachment id" }, 409);
            attachments.set(id, { ...row, id });
            return reply(null);
          }
          const id = url.searchParams.get("id")?.replace(/^eq\./, "");
          if (id) return reply(attachments.get(id) ?? null);
          return reply([...attachments.values()]);
        }
        if (table === "expenses") {
          if (failNextExpenseRead) {
            failNextExpenseRead = false;
            return reply(
              { code: "42501", message: "injected read failure after attachment commit" },
              403
            );
          }
          return reply({
            id: "expense-1",
            expense_date: "2026-09-05",
            total: 25.5,
            status: "pending",
          });
        }
        return reply(table === "bank_transactions" ? null : []);
      },
    },
  });
  return {
    client,
    attachments,
    failReadAfterCommit: () => {
      failNextExpenseRead = true;
    },
  };
}

describe("receipt metadata retry integrity", () => {
  it.each(["worker link", "expense reload"])(
    "keeps exactly one attachment after %s fails following metadata commit",
    async (failure) => {
      const fixture = attachmentClient();
      mocks.createQuickExpense.mockResolvedValue({ id: "expense-1" });
      mocks.updateExpenseForReview.mockResolvedValue({ id: "expense-1" });
      mocks.addExpenseAttachment.mockImplementation((expenseId, attachment) =>
        addExpenseAttachmentWithClient(fixture.client, expenseId, attachment)
      );
      mocks.deleteReceiptQueueRow.mockReset();
      if (failure === "worker link") mocks.updateExpenseForReview.mockResolvedValueOnce(null);
      else fixture.failReadAfterCommit();
      const uploadedRow = {
        ...row,
        id: "71717171-7171-4171-8171-717171717111",
        storage_path: "receipt-queue/source.jpg",
      };
      await expect(
        finalizeReceiptQueueExpense(fixture.client, uploadedRow, "confirm")
      ).rejects.toThrow();
      expect(fixture.attachments.size).toBe(1);
      expect(mocks.deleteReceiptQueueRow).not.toHaveBeenCalled();
      await finalizeReceiptQueueExpense(fixture.client, uploadedRow, "confirm");
      expect(fixture.attachments.size).toBe(1);
      expect([...fixture.attachments.values()][0]).toMatchObject({
        entity_id: "expense-1",
        file_path: uploadedRow.storage_path,
      });
      expect(mocks.deleteReceiptQueueRow).toHaveBeenCalledExactlyOnceWith(
        fixture.client,
        uploadedRow.id
      );
    }
  );

  it("rejects a reused attachment identity for a different expense or file", async () => {
    const fixture = attachmentClient();
    const attachment = {
      id: "71717171-7171-4171-8171-717171717111",
      fileName: "receipt.jpg",
      mimeType: "image/jpeg",
      size: 100,
      url: "receipt-queue/source.jpg",
      createdAt: "2026-09-05",
    };
    await addExpenseAttachmentWithClient(fixture.client, "expense-1", attachment);
    await expect(
      addExpenseAttachmentWithClient(fixture.client, "other-expense", attachment)
    ).rejects.toThrow();
    await expect(
      addExpenseAttachmentWithClient(fixture.client, "expense-1", {
        ...attachment,
        url: "other-file.jpg",
      })
    ).rejects.toThrow();
    expect(fixture.attachments.size).toBe(1);
    expect([...fixture.attachments.values()][0]).toMatchObject({
      entity_id: "expense-1",
      file_path: attachment.url,
    });
  });
});

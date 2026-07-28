import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  adminFromMock,
  createSignedUrlMock,
  removeMock,
  requireStrictAuthMock,
  resolveStoredReceiptReferenceMock,
  rpcMock,
  uploadMock,
} = vi.hoisted(() => ({
  adminFromMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
  removeMock: vi.fn(),
  requireStrictAuthMock: vi.fn(),
  resolveStoredReceiptReferenceMock: vi.fn(),
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: requireStrictAuthMock,
}));

vi.mock("@/lib/expense-receipt-server", () => ({
  ExpenseReceiptManifestError: class ExpenseReceiptManifestError extends Error {
    constructor(public readonly code: string) {
      super("Receipt preview is unavailable.");
    }
  },
  resolveStoredReceiptReference: resolveStoredReceiptReferenceMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: () => ({
    from: adminFromMock,
    rpc: rpcMock,
    storage: {
      from: () => ({
        createSignedUrl: createSignedUrlMock,
        remove: removeMock,
        upload: uploadMock,
      }),
    },
  }),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAudit: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/financial/expenses/[id]/receipts/[receiptId]/replace/route";

const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EXPENSE_ID = "99999999-9999-4999-8999-999999999999";
const RECEIPT_ID = `attachment.22222222-2222-4222-8222-222222222222`;
const REFERENCE_VERSION = "a".repeat(64);
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";

function replaceRequest(
  overrides: {
    expenseId?: string;
    origin?: string;
    receiptId?: string;
    referenceVersion?: string;
  } = {}
) {
  const expenseId = overrides.expenseId ?? EXPENSE_ID;
  const receiptId = overrides.receiptId ?? RECEIPT_ID;
  const data = new FormData();
  data.set("file", new File(["new-receipt"], "replacement.jpg", { type: "image/jpeg" }));
  data.set("referenceVersion", overrides.referenceVersion ?? REFERENCE_VERSION);
  data.set("idempotencyKey", OPERATION_ID);
  return new NextRequest(
    `http://localhost:3104/api/financial/expenses/${expenseId}/receipts/${receiptId}/replace`,
    {
      method: "POST",
      headers: {
        host: "localhost:3104",
        origin: overrides.origin ?? "http://localhost:3104",
        "sec-fetch-site": "same-origin",
      },
      body: data,
    }
  );
}

async function callRoute(
  request = replaceRequest(),
  expenseId = EXPENSE_ID,
  receiptId = RECEIPT_ID
) {
  return POST(request, { params: { id: expenseId, receiptId } });
}

describe("transaction-safe expense receipt Replace route", () => {
  beforeEach(() => {
    const existingOperationQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn(),
    };
    existingOperationQuery.select.mockReturnValue(existingOperationQuery);
    existingOperationQuery.eq.mockReturnValue(existingOperationQuery);
    adminFromMock.mockReset().mockReturnValue(existingOperationQuery);
    requireStrictAuthMock.mockReset().mockResolvedValue({
      ok: true,
      context: {
        role: "owner",
        user: { id: "owner-id", app_metadata: { role: "owner" } },
      },
    });
    resolveStoredReceiptReferenceMock.mockReset().mockResolvedValue({
      expenseId: EXPENSE_ID,
      fileName: "old.jpg",
      location: { bucket: "expense-attachments", path: "old/receipt.jpg" },
      mimeType: "image/jpeg",
      rawReference: "old/receipt.jpg",
      referenceVersion: REFERENCE_VERSION,
      sourceId: "22222222-2222-4222-8222-222222222222",
      sourceKind: "attachment",
    });
    uploadMock.mockReset().mockResolvedValue({ data: { path: "new-path" }, error: null });
    rpcMock.mockReset().mockResolvedValue({
      data: [{ changed: true, idempotent: false }],
      error: null,
    });
    removeMock.mockReset().mockResolvedValue({ data: [], error: null });
    createSignedUrlMock.mockReset().mockResolvedValue({
      data: {
        signedUrl:
          "http://127.0.0.1:54321/storage/v1/object/sign/expense-attachments/new.jpg?token=temporary",
      },
      error: null,
    });
  });

  it("denies anonymous Replace before reading or writing Storage", async () => {
    requireStrictAuthMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "Authentication required." },
        { status: 401 }
      ),
    });

    const response = await callRoute();

    expect(response.status).toBe(401);
    expect(resolveStoredReceiptReferenceMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site multipart mutation before touching Storage", async () => {
    const response = await callRoute(replaceRequest({ origin: "https://evil.test" }));

    expect(response.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads immutably on the server, commits one path-only value, and returns a signed preview", async () => {
    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^replacements/expenses/${EXPENSE_ID}/${OPERATION_ID}\\.jpg$`)
      ),
      expect.any(File),
      expect.objectContaining({ contentType: "image/jpeg", upsert: false })
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "replace_expense_receipt_reference",
      expect.objectContaining({
        p_actor_user_id: "owner-id",
        p_expense_id: EXPENSE_ID,
        p_new_reference: expect.stringMatching(/^replacements\/expenses\//),
        p_operation_id: OPERATION_ID,
        p_source_kind: "attachment",
      })
    );
    const rpcArguments = rpcMock.mock.calls[0]?.[1];
    expect(rpcArguments.p_new_reference).not.toMatch(/^https?:|token=/);
    expect(removeMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      ok: true,
      item: {
        id: RECEIPT_ID,
        referenceVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
        signedUrl: expect.stringContaining("token=temporary"),
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/old\/receipt|rawReference|old_bucket|old_path/);
  });

  it("rejects a stale reference version before uploading", async () => {
    const response = await callRoute(replaceRequest({ referenceVersion: "b".repeat(64) }));

    expect(response.status).toBe(409);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("keeps the old reference untouched when upload fails", async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: "storage failed at old/path" } });

    const response = await callRoute();

    expect(response.status).toBe(502);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toMatch(/storage failed|old\/path/);
  });

  it("deletes only the newly uploaded operation object when the transaction fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "database failure" } });

    const response = await callRoute();

    expect(response.status).toBe(409);
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith([
      `replacements/expenses/${EXPENSE_ID}/${OPERATION_ID}.jpg`,
    ]);
    expect(removeMock).not.toHaveBeenCalledWith(["old/receipt.jpg"]);
  });

  it("compensates an optimistic conflict and never changes an unrelated expense", async () => {
    rpcMock.mockResolvedValue({
      data: [{ changed: false, idempotent: false }],
      error: null,
    });

    const response = await callRoute();

    expect(response.status).toBe(409);
    expect(removeMock).toHaveBeenCalledWith([
      `replacements/expenses/${EXPENSE_ID}/${OPERATION_ID}.jpg`,
    ]);
    expect(rpcMock.mock.calls[0]?.[1]).toMatchObject({
      p_expense_id: EXPENSE_ID,
      p_source_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(JSON.stringify(rpcMock.mock.calls[0]?.[1])).not.toContain(OTHER_EXPENSE_ID);
  });

  it("cannot use a receipt ID from another expense", async () => {
    resolveStoredReceiptReferenceMock.mockRejectedValue(new Error("not found"));

    const response = await callRoute();

    expect(response.status).toBe(404);
    expect(resolveStoredReceiptReferenceMock).toHaveBeenCalledWith({
      expenseId: EXPENSE_ID,
      receiptId: RECEIPT_ID,
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

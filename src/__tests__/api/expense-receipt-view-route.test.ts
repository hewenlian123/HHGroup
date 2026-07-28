import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { loadExpenseReceiptManifestMock, requireStrictAuthMock } = vi.hoisted(() => ({
  loadExpenseReceiptManifestMock: vi.fn(),
  requireStrictAuthMock: vi.fn(),
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
  loadExpenseReceiptManifest: loadExpenseReceiptManifestMock,
}));

import { GET } from "@/app/api/financial/expenses/[id]/receipts/route";

const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";

function request() {
  return new NextRequest(`http://localhost:3104/api/financial/expenses/${EXPENSE_ID}/receipts`);
}

describe("authenticated expense receipt view route", () => {
  beforeEach(() => {
    requireStrictAuthMock.mockReset().mockResolvedValue({
      ok: true,
      context: {
        role: "owner",
        user: { id: "owner-id", app_metadata: { role: "owner" } },
      },
    });
    loadExpenseReceiptManifestMock.mockReset().mockResolvedValue({
      expenseId: EXPENSE_ID,
      expiresAt: "2026-07-28T10:05:00.000Z",
      items: [
        {
          id: `expense_receipt_url.${EXPENSE_ID}`,
          fileName: "receipt.jpg",
          mimeType: "image/jpeg",
          referenceVersion: "a".repeat(64),
          signedUrl:
            "http://127.0.0.1:54321/storage/v1/object/sign/expense-attachments/receipt.jpg?token=temporary",
        },
      ],
    });
  });

  it("denies anonymous access before loading or signing references", async () => {
    requireStrictAuthMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "Authentication required." },
        { status: 401 }
      ),
    });

    const response = await GET(request(), { params: { id: EXPENSE_ID } });

    expect(response.status).toBe(401);
    expect(loadExpenseReceiptManifestMock).not.toHaveBeenCalled();
  });

  it("returns temporary signed items and safe reference versions for an owner", async () => {
    const response = await GET(request(), { params: { id: EXPENSE_ID } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loadExpenseReceiptManifestMock).toHaveBeenCalledWith(EXPENSE_ID);
    expect(body).toMatchObject({
      ok: true,
      expenseId: EXPENSE_ID,
      items: [
        {
          id: `expense_receipt_url.${EXPENSE_ID}`,
          referenceVersion: "a".repeat(64),
          signedUrl: expect.stringContaining("token=temporary"),
        },
      ],
    });
  });

  it("redacts raw paths, bucket names, tokens, and storage errors from failures", async () => {
    loadExpenseReceiptManifestMock.mockRejectedValue(
      new Error(
        "expense-attachments/private/owner/receipt.jpg?token=secret storage object not found"
      )
    );

    const response = await GET(request(), { params: { id: EXPENSE_ID } });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(404);
    expect(serialized).toContain("Receipt preview is unavailable.");
    expect(serialized).not.toMatch(/expense-attachments|private\/owner|token=|storage object/i);
  });

  it("rejects malformed expense IDs without querying storage", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3104/api/financial/expenses/not-a-uuid/receipts"),
      { params: { id: "not-a-uuid" } }
    );

    expect(response.status).toBe(400);
    expect(loadExpenseReceiptManifestMock).not.toHaveBeenCalled();
  });
});

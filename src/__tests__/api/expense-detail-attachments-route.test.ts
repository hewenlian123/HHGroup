import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { attachmentQueryMock, createSignedUrlMock, requireAuthenticatedUserMock, storageFromMock } =
  vi.hoisted(() => ({
    attachmentQueryMock: {
      eq: vi.fn(),
      in: vi.fn(),
      select: vi.fn(),
    },
    createSignedUrlMock: vi.fn(),
    requireAuthenticatedUserMock: vi.fn(),
    storageFromMock: vi.fn(),
  }));

vi.mock("@/lib/auth-boundary", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  SUPABASE_MISSING_SERVER_ENV_MESSAGE: "Supabase server configuration is unavailable.",
  getServerSupabaseInternalNoStore: () => ({
    from: () => attachmentQueryMock,
    storage: {
      from: storageFromMock,
    },
  }),
}));

import { POST } from "@/app/api/expenses/[id]/attachments/route";

const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";

function attachmentRow(filePath: string) {
  return {
    id: ATTACHMENT_ID,
    created_at: "2026-07-29T08:00:00.000Z",
    entity_type: "expense",
    entity_id: EXPENSE_ID,
    file_name: "Historical receipt.jpg",
    file_path: filePath,
    mime_type: "image/jpeg",
    size_bytes: 1234,
  };
}

function request() {
  return new NextRequest(`http://localhost:3104/api/expenses/${EXPENSE_ID}/attachments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ attachmentIds: [ATTACHMENT_ID] }),
  });
}

describe("expense detail historical attachment signing", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset().mockResolvedValue({ ok: true });
    attachmentQueryMock.select.mockReset().mockReturnValue(attachmentQueryMock);
    attachmentQueryMock.eq.mockReset().mockReturnValue(attachmentQueryMock);
    attachmentQueryMock.in
      .mockReset()
      .mockResolvedValue({ data: [attachmentRow("quick-expense/historical.jpg")], error: null });
    createSignedUrlMock.mockReset().mockResolvedValue({
      data: {
        signedUrl:
          "http://127.0.0.1:54321/storage/v1/object/sign/expense-attachments/quick-expense/historical.jpg?token=temporary",
      },
      error: null,
    });
    storageFromMock.mockReset().mockReturnValue({
      createSignedUrl: createSignedUrlMock,
    });
  });

  it("signs a historical path from its canonical private receipt bucket", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: EXPENSE_ID }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(storageFromMock).toHaveBeenCalledWith("expense-attachments");
    expect(createSignedUrlMock).toHaveBeenCalledWith("quick-expense/historical.jpg", 60);
    expect(body).toMatchObject({
      ok: true,
      files: [
        {
          id: ATTACHMENT_ID,
          fileName: "Historical receipt.jpg",
          mimeType: "image/jpeg",
          url: expect.stringContaining("token=temporary"),
        },
      ],
    });
  });

  it("returns a safe unavailable state instead of HTTP 500 when the object is missing", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    createSignedUrlMock.mockResolvedValue({
      data: null,
      error: {
        message: "Object not found: expense-attachments/quick-expense/historical.jpg?token=secret",
      },
    });

    const response = await POST(request(), { params: Promise.resolve({ id: EXPENSE_ID }) });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(404);
    expect(serialized).toContain("Original receipt file unavailable.");
    expect(serialized).not.toMatch(/expense-attachments|quick-expense|token=|object not found/i);
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(
      /expense-attachments|quick-expense|token=|object not found/i
    );
    warning.mockRestore();
  });

  it("rejects an external token-bearing Storage-shaped URL without signing it", async () => {
    attachmentQueryMock.in.mockResolvedValue({
      data: [
        attachmentRow(
          "https://evil.test/storage/v1/object/sign/expense-attachments/private/receipt.jpg?token=secret"
        ),
      ],
      error: null,
    });

    const response = await POST(request(), { params: Promise.resolve({ id: EXPENSE_ID }) });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(404);
    expect(storageFromMock).not.toHaveBeenCalled();
    expect(serialized).not.toMatch(/evil\.test|token=|private\/receipt/i);
  });
});

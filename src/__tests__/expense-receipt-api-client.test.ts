import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExpenseReceiptApiError,
  fetchExpenseReceiptManifest,
  replaceExpenseReceipt,
} from "@/lib/expense-receipt-api-client";

const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";
const ITEM = {
  id: "attachment.22222222-2222-4222-8222-222222222222",
  fileName: "receipt.jpg",
  mimeType: "image/jpeg",
  referenceVersion: "a".repeat(64),
  signedUrl: "https://storage.test/signed?token=temporary",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authenticated expense receipt API client", () => {
  it("loads the no-store same-origin manifest instead of signing in the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          expenseId: EXPENSE_ID,
          expiresAt: "2026-07-28T11:05:00.000Z",
          items: [ITEM],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const manifest = await fetchExpenseReceiptManifest(EXPENSE_ID);

    expect(manifest.items).toEqual([ITEM]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(
      new RegExp(`^/api/financial/expenses/${EXPENSE_ID}/receipts\\?request=[0-9a-f-]{36}$`)
    );
    expect(init).toEqual(
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" })
    );
  });

  it("sends only safe receipt identity/version plus the file to Replace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, item: ITEM }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["receipt"], "replacement.jpg", { type: "image/jpeg" });

    await replaceExpenseReceipt({
      expenseId: EXPENSE_ID,
      file,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      item: ITEM,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `/api/financial/expenses/${EXPENSE_ID}/receipts/${encodeURIComponent(ITEM.id)}/replace`
    );
    const form = init.body as FormData;
    expect(form.get("file")).toBe(file);
    expect(form.get("referenceVersion")).toBe(ITEM.referenceVersion);
    expect(form.get("idempotencyKey")).toBe("33333333-3333-4333-8333-333333333333");
    expect(JSON.stringify([...form.keys()])).not.toMatch(/path|bucket|token|signed/i);
  });

  it("maps raw server failures to generic client errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            message: "expense-attachments/private/receipt.jpg?token=secret",
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(fetchExpenseReceiptManifest(EXPENSE_ID)).rejects.toEqual(
      expect.objectContaining<Partial<ExpenseReceiptApiError>>({
        message: "Receipt preview is unavailable.",
        status: 500,
      })
    );
  });

  it("contains no expense browser Storage upload or getPublicUrl fallback", () => {
    const files = [
      "src/app/financial/expenses/expenses-client.tsx",
      "src/app/financial/expenses/expense-inbox-preview-modal.tsx",
      "src/app/financial/expenses/edit-expense-modal.tsx",
      "src/app/financial/expenses/expense-edit-attachments-section.tsx",
      "src/app/financial/expenses/new/page.tsx",
      "src/lib/expense-receipt-upload-browser.ts",
      "src/lib/expense-inbox-draft-upload-browser.ts",
    ];
    const source = files
      .map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8"))
      .join("\n");
    expect(source).not.toContain("getPublicUrl(");
    expect(source).not.toMatch(/storage\s*\.\s*from\(\s*["']receipts["']\s*\)/);
    expect(source).not.toMatch(/storage\s*\.\s*from\(\s*["']expense-attachments["']\s*\)/);
  });
});

import { expect, test } from "@playwright/test";

import { addE2EAssistantSession, deleteE2EAssistant, loginAsE2EOwner } from "./e2e-auth-owner";

const PROTECTED_GETS = [
  "/api/expenses",
  "/api/financial/bank-transactions",
  "/api/labor/worker-balances",
  "/api/settings/security/account",
  "/api/upload-receipt/options",
  "/api/system-health",
] as const;

test.describe("authenticated API authorization matrix", () => {
  test.describe.configure({ timeout: 120_000 });

  test("returns 401 for representative anonymous financial, labor, upload, and system APIs", async ({
    request,
  }) => {
    for (const path of PROTECTED_GETS) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
    }
    const ocr = await request.post("/api/ocr-receipt", {
      multipart: {},
    });
    expect(ocr.status()).toBe(401);
  });

  test("allows an authenticated owner through the shared API boundary", async ({ page }) => {
    await loginAsE2EOwner(page);
    for (const path of PROTECTED_GETS) {
      const response = await page.context().request.get(path);
      expect(response.status(), path).not.toBe(401);
      expect(response.status(), path).not.toBe(403);
      expect(response.status(), path).toBeLessThan(500);
    }
  });

  test("rejects a valid Supabase assistant session with 403", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    try {
      await addE2EAssistantSession(context, baseURL || "http://localhost:3104");
      const response = await context.request.get("/api/expenses");
      expect(response.status()).toBe(403);
    } finally {
      await context.close();
      await deleteE2EAssistant();
    }
  });

  test("rejects an authenticated cross-site security mutation", async ({ page }) => {
    await loginAsE2EOwner(page);
    const response = await page.context().request.post("/api/settings/security/sessions", {
      data: { scope: "others" },
      headers: {
        origin: "https://evil.test",
        "sec-fetch-site": "cross-site",
      },
    });

    expect(response.status()).toBe(403);
  });
});

import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { getE2EOwnerCredentials, loginAsE2EOwner } from "./e2e-auth-owner";

async function sameOriginJson(
  page: Page,
  url: string,
  method: "POST" | "DELETE",
  body?: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ({ requestBody, requestMethod, requestUrl }) => {
      const response = await fetch(requestUrl, {
        method: requestMethod,
        credentials: "same-origin",
        headers: requestBody ? { "Content-Type": "application/json" } : undefined,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
      };
    },
    { requestBody: body, requestMethod: method, requestUrl: url }
  );
}

test.describe.serial("authenticated owner security lifecycle", () => {
  test.describe.configure({ timeout: 120_000 });

  test("PIN enable, change, lockout, password fallback, and disable remain session-bound", async ({
    browser,
    page,
  }) => {
    const credentials = await getE2EOwnerCredentials();
    await loginAsE2EOwner(page, "/settings/security");

    const enable = await sameOriginJson(page, "/api/settings/security/pin", "POST", {
      confirmPin: "739251",
      currentPassword: credentials.password,
      pin: "739251",
    });
    expect(enable.status).toBe(200);
    expect(enable.body).toMatchObject({ enabled: true, ok: true });

    const state = await page.request.get("/api/settings/security/pin");
    expect(state.status()).toBe(200);
    expect(await state.json()).toMatchObject({ enabled: true, ok: true });

    const change = await sameOriginJson(page, "/api/settings/security/pin", "POST", {
      confirmPin: "582947",
      currentPassword: credentials.password,
      pin: "582947",
    });
    expect(change.status).toBe(200);

    const lock = await sameOriginJson(page, "/api/auth/lock", "POST");
    expect(lock.status).toBe(200);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const wrongPin = await sameOriginJson(page, "/api/auth/unlock", "POST", {
        pin: "916384",
      });
      expect(wrongPin.status).toBe(attempt < 5 ? 401 : 429);
    }

    const passwordContext = await browser.newContext();
    const passwordPage = await passwordContext.newPage();
    await loginAsE2EOwner(passwordPage, "/settings/security");
    await expect(passwordPage.getByRole("heading", { name: "Security" })).toBeVisible();

    const disable = await sameOriginJson(passwordPage, "/api/settings/security/pin", "DELETE", {
      currentPassword: credentials.password,
    });
    expect(disable.status).toBe(200);
    expect(disable.body).toMatchObject({ enabled: false, ok: true });
    await passwordContext.close();

    const anonymousContext = await browser.newContext();
    const anonymousState = await anonymousContext.request.get("/api/settings/security/pin");
    expect(anonymousState.status()).toBe(401);
    await anonymousContext.close();
  });

  test("password change rejects the old password and accepts the new password", async ({
    browser,
    page,
  }) => {
    const credentials = await getE2EOwnerCredentials();
    const rotatedPassword = `Hh!${randomBytes(18).toString("hex")}aA1`;
    try {
      await loginAsE2EOwner(page, "/settings/security");
      const changed = await sameOriginJson(page, "/api/settings/security/password", "POST", {
        confirmPassword: rotatedPassword,
        currentPassword: credentials.password,
        newPassword: rotatedPassword,
      });
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({ ok: true });

      const freshContext = await browser.newContext();
      const loginPage = await freshContext.newPage();
      await loginPage.goto("/login?redirect=%2Fdashboard", { waitUntil: "domcontentloaded" });
      await loginPage.getByLabel("Email").fill(credentials.email);
      await loginPage.getByLabel("Password", { exact: true }).fill(credentials.password);
      await loginPage.getByRole("button", { name: "Sign in" }).click();
      await expect(
        loginPage.getByRole("alert").filter({ hasText: "Unable to sign in" })
      ).toContainText("Unable to sign in");

      await loginPage.getByLabel("Password", { exact: true }).fill(rotatedPassword);
      await loginPage.getByRole("button", { name: "Sign in" }).click();
      await expect(loginPage).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
      await freshContext.close();
    } finally {
      await getE2EOwnerCredentials();
    }
  });
});

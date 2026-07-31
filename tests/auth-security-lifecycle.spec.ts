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
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();

    const disableButton = page.getByRole("button", { name: "Disable PIN", exact: true });
    const initialState = await page.request.get("/api/settings/security/pin");
    expect(initialState.status()).toBe(200);
    if ((await initialState.json()).enabled === true) {
      await expect(disableButton).toBeVisible();
      await page.getByLabel("Account password").fill(credentials.password);
      const disableResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          response.url().endsWith("/api/settings/security/pin")
      );
      await disableButton.click();
      const disableResponse = await disableResponsePromise;
      expect(disableResponse.status()).toBe(200);
      await expect(page.getByText("Quick Unlock disabled.", { exact: true })).toBeVisible();
    }

    await page.getByLabel("Account password").fill(credentials.password);
    await page.getByLabel("New 6-digit PIN").fill("739251");
    await page.getByLabel("Confirm 6-digit PIN").fill("739251");
    const enableResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/settings/security/pin")
    );
    await page.getByRole("button", { name: "Enable PIN", exact: true }).click();
    const enableResponse = await enableResponsePromise;
    const authorization = enableResponse.request().headers().authorization;
    expect(authorization).toMatch(/^Bearer\s+\S+$/);
    const bearerPayload = JSON.parse(
      Buffer.from(authorization.slice("Bearer ".length).split(".")[1], "base64url").toString("utf8")
    ) as { session_id?: unknown };
    expect(typeof bearerPayload.session_id).toBe("string");
    expect(enableResponse.status()).toBe(200);
    await expect(page.getByText("Quick Unlock enabled.", { exact: true })).toBeVisible();

    const accessToken = authorization.slice("Bearer ".length);
    await page.context().clearCookies();
    const bearerOnlyChange = await page.evaluate(
      async ({ password, token }) => {
        const response = await fetch("/api/settings/security/pin", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmPin: "582947",
            currentPassword: password,
            pin: "582947",
          }),
        });
        return {
          body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
          status: response.status,
        };
      },
      { password: credentials.password, token: accessToken }
    );
    expect(bearerOnlyChange.status).toBe(200);
    expect(bearerOnlyChange.body).toMatchObject({
      enabled: true,
      message: "Quick Unlock PIN changed.",
      ok: true,
    });

    await loginAsE2EOwner(page, "/settings/security");
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    const state = await page.request.get("/api/settings/security/pin");
    expect(state.status()).toBe(200);
    expect(await state.json()).toMatchObject({ enabled: true, ok: true });

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

    await passwordPage.getByLabel("Account password").fill(credentials.password);
    const finalDisableResponsePromise = passwordPage.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith("/api/settings/security/pin")
    );
    await passwordPage.getByRole("button", { name: "Disable PIN", exact: true }).click();
    const finalDisableResponse = await finalDisableResponsePromise;
    expect(finalDisableResponse.status()).toBe(200);
    await expect(passwordPage.getByText("Quick Unlock disabled.", { exact: true })).toBeVisible();
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

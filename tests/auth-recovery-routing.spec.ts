import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

import { getE2EOwnerCredentials, loginAsE2EOwner } from "./e2e-auth-owner";

const MAILPIT_ORIGIN = "http://127.0.0.1:54324";

type InbucketMessageSummary = {
  ID?: string;
  To?: Array<{
    Address?: string;
  }>;
};

type MailpitMessages = {
  messages?: InbucketMessageSummary[];
};

type InbucketMessage = {
  HTML?: string;
  Text?: string;
};

function recoveryLink(message: InbucketMessage): string {
  const content = message.HTML || message.Text || "";
  const href = content.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) throw new Error("Local recovery email did not contain a link.");
  return href.replaceAll("&amp;", "&");
}

function recoveryCode(message: InbucketMessage): string {
  const content = message.Text || message.HTML || "";
  const recoverySection = content.split(/One-time recovery code/i)[1] ?? "";
  const code =
    recoverySection.match(/>\s*(\d{6,8})\s*</)?.[1] ?? recoverySection.match(/\b(\d{6,8})\b/)?.[1];
  if (!code) throw new Error("Local recovery email did not contain a recovery code.");
  return code;
}

test.describe.serial("password recovery routing", () => {
  test("an invalid or expired recovery session shows a safe retry state", async ({ page }) => {
    await page.goto("/reset-password?error=invalid_or_expired_link", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Password reset link unavailable" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new reset link" })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
    await expect(page.getByLabel("New password")).toHaveCount(0);
    await expect(page).toHaveURL(/\/reset-password\?error=invalid_or_expired_link$/);
  });

  test("a normal authenticated session cannot open the recovery form", async ({ page }) => {
    await loginAsE2EOwner(page, "/dashboard");

    await page.goto("/reset-password", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Password reset link unavailable" })
    ).toBeVisible();
    await expect(page.getByLabel("New password")).toHaveCount(0);
    await expect(page).toHaveURL(/\/reset-password$/);
  });

  test("normal login still reaches the dashboard", async ({ page }) => {
    await loginAsE2EOwner(page, "/dashboard");

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("recovery pages do not expose token-like query values in visible UI", async ({ page }) => {
    const marker = "should-never-render-token-value";
    await page.goto(`/reset-password?error=invalid_or_expired_link&code=${marker}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("body")).not.toContainText(marker);
    await expect(
      page.getByRole("heading", { name: "Password reset link unavailable" })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password\?error=invalid_or_expired_link$/);
  });

  test("a code-free recovery callback opens the cross-browser OTP verification form", async ({
    page,
  }) => {
    await page.goto("/auth/recovery/callback", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/forgot-password\?mode=verify$/);
    await expect(page.getByRole("heading", { name: "Verify your recovery code" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Recovery code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Verify recovery code" })).toBeDisabled();
  });

  test("a valid local recovery works in a second browser context, rejects replay, survives refresh, and rotates the password", async ({
    browser,
    page,
  }) => {
    const credentials = await getE2EOwnerCredentials();
    const nextPassword = `Hh!${randomBytes(18).toString("hex")}aA1`;
    const messagesUrl = `${MAILPIT_ORIGIN}/api/v1/messages`;
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    const handoffContext = await browser.newContext();
    const handoffPage = await handoffContext.newPage();
    handoffPage.on("console", (message) => consoleMessages.push(message.text()));

    try {
      const beforeResponse = await page.request.get(messagesUrl);
      const before = (await beforeResponse.json()) as MailpitMessages;
      const priorMessageIds = new Set((before.messages ?? []).map((message) => message.ID));
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await page.getByLabel("Email").fill(credentials.email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("status")).toContainText(
        "If that email belongs to an authorized account"
      );

      await expect
        .poll(
          async () => {
            const response = await page.request.get(messagesUrl);
            if (!response.ok()) return 0;
            const body = (await response.json()) as MailpitMessages;
            return (body.messages ?? []).filter(
              (message) =>
                message.ID &&
                !priorMessageIds.has(message.ID) &&
                message.To?.some(
                  (recipient) =>
                    recipient.Address?.toLowerCase() === credentials.email.toLowerCase()
                )
            ).length;
          },
          { timeout: 30_000 }
        )
        .toBeGreaterThan(0);

      const messagesResponse = await page.request.get(messagesUrl);
      const messagesBody = (await messagesResponse.json()) as MailpitMessages;
      const messageId = messagesBody.messages?.find(
        (message) =>
          message.ID &&
          !priorMessageIds.has(message.ID) &&
          message.To?.some(
            (recipient) => recipient.Address?.toLowerCase() === credentials.email.toLowerCase()
          )
      )?.ID;
      expect(messageId).toBeTruthy();
      const messageResponse = await page.request.get(
        `${MAILPIT_ORIGIN}/api/v1/message/${encodeURIComponent(messageId ?? "")}`
      );
      const message = (await messageResponse.json()) as InbucketMessage;
      const link = recoveryLink(message);
      const code = recoveryCode(message);

      await handoffPage.goto(link, { waitUntil: "domcontentloaded" });
      await expect(handoffPage).toHaveURL(/\/forgot-password\?mode=verify$/);
      await handoffPage.getByLabel("Email").fill(credentials.email);
      await handoffPage.getByLabel("Recovery code").fill(code);
      const [verifyResponse] = await Promise.all([
        handoffPage.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/api/auth/recovery/verify"
        ),
        handoffPage.getByRole("button", { name: "Verify recovery code" }).click(),
      ]);
      const verifyBody = (await verifyResponse.json()) as {
        message?: string;
        ok?: boolean;
        redirectTo?: string;
      };
      expect(JSON.stringify(verifyBody)).not.toMatch(
        new RegExp(`${code}|${credentials.email}`, "i")
      );
      expect(verifyResponse.status(), verifyBody.message).toBe(200);
      await expect(handoffPage).toHaveURL(/\/reset-password$/);
      await expect(
        handoffPage.getByRole("heading", { name: "Choose a new password" })
      ).toBeVisible();
      await handoffPage.reload({ waitUntil: "domcontentloaded" });
      await expect(
        handoffPage.getByRole("heading", { name: "Choose a new password" })
      ).toBeVisible();

      const replayContext = await browser.newContext();
      const replayPage = await replayContext.newPage();
      try {
        await replayPage.goto(link, { waitUntil: "domcontentloaded" });
        await replayPage.getByLabel("Email").fill(credentials.email);
        await replayPage.getByLabel("Recovery code").fill(code);
        await replayPage.getByRole("button", { name: "Verify recovery code" }).click();
        await expect(
          replayPage.getByText("Recovery code is invalid or has expired.", { exact: true })
        ).toBeVisible();
        await expect(replayPage).toHaveURL(/\/forgot-password\?mode=verify$/);
      } finally {
        await replayContext.close();
      }

      await handoffPage.getByLabel("New password", { exact: true }).fill(nextPassword);
      await handoffPage.getByLabel("Confirm new password", { exact: true }).fill(nextPassword);
      await handoffPage.getByRole("button", { name: "Update password" }).click();
      await expect(handoffPage).toHaveURL(/\/login\?message=password_reset$/);

      await handoffPage.getByLabel("Email").fill(credentials.email);
      await handoffPage.getByLabel("Password", { exact: true }).fill(credentials.password);
      await handoffPage.getByRole("button", { name: "Sign in" }).click();
      await expect(
        handoffPage.getByText("Unable to sign in with those credentials.", { exact: true })
      ).toBeVisible();

      await handoffPage.getByLabel("Password", { exact: true }).fill(nextPassword);
      await handoffPage.getByRole("button", { name: "Sign in" }).click();
      await expect(handoffPage).toHaveURL(/\/dashboard$/);

      expect(consoleMessages.join("\n")).not.toMatch(
        /access_token|refresh_token|token_hash|recovery-code/i
      );
    } finally {
      await handoffContext.close();
      await getE2EOwnerCredentials();
    }
  });
});

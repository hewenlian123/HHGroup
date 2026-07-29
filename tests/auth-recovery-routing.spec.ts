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

  test("a valid local recovery survives refresh and rotates the password", async ({ page }) => {
    const credentials = await getE2EOwnerCredentials();
    const nextPassword = `Hh!${randomBytes(18).toString("hex")}aA1`;
    const messagesUrl = `${MAILPIT_ORIGIN}/api/v1/messages`;
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

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

      await page.goto(link, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/reset-password$/);
      await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

      await page.getByLabel("New password", { exact: true }).fill(nextPassword);
      await page.getByLabel("Confirm new password", { exact: true }).fill(nextPassword);
      await page.getByRole("button", { name: "Update password" }).click();
      await expect(page).toHaveURL(/\/login\?message=password_reset$/);

      await page.getByLabel("Email").fill(credentials.email);
      await page.getByLabel("Password", { exact: true }).fill(credentials.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(
        page.getByText("Unable to sign in with those credentials.", { exact: true })
      ).toBeVisible();

      await page.getByLabel("Password", { exact: true }).fill(nextPassword);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      expect(consoleMessages.join("\n")).not.toMatch(
        /access_token|refresh_token|token_hash|recovery-code/i
      );
    } finally {
      await getE2EOwnerCredentials();
    }
  });
});

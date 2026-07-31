import { expect, test } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

test.describe("Settings Security authenticated owner experience", () => {
  test.describe.configure({ timeout: 90_000 });

  test("redirects an unauthenticated browser to canonical login", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/settings/security", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fsecurity$/);
    await context.close();
  });

  test("shows account, password, quick unlock, and session controls to an owner", async ({
    page,
  }) => {
    await loginAsE2EOwner(page, "/settings/security");

    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Change password" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quick Unlock PIN" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Current session" })).toBeVisible();
    await expect(page.getByLabel("Current password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm new password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Enable PIN|Change PIN/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out other devices" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out current device" })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  });

  test("signs out the current device only after the explicit submit", async ({ page }) => {
    await loginAsE2EOwner(page, "/settings/security");

    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/security$/);

    await page.getByRole("button", { name: "Sign out current device" }).click();

    await expect(page).toHaveURL(/\/login\?message=signed_out$/);
    await page.goto("/settings/security", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fsecurity$/);
  });

  test("exposes accessible PIN management and mobile 44px touch targets", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await loginAsE2EOwner(page, "/settings/security");

    await expect(page.getByText(/6-digit convenience lock/i)).toBeVisible();
    for (const control of [
      page.getByRole("button", { name: "Change password" }),
      page.getByRole("button", { name: /Enable PIN|Change PIN/ }),
      page.getByRole("button", { name: "Sign out other devices" }),
      page.getByRole("button", { name: "Sign out current device" }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const passwordButton = page.getByRole("button", { name: "Change password" });
    await passwordButton.focus();
    await expect(passwordButton).toBeFocused();
    await context.close();
  });
});

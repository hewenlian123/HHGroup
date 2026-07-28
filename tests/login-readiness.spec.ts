import { expect, test } from "@playwright/test";

test.describe("HH Group login readiness", () => {
  test.describe.configure({ timeout: 60_000 });

  test("renders email/password login without registration or legacy generic PIN", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto("/login?redirect=/financial/inbox", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login\?redirect=\/financial\/inbox$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "username");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
    await expect(page.getByRole("checkbox", { name: "Remember this device" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up|register/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Enter PIN" })).toHaveCount(0);
    await context.close();
  });

  test("show-password control is keyboard accessible", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");

    const toggle = page.getByRole("button", { name: "Show password" });
    await toggle.focus();
    await page.keyboard.press("Enter");

    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
  });

  test("invalid credentials produce a generic accessible error", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email").fill("missing@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Definitely-Wrong-2026!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Unable to sign in" })).toHaveText(
      "Unable to sign in with those credentials."
    );
  });

  test("mobile controls meet the 44px touch target floor", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    for (const locator of [
      page.getByLabel("Email"),
      page.getByLabel("Password", { exact: true }),
      page.getByRole("button", { name: "Sign in" }),
    ]) {
      const box = await locator.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });
});

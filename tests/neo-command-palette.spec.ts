import { expect, test, type Page } from "@playwright/test";

const primaryShortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";

async function openCommandPalette(page: Page, shortcut = primaryShortcut) {
  await page
    .getByRole("button", { name: "Open command palette" })
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.keyboard.press(shortcut);
  await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("Neo command palette", () => {
  test("opens from keyboard shortcuts and closes with Escape", async ({ page }) => {
    await page.goto("/projects", { waitUntil: "domcontentloaded" });

    await openCommandPalette(page);
    await expect(page.getByRole("combobox")).toBeFocused();
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(
      "Go to Dashboard"
    );

    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(
      "Go to Projects"
    );

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeHidden();

    await openCommandPalette(page, "Control+K");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
  });

  test("filters commands and navigates routes from Enter", async ({ page }) => {
    await page.goto("/projects", { waitUntil: "domcontentloaded" });

    await openCommandPalette(page);
    await page.keyboard.type("invoices");
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(
      "Go to Invoices"
    );
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/financial\/invoices(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("runs quick create actions without mutating data", async ({ page }) => {
    await page.goto("/projects", { waitUntil: "domcontentloaded" });

    await openCommandPalette(page);
    await page.keyboard.type("create project");
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(
      "Create Project"
    );
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/projects\/new(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
      timeout: 30_000,
    });
  });
});

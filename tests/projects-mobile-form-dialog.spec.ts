import { expect, test } from "@playwright/test";

test.describe("Projects mobile form controls", () => {
  test.describe.configure({ timeout: 90_000 });

  test("New Project mobile budget and address details stay touch friendly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/new", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("input#project-address")).toHaveCount(0);
    await expect(page.locator('input[type="hidden"][name="address"]')).toHaveValue("");

    await page.locator("#project-address").click();
    let details = page.getByRole("dialog", { name: "Address details" }).last();
    await expect(details).toBeVisible({ timeout: 10_000 });
    await page.locator("#project-address-street").fill("100 Mobile Test Ave");
    await details.getByRole("button", { name: "Cancel" }).click();
    await expect(details).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('input[type="hidden"][name="address"]')).toHaveValue("");

    await page.getByRole("button", { name: "Edit details" }).click();
    details = page.getByRole("dialog", { name: "Address details" }).last();
    await expect(details).toBeVisible({ timeout: 10_000 });
    await page.locator("#project-address-street").fill("100 Mobile Test Ave");
    await page.locator("#project-address-city").fill("Honolulu");
    await page.locator("#project-address-state").fill("HI");
    await page.locator("#project-address-zip").fill("96813");
    await details.getByRole("button", { name: "Save address" }).click();
    await expect(details).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('input[type="hidden"][name="address"]')).toHaveValue(
      "100 Mobile Test Ave, Honolulu, HI 96813"
    );

    const budget = page.locator('input[name="budget"]');
    await budget.fill("1250000");
    await expect(budget).toHaveValue("1,250,000");
    await expect(page.getByText("Estimated $1,250,000")).toBeVisible();
  });

  test("Edit Project mobile address dialog cancels without changing summary", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/11111111-1111-1111-1111-111111111111", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit project" });
    await expect(editDialog).toBeVisible({ timeout: 15_000 });

    const hiddenAddress = editDialog.locator('input[type="hidden"][name="address"]');
    const before = await hiddenAddress.inputValue();
    await editDialog.locator("#edit-project-address").click();
    const details = page.getByRole("dialog", { name: "Address details" }).last();
    await expect(details).toBeVisible({ timeout: 10_000 });
    await page.locator("#edit-project-address-street").fill("999 Unsaved Mobile Ave");
    await details.getByRole("button", { name: "Cancel" }).click();
    await expect(details).toBeHidden({ timeout: 10_000 });
    await expect(hiddenAddress).toHaveValue(before);

    const budget = editDialog.locator('input[name="budget"]');
    await budget.fill("56852100");
    await expect(budget).toHaveValue("56,852,100");
    await expect(editDialog.getByText("Estimated $56,852,100")).toBeVisible();

    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
  });
});

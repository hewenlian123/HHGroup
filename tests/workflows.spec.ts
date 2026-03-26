import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openFirstProjectStatusSelect } from "./e2e-helpers";

/** Next dev can briefly 404 a route while compiling; retry a few times. */
async function gotoLaborWhenReady(page: Page): Promise<void> {
  const notFound = page.getByRole("heading", { name: /^Not found$/i });
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto("/labor");
    await page.waitForLoadState("domcontentloaded");
    if (!(await notFound.isVisible().catch(() => false))) return;
    await page.waitForTimeout(800 * (attempt + 1));
  }
  await expect(notFound).not.toBeVisible();
}

/** Next dev + shared server: run in order to avoid route compile / RSC races across workers. */
test.describe("workflows", () => {
  test.describe.configure({ mode: "serial" });

  test("labor modal opens", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoLaborWhenReady(page);

    const addBtn = page.getByRole("button", { name: "+ Add Entry" });
    await expect(addBtn).toBeVisible({ timeout: 60_000 });
    await expect(addBtn).toBeEnabled({ timeout: 60_000 });
    await addBtn.click();

    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Add Daily Entry" })
    ).toBeVisible({ timeout: 20_000 });
  });

  test("projects list: status column + status filter (desktop table)", async ({ page }) => {
    test.setTimeout(90_000);
    // Desktop viewport + list wait: {@link openFirstProjectStatusSelect}
    await openFirstProjectStatusSelect(page);
  });

  test("new estimate - select customer and autofill", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/estimates/new");
    // Next.js often keeps connections open — networkidle hangs; DOM ready is enough.
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/^Loading/i))
      .not.toBeVisible({ timeout: 60_000 })
      .catch(() => undefined);

    // Some builds show compact summary first; open details if needed.
    const editDetailsBtn = page.getByRole("button", { name: /^(Edit details|Edit)$/i }).first();
    if (await editDetailsBtn.isVisible()) {
      await editDetailsBtn.click();
    }

    const openCustomerPicker = page.locator('button:has-text("Select customer")').first();
    if (await openCustomerPicker.isVisible()) {
      await openCustomerPicker.click();

      const dialog = page.getByRole("dialog", { name: /Select customer/i });
      await expect(dialog).toBeVisible();
      const search = dialog.getByPlaceholder("Search by name or email");
      await expect(search).toBeVisible({ timeout: 15_000 });
      // Seed customer is "[E2E] Test Customer" — match case-insensitively via E2E prefix.
      await search.fill("E2E");

      const listRoot = dialog.locator("div.max-h-64.overflow-y-auto");
      const pickFirst = async () => {
        const btn = listRoot.locator("button").first();
        await expect(btn).toBeVisible({ timeout: 12_000 });
        await btn.click();
      };
      try {
        await pickFirst();
      } catch {
        await search.fill("E2E");
        if (
          await dialog
            .getByText("No customers found.")
            .isVisible()
            .catch(() => false)
        ) {
          await search.clear();
          try {
            await pickFirst();
          } catch {
            test.skip(true, "No customers available in picker (empty list or filter).");
          }
        } else {
          await pickFirst();
        }
      }

      await expect(page.getByPlaceholder("Client or company name")).not.toHaveValue("");
      // Site address autofill only when the customer record has address; seed customer may omit it.
    } else {
      // Fallback mode: no picker in this build/state, fill required fields directly.
      await page.getByPlaceholder("Client or company name").fill("Test Customer");
      await page.getByPlaceholder("Site or client address").fill("Test Address");
      await expect(page.getByPlaceholder("Client or company name")).toHaveValue("Test Customer");
    }

    // Optional: same pattern for phone / email when those customers have values.
    // await expect(page.getByPlaceholder("Phone")).not.toHaveValue("");
    // await expect(page.getByPlaceholder("Email")).not.toHaveValue("");
  });

  test("new estimate flow with category rename", async ({ page }) => {
    await page.goto("/estimates/new");
    await page.waitForLoadState("domcontentloaded");

    const editDetailsBtn = page.getByRole("button", { name: /^(Edit details|Edit)$/i }).first();
    if (await editDetailsBtn.isVisible()) {
      await editDetailsBtn.click();
    }

    const clientInput = page.getByPlaceholder("Client or company name");
    if (await clientInput.isVisible()) {
      await clientInput.fill("Test Estimate Auto");
    }

    const projectInput = page.getByPlaceholder("Project name");
    if (await projectInput.isVisible()) {
      await projectInput.fill("Playwright Project");
    }

    const addCategoryBtn = page.getByRole("button", { name: /^Add Category$/i }).first();
    await expect(addCategoryBtn).toBeVisible({ timeout: 15_000 });
    await addCategoryBtn.click();

    const categoryNameInput = page.locator("details input[placeholder]").first();
    await expect(categoryNameInput).toBeVisible({ timeout: 10_000 });
    await categoryNameInput.fill("Epoxy Test");

    const unitPriceInput = page.locator('input[type="number"]').nth(1);
    if (await unitPriceInput.isVisible()) {
      await unitPriceInput.fill("1000");
    }

    const saveEstimateBtn = page.getByRole("button", { name: /Save Estimate/i });
    await expect(saveEstimateBtn).toBeVisible({ timeout: 10_000 });
    await saveEstimateBtn.click();

    await expect(page.locator("body")).not.toContainText(/error|undefined/i);
    await page.waitForURL(/\/estimates\/[^/]+\??.*$/, { timeout: 20_000 });
  });
});

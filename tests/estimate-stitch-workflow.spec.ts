import { expect, test } from "./estimate-playwright-test";
import { loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import {
  seedEstimateFinancialFixture,
  cleanupEstimateFinancialFixture,
  ESTIMATE_FINANCIAL_FIXTURE_ID,
} from "./estimate-financial-fixture";

test.use({ actionTimeout: 10_000 });

test("Stitch preserves direct pricing edits, section identity and confirmed line mutations", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedEstimateFinancialFixture();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsE2EOwner(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
    const header = page.getByTestId("estimate-detail-header");
    const summary = page.getByRole("region", { name: "Estimate pricing summary" });
    const sections = page.locator("[data-estimate-section-id]");
    const rows = page.locator("[data-estimate-line-item-id]:visible");

    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await header.getByRole("button", { name: "Estimate actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Pricing", exact: true }).click();
    const details = page.getByRole("dialog", {
      name: "Customer, project, and estimate details",
      exact: true,
    });
    await details.getByLabel("Tax amount", { exact: true }).fill("50.25");
    await details.getByRole("button", { name: "Discount options", exact: true }).click();
    await page.getByLabel("Fixed discount amount", { exact: true }).fill("20.10");
    await page.getByRole("button", { name: "Apply", exact: true }).last().click();
    await expect(details.getByRole("spinbutton", { name: "Discount", exact: true })).toHaveValue(
      "20.1"
    );
    await details.getByRole("button", { name: "Save", exact: true }).click();
    await expect(details).toBeHidden();
    await expect(summary).toContainText("$1,050.16");
    await reloadWithE2EAuth(page);
    for (const amount of ["$1,020.01", "$50.25", "$20.10", "$1,050.16"]) {
      await expect(summary).toContainText(amount);
    }
    // Open the real disclosure before reconciling the persisted payment amounts.
    await summary.locator("details#estimate-payment-schedule > summary").click();
    await expect(summary.locator("details#estimate-payment-schedule")).toHaveAttribute("open", "");
    // Existing fixed milestones remain unchanged when tax and discount change.
    await expect(summary).toContainText("$961.26");
    await expect(summary).toContainText("$88.90");

    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Section: Demolition. Open menu to change or rename.",
        exact: true,
      })
      .click();
    await page.getByRole("menuitem", { name: "Rename section…", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Rename section", exact: true });
    await rename.getByLabel("Name", { exact: true }).fill("PW Stitch renamed scope");
    await rename.getByRole("button", { name: "Save", exact: true }).click();
    await expect(rename).toBeHidden();
    await expect(sections.first()).toContainText("PW Stitch renamed scope");
    await reloadWithE2EAuth(page);
    await expect(sections.first()).toHaveAttribute("data-estimate-section-id", "010000");
    await expect(sections.first()).toContainText("PW Stitch renamed scope");

    await header.getByRole("button", { name: "Edit", exact: true }).click();
    const reorder = page.getByRole("button", { name: "Reorder section", exact: true }).first();
    await reorder.focus();
    await reorder.press("Space");
    await expect(page.locator('[data-section-dragging="true"]')).toBeVisible();
    // Let the keyboard sensor finish activation and measure the sortable layout.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    await reorder.press("ArrowDown");
    await expect(page.locator('[data-estimate-section-id="020000"]')).toHaveAttribute(
      "data-sortable-over",
      "true"
    );
    await reorder.press("Space");
    await expect(sections.first()).toHaveAttribute("data-estimate-section-id", "020000");
    await expect(header).toContainText("Saved");
    await reloadWithE2EAuth(page);
    await expect(sections.first()).toHaveAttribute("data-estimate-section-id", "020000");
    await expect(sections.nth(1)).toContainText("PW Stitch renamed scope");
    await expect(summary).toContainText("$1,050.16");

    await header.getByRole("button", { name: "Edit", exact: true }).click();
    const original = page
      .locator('[data-estimate-section-id="010000"] [data-estimate-line-item-id]:visible')
      .first();
    await original.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Duplicate line item", exact: true }).click();
    await expect(rows).toHaveCount(3);
    await expect(summary).toContainText("$1,470.17");
    await reloadWithE2EAuth(page);
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    const copy = rows.filter({
      has: page.getByText("Remove existing flooring (copy)", { exact: true }),
    });
    await expect(copy).toHaveCount(1);
    const copyId = await copy.getAttribute("data-estimate-line-item-id");
    expect(copyId).toBeTruthy();
    const copyById = page.locator(`[data-estimate-line-item-id="${copyId}"]:visible`);
    await copyById.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Remove line item", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Delete line item?", exact: true });
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(copyById).toBeVisible();
    await expect(summary).toContainText("$1,470.17");
    await copyById.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Remove line item", exact: true }).click();
    await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(copyById).toHaveCount(0);
    await expect(summary).toContainText("$1,050.16");
    await reloadWithE2EAuth(page);
    await expect(rows).toHaveCount(2);
    await expect(copyById).toHaveCount(0);
    await expect(summary).toContainText("$1,050.16");
    await expect(sections.nth(1)).toContainText("PW Stitch renamed scope");
  } finally {
    await cleanupEstimateFinancialFixture();
  }
});

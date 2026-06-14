import { expect, test } from "@playwright/test";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

test("Add Daily Entry date picker month arrows navigate months", async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
  try {
    const page = await context.newPage();

    await page.goto("/labor?addDaily=1");
    const dialog = page.getByRole("dialog", { name: /Add Daily Entry/i });
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    const dateInput = dialog.getByTestId("add-daily-entry-date-input");
    await expect(dialog.locator('input[type="date"]')).toHaveCount(0);
    await dateInput.fill("06/15/2026");
    await expect(dateInput).toHaveValue("06/15/2026");

    await dateInput.click();
    let calendar = page.getByTestId("add-daily-entry-date-popover");
    await expect(calendar).toHaveCount(1);
    await expect(calendar.getByText("June 2026")).toBeVisible();

    await calendar.getByRole("button", { name: /Previous Month/i }).click();
    await expect(calendar.getByText("May 2026")).toBeVisible();
    await calendar.getByRole("button", { name: /Next Month/i }).click();
    await expect(calendar.getByText("June 2026")).toBeVisible();
    await calendar.getByRole("button", { name: /Next Month/i }).click();
    await expect(calendar.getByText("July 2026")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(calendar).toHaveCount(0);

    await dialog.getByTestId("add-daily-entry-date-button").click();
    calendar = page.getByTestId("add-daily-entry-date-popover");
    await expect(calendar).toHaveCount(1);
    await expect(calendar.getByText("June 2026")).toBeVisible();
    await calendar.getByRole("button", { name: /Previous Month/i }).click();
    await expect(calendar.getByText("May 2026")).toBeVisible();
    await calendar.getByRole("button", { name: /Next Month/i }).click();
    await expect(calendar.getByText("June 2026")).toBeVisible();

    await calendar.getByRole("button", { name: /Monday, June 15th, 2026/i }).click();
    await expect(dateInput).toHaveValue("06/15/2026");
  } finally {
    await context.close();
  }
});

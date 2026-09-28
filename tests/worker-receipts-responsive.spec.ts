import { expect, test, type Page } from "@playwright/test";
import { addE2EOwnerSession } from "./e2e-auth-owner";

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const panel of await page.getByRole("dialog").all()) {
    if (await panel.isVisible()) {
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  }
}

// Read-only local regression: use the synthetic environment's existing receipt records.
// No financial records are created, approved, paid, or removed by this suite.
test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Worker responsive regression requires the local synthetic environment.");
  }
  await addE2EOwnerSession(page.context(), baseURL);
});

for (const viewport of viewports) {
  test(`Worker receipt responsive controls ${viewport.width}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText !== "net::ERR_ABORTED") {
        errors.push(`${request.failure()?.errorText} ${request.url()}`);
      }
    });
    await page.setViewportSize(viewport);
    await page.goto("/financial/inbox/worker");
    await expect(
      page.getByRole("heading", { name: "Worker Submitted", exact: true })
    ).toBeVisible();
    const search = page.getByRole("textbox", { name: "Search worker receipts" });
    await expect(search).toBeVisible();
    const receipt = page.getByRole("button", { name: /^Review receipt from/ }).first();
    await expect(receipt).toBeVisible();
    const initialCount = await page.getByRole("button", { name: /^Review receipt from/ }).count();

    if (viewport.width < 1024) {
      const filters = page.getByRole("button", { name: /^Filters/ });
      await expect(filters).toBeVisible();
      const searchBox = await search.boundingBox();
      const filterBox = await filters.boundingBox();
      expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(filterBox!.x);
      expect(filterBox!.x + filterBox!.width).toBeLessThanOrEqual(viewport.width);
      await search.fill("TEST");
      await expect(search).toHaveValue("TEST");
      await filters.click();
      const sheet = page.getByRole("dialog", { name: "Filters", exact: true });
      await expect(sheet).toBeVisible();
      for (const field of ["worker", "project", "status"]) {
        const control = sheet.getByLabel(`Filter by ${field}`, { exact: true });
        await expect(control).toBeVisible();
        const option = await control.locator("option").nth(1).getAttribute("value");
        expect(option).toBeTruthy();
        await control.selectOption(option!);
        await expect(control).toHaveValue(option!);
      }
      await expect(sheet.getByLabel("From", { exact: true })).toBeVisible();
      await expect(sheet.getByLabel("To", { exact: true })).toBeVisible();
      await expectNoOverflow(page);
      await page.screenshot({ path: info.outputPath("filters.png") });
      await sheet.getByRole("button", { name: "Clear filters", exact: true }).click();
      for (const field of ["worker", "project", "status"]) {
        await expect(sheet.getByLabel(`Filter by ${field}`, { exact: true })).toHaveValue("");
      }
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
      await expect(sheet).not.toBeVisible();
      await expect(search).toHaveValue("TEST"); // Existing Clear semantics retain search.
      await search.fill("");
      await expect(page.getByRole("button", { name: /^Review receipt from/ })).toHaveCount(
        initialCount
      );
      const sourceUrl = page.url();
      await receipt.click();
      const detail = page.getByRole("dialog", { name: "Worker receipt detail", exact: true });
      await expect(detail).toBeVisible();
      await expect(page).toHaveURL(/ops_record=/);
      await expectNoOverflow(page);
      await detail.getByRole("button", { name: "Close", exact: true }).click();
      await expect(detail).not.toBeVisible();
      await expect(page).toHaveURL(sourceUrl);
      await expect(receipt).toBeFocused();
      await expect(search).toHaveValue("");
    } else {
      for (const field of ["worker", "project", "status"]) {
        await expect(page.getByLabel(`Filter by ${field}`, { exact: true })).toBeVisible();
      }
      await receipt.click();
      await expect(
        page.getByRole("complementary", { name: "Worker receipt detail", exact: true })
      ).toBeVisible();
    }
    await expectNoOverflow(page);
    await page.screenshot({ path: info.outputPath("worker.png") });
    expect(errors).toEqual([]);
  });
}

test("Worker filters have no visibility dead zone across breakpoint boundaries", async ({
  page,
}) => {
  await page.goto("/financial/inbox/worker");
  await expect(page.getByRole("heading", { name: "Worker Submitted", exact: true })).toBeVisible();
  for (const width of [390, 639, 640, 767, 768, 1023, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1024 });
    const searchVisible = await page
      .getByRole("textbox", { name: "Search worker receipts" })
      .isVisible();
    const filtersButtonVisible = await page.getByRole("button", { name: /^Filters/ }).isVisible();
    const desktopFiltersVisible = await page
      .getByLabel("Filter by worker", { exact: true })
      .isVisible();
    expect(
      searchVisible || filtersButtonVisible || desktopFiltersVisible,
      `filter entry at ${width}px`
    ).toBe(true);
  }
});

import { expect, test } from "@playwright/test";

test("Documents RSC preserves the owner session for protected project options", async ({
  page,
}) => {
  const failedDocumentsResponses: Array<{ status: number; url: string }> = [];
  const documentsRscResponses: Array<{ status: number; url: string }> = [];
  const consoleErrors: string[] = [];

  page.on("response", (response) => {
    if (response.url().includes("/documents") && response.request().headers().rsc === "1") {
      documentsRscResponses.push({ status: response.status(), url: response.url() });
    }
    if (response.url().includes("/documents") && response.status() >= 400) {
      failedDocumentsResponses.push({ status: response.status(), url: response.url() });
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/documents", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox").first()).toBeVisible();
  expect(await page.locator("select").first().locator("option").count()).toBeGreaterThan(1);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.locator('a[href="/documents"]').first().click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();

  expect(failedDocumentsResponses).toEqual([]);
  expect(documentsRscResponses).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: 200 })])
  );
  expect(
    consoleErrors.filter((message) => /permission denied|row-level security/i.test(message))
  ).toEqual([]);
});

test("Documents remains unavailable without an authenticated owner session", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const documentsResponses: number[] = [];

  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/documents") {
      documentsResponses.push(response.status());
    }
  });

  expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
  await page.goto("http://localhost:3000/documents", { waitUntil: "domcontentloaded" });
  expect(documentsResponses.some((status) => status >= 300 && status < 400)).toBe(true);
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdocuments$/);
  await context.close();
});

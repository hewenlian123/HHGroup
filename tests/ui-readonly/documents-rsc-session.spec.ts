import { expect, test } from "@playwright/test";
import { addE2EOwnerSession } from "../e2e-auth-owner";

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

test("Documents keeps mobile search, filters, and upload controls touch-sized", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addE2EOwnerSession(page.context(), "http://localhost:3000");
  await page.goto("/documents", { waitUntil: "domcontentloaded" });

  const search = page.getByRole("searchbox", { name: "Search documents" });
  const filters = page.getByRole("button", { name: /filters/i });
  const upload = page.getByRole("button", { name: "Upload document" });

  await expect(search).toBeVisible();
  await expect(filters).toBeVisible();
  await expect(upload).toBeVisible();

  expect((await search.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await filters.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await upload.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test("Documents keeps the tablet upload file picker touch-sized", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await addE2EOwnerSession(page.context(), "http://localhost:3000");
  await page.goto("/documents", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const filePicker = page.locator('input[name="file"]');

  await expect(filePicker).toBeVisible();
  expect((await filePicker.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
    true
  );
});

test("Documents keeps tablet controls reachable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await addE2EOwnerSession(page.context(), "http://localhost:3000");
  await page.goto("/documents", { waitUntil: "domcontentloaded" });

  const search = page.getByRole("searchbox", { name: "Search documents" });
  const upload = page.getByRole("button", { name: "Upload", exact: true });

  await expect(search).toBeVisible();
  await expect(upload).toBeVisible();
  expect((await search.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await upload.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
    true
  );

  const documentRows = page.locator("table tbody tr");
  await expect(documentRows).toHaveCount(1, { timeout: 5_000 });
  for (const action of ["Preview", "Download", "Delete"]) {
    const button = page.getByRole("button", { name: action, exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

test("Documents retains dense, reachable desktop controls without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addE2EOwnerSession(page.context(), "http://localhost:3000");
  await page.goto("/documents", { waitUntil: "domcontentloaded" });

  const search = page.getByRole("searchbox", { name: "Search documents" });
  const upload = page.getByRole("button", { name: "Upload", exact: true });

  await expect(search).toBeVisible();
  await expect(upload).toBeVisible();
  expect((await search.boundingBox())?.height).toBeLessThanOrEqual(40);
  expect((await upload.boundingBox())?.height).toBeLessThanOrEqual(40);
  expect(await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
    true
  );

  await upload.click();
  const filePicker = page.locator('input[name="file"]');
  await expect(filePicker).toBeVisible();
  expect((await filePicker.boundingBox())?.height).toBeLessThanOrEqual(40);

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const documentRows = page.locator("table tbody tr");
  await expect(documentRows).toHaveCount(1, { timeout: 5_000 });
  for (const action of ["Preview", "Download", "Delete"]) {
    const button = page.getByRole("button", { name: action, exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())?.height).toBeLessThanOrEqual(40);
  }
});

test("Documents renders the seeded row and controls across the required viewport matrix", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await addE2EOwnerSession(page.context(), "http://localhost:3000");
  await page.goto("/documents", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900, density: "desktop" },
    { width: 1280, height: 900, density: "desktop" },
    { width: 1180, height: 820, density: "desktop" },
    { width: 820, height: 1180, density: "touch" },
    { width: 390, height: 844, density: "touch" },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const search = page.getByRole("searchbox", { name: "Search documents" });
    const upload = page.getByRole("button", {
      name: viewport.width === 390 ? "Upload document" : "Upload",
      exact: true,
    });
    const documentRows = page.locator("table tbody tr");

    await expect(search).toBeVisible();
    await expect(upload).toBeVisible();
    if (viewport.width === 390) {
      const seededMobileDocument = page.getByRole("button", {
        name: /^\[E2E\] seed-readme\.txt\b/,
      });

      await expect(seededMobileDocument).toBeVisible();
      const seededMobileDocumentBox = await seededMobileDocument.boundingBox();
      expect(
        seededMobileDocumentBox?.width,
        "390px seeded document preview target width"
      ).toBeGreaterThanOrEqual(44);
      expect(
        seededMobileDocumentBox?.height,
        "390px seeded document preview target height"
      ).toBeGreaterThanOrEqual(44);
    } else {
      await expect(documentRows).toHaveCount(1, { timeout: 5_000 });
    }
    expect(
      await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth),
      `${viewport.width}px root horizontal overflow`
    ).toBe(true);

    if (viewport.density === "touch") {
      expect(
        (await search.boundingBox())?.height,
        `${viewport.width}px search`
      ).toBeGreaterThanOrEqual(44);
      expect(
        (await upload.boundingBox())?.height,
        `${viewport.width}px upload`
      ).toBeGreaterThanOrEqual(44);
      if (viewport.width === 390) {
        const filters = page.getByRole("button", { name: /filters/i });
        await expect(filters).toBeVisible();
        expect((await filters.boundingBox())?.height, "390px filters").toBeGreaterThanOrEqual(44);
      } else {
        for (const action of ["Preview", "Download", "Delete"]) {
          const button = page.getByRole("button", { name: action, exact: true });
          await expect(button).toBeVisible();
          expect(
            (await button.boundingBox())?.height,
            `${viewport.width}px ${action}`
          ).toBeGreaterThanOrEqual(44);
        }
      }
      continue;
    }

    expect((await search.boundingBox())?.height, `${viewport.width}px search`).toBeLessThanOrEqual(
      40
    );
    expect((await upload.boundingBox())?.height, `${viewport.width}px upload`).toBeLessThanOrEqual(
      40
    );
    for (const action of ["Preview", "Download", "Delete"]) {
      const button = page.getByRole("button", { name: action, exact: true });
      await expect(button).toBeVisible();
      expect(
        (await button.boundingBox())?.height,
        `${viewport.width}px ${action}`
      ).toBeLessThanOrEqual(40);
    }
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

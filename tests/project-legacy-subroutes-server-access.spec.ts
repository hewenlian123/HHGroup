import { expect, test, type Page } from "@playwright/test";

import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";

const PROTECTED_TABLE_PERMISSION_DENIED =
  /permission denied for table (labor_entries|bank_transactions)/i;

async function expectNoAppError(page: Page) {
  const body = page.locator("body");
  await expect(body).not.toContainText(/Something went wrong|Application error/i);
  await expect(body).not.toContainText(PROTECTED_TABLE_PERMISSION_DENIED);
  await expect(page.getByRole("heading", { name: /^(404|500|Not found)$/i })).toHaveCount(0);
}

async function expectLegacyProjectSubroute(
  page: Page,
  path: string,
  expectedHeading: string,
  protectedErrors: string[]
) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible({
    timeout: 30_000,
  });
  await expectNoAppError(page);
  expect(protectedErrors, `${path} should not log protected-table permission errors`).toEqual([]);
}

test.describe("project legacy subroute server data access", () => {
  test("labor, profit, and subcontracts render without protected-table permission errors", async ({
    page,
  }) => {
    const protectedErrors: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (PROTECTED_TABLE_PERMISSION_DENIED.test(text)) protectedErrors.push(text);
    });
    page.on("pageerror", (error) => {
      const text = error.message;
      if (PROTECTED_TABLE_PERMISSION_DENIED.test(text)) protectedErrors.push(text);
    });

    const projectPath = `/projects/${E2E_PRESERVED_PROJECT_ID}`;

    await expectLegacyProjectSubroute(
      page,
      `${projectPath}/labor`,
      "Project Labor",
      protectedErrors
    );
    await expectLegacyProjectSubroute(page, `${projectPath}/profit`, "Profit", protectedErrors);
    await expectLegacyProjectSubroute(
      page,
      `${projectPath}/subcontracts`,
      "Project Subcontracts",
      protectedErrors
    );
  });
});

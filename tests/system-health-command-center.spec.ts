import { expect, test } from "@playwright/test";

const TEST_HEADERS = {
  "x-hh-test-auth-bypass": "1",
};

test.describe("System Guardian command center", () => {
  test("renders the redesigned health command center and stays within mobile width", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();

    await page.route("**/api/system-health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          checkedAt: "2026-05-22T12:00:00.000Z",
          environment: {
            nodeEnv: "test",
            vercelEnv: "preview",
            commit: "abcdef1234567890",
          },
          summary: {
            app: { name: "Core app", status: "ok", message: "Application shell is reachable." },
            supabase: {
              name: "Supabase connection",
              status: "ok",
              message: "Database read path is reachable.",
            },
            requiredTables: [
              { name: "projects", status: "ok", message: "Reachable" },
              { name: "customers", status: "ok", message: "Reachable" },
            ],
            optionalTables: [
              {
                name: "ap_bills",
                status: "warning",
                category: "optionalModule",
                code: "optional_module_disabled",
                message: "AP Bills module is optional and not configured.",
              },
            ],
            storageBuckets: [{ name: "receipts", status: "ok", message: "Reachable" }],
            companyProfile: {
              name: "Company profile",
              status: "ok",
              message: "Configured",
            },
            pin: { name: "PIN auth", status: "ok", message: "PIN guard configured." },
            apBills: [
              {
                name: "AP bills schema",
                status: "warning",
                category: "optionalModule",
                code: "optional_module_disabled",
                message: "AP Bills module is optional and not configured.",
              },
            ],
            projectFinancialSnapshot: {
              name: "Project financial snapshot",
              status: "ok",
              message: "Snapshot dependencies are reachable.",
            },
            schemaDriftWarnings: [],
            warnings: [],
            checkedAt: "2026-05-22T12:00:00.000Z",
          },
        }),
      });
    });

    await page.route("**/api/system/guardian", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkedAt: "2026-05-22T12:00:00.000Z",
          checks: [
            { name: "/dashboard", ok: true },
            { name: "/financial/invoices", ok: true },
            { name: "/api/system-health", ok: true },
          ],
        }),
      });
    });

    await page.route("**/api/system/integrity", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          orphanedTasks: { ok: true, count: 0 },
          ghostTasks: { ok: true, count: 0 },
          duplicateTasks: { ok: true, count: 0 },
          overdueNotCompleted: { count: 0 },
          staleTestData: {
            tasks: { ok: true, count: 0 },
            projects: { ok: true, count: 0 },
          },
        }),
      });
    });

    await page.route("**/api/system/qa-check", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkedAt: "2026-05-22T12:00:00.000Z",
          mode: "production-safe",
          summary: { status: "pass", critical: 0, warning: 0, pass: 8, total: 8 },
          sections: [
            {
              id: "page-availability",
              name: "Page availability and visible errors",
              status: "pass",
              checks: [
                {
                  id: "dashboard",
                  name: "Dashboard",
                  status: "pass",
                  type: "page",
                  page: "/dashboard",
                  message: "Route rendered without visible errors.",
                },
              ],
            },
            {
              id: "destructive-safety",
              name: "Destructive action safety",
              status: "pass",
              checks: [
                {
                  id: "wipe-get-blocked",
                  name: "Wipe database GET",
                  status: "pass",
                  type: "destructive-safety",
                  page: "/api/production/wipe-database",
                  message: "GET is blocked safely.",
                },
              ],
            },
            {
              id: "preview",
              name: "Receipt, attachment, and PDF preview readiness",
              status: "pass",
              checks: [
                {
                  id: "invoice-preview",
                  name: "Invoice preview",
                  status: "pass",
                  type: "preview",
                  page: "/financial/invoices/demo/preview",
                  message: "Preview route is available.",
                },
              ],
            },
          ],
        }),
      });
    });

    await page.route("**/api/system/data-quality-check", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkedAt: "2026-05-22T12:00:00.000Z",
          summary: {
            status: "ok",
            critical: 0,
            warning: 0,
            info: 0,
            totalIssues: 0,
            returnedIssues: 0,
            projectsChecked: 1,
            expensesChecked: 1,
            invoicesChecked: 1,
            estimatesChecked: 1,
            laborChecked: 0,
            reimbursementsChecked: 0,
            companyProfileChecked: 1,
          },
          modules: [],
          issues: [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/system-health", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "System Guardian" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Production health, data reachability")).toBeVisible();
    await expect(page.getByText("Overall Status")).toBeVisible();
    await expect(page.getByText("Healthy").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh Now" })).toBeVisible();

    for (const card of [
      "Core App",
      "Data Layer",
      "Supabase",
      "Security / PIN",
      "Critical Routes",
      "Destructive Safety",
    ]) {
      await expect(page.getByText(card, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Active Issues" })).toBeVisible();
    await expect(page.getByText("No active issues")).toBeVisible();
    await expect(
      page.getByText("Guardian found no blocking problems in production.")
    ).toBeVisible();
    await expect(page.getByText("1 / 1 routes blocked").first()).toBeVisible();

    for (const section of [
      "Required Tables",
      "Critical Routes",
      "Preview Routes",
      "Optional Modules",
      "Destructive Action Safety",
      "System Metadata",
    ]) {
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible();
    }

    const destructiveSection = page
      .locator("details")
      .filter({ hasText: "Destructive Action Safety" })
      .first();
    await destructiveSection.locator("summary").click();
    await expect(
      destructiveSection.getByRole("cell", { name: "GET is blocked safely." }).first()
    ).toBeVisible();
    const headerBackground = await page
      .locator(".guardian-detail-table thead tr")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(headerBackground).toContain("linear-gradient");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "System Guardian" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);

    await context.close();
  });

  test("pins company profile warnings into Active Issues with readable detail", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: TEST_HEADERS });
    const page = await context.newPage();

    await page.route("**/api/system-health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "warning",
          checkedAt: "2026-05-22T12:00:00.000Z",
          environment: {
            nodeEnv: "test",
            vercelEnv: "preview",
            commit: "abcdef1234567890",
          },
          summary: {
            app: { name: "Core app", status: "ok", message: "Application shell is reachable." },
            supabase: {
              name: "Supabase connection",
              status: "ok",
              message: "Database read path is reachable.",
            },
            requiredTables: [{ name: "projects", status: "ok", message: "Reachable" }],
            optionalTables: [],
            storageBuckets: [{ name: "receipts", status: "ok", message: "Reachable" }],
            companyProfile: {
              name: "Company Profile",
              status: "warning",
              message: "Company profile has not been configured.",
              code: "company_profile_missing",
              href: "/settings/company",
            },
            pin: { name: "PIN auth", status: "ok", message: "PIN guard configured." },
            apBills: [],
            projectFinancialSnapshot: {
              name: "Project financial snapshot",
              status: "ok",
              message: "Snapshot dependencies are reachable.",
            },
            schemaDriftWarnings: [],
            warnings: ["Company profile has not been configured."],
            checkedAt: "2026-05-22T12:00:00.000Z",
          },
        }),
      });
    });

    await page.route("**/api/system/guardian", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkedAt: "2026-05-22T12:00:00.000Z",
          checks: [{ name: "/dashboard", ok: true }],
        }),
      });
    });

    await page.route("**/api/system/integrity", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          orphanedTasks: { ok: true, count: 0 },
          ghostTasks: { ok: true, count: 0 },
          duplicateTasks: { ok: true, count: 0 },
          overdueNotCompleted: { count: 0 },
          staleTestData: {
            tasks: { ok: true, count: 0 },
            projects: { ok: true, count: 0 },
          },
        }),
      });
    });

    await page.route("**/api/system/qa-check", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkedAt: "2026-05-22T12:00:00.000Z",
          mode: "production-safe",
          summary: { status: "warning", critical: 0, warning: 1, pass: 2, total: 3 },
          sections: [
            {
              id: "schema",
              name: "Schema and system health",
              status: "warning",
              checks: [
                {
                  id: "schema-company-profile",
                  name: "Company Profile",
                  status: "warning",
                  type: "data-quality",
                  page: "/settings/company",
                  message: "Company profile has not been configured.",
                  recommendedAction: "Update Settings -> Company Profile.",
                  diagnosticCode: "company_profile_missing",
                },
              ],
            },
          ],
        }),
      });
    });

    await page.route("**/api/system/data-quality-check", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          checkedAt: "2026-05-22T12:00:00.000Z",
          summary: {
            status: "ok",
            critical: 0,
            warning: 0,
            info: 0,
            totalIssues: 0,
            returnedIssues: 0,
            projectsChecked: 1,
            expensesChecked: 0,
            invoicesChecked: 0,
            estimatesChecked: 0,
            laborChecked: 0,
            reimbursementsChecked: 0,
            companyProfileChecked: 0,
          },
          modules: [],
          issues: [],
        }),
      });
    });

    await page.goto("/system-health", { waitUntil: "domcontentloaded" });

    const activeIssues = page.locator("section").filter({ hasText: "Active Issues" }).first();
    await expect(activeIssues.getByText("Company Profile").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      activeIssues.getByText("Company profile has not been configured.").first()
    ).toBeVisible();
    await expect(activeIssues.getByText("company_profile_missing").first()).toBeVisible();

    const coreHealthSection = page
      .locator("details")
      .filter({ hasText: "Core Health Checks" })
      .first();
    await expect(
      coreHealthSection
        .locator("tbody")
        .getByText("Company profile has not been configured.")
        .first()
    ).toBeVisible();
    await expect(
      coreHealthSection.locator("tbody").getByText("company_profile_missing").first()
    ).toBeVisible();

    await context.close();
  });
});

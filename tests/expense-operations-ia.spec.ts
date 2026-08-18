import { expect, test } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

test.describe("Expense Operations consolidated IA", () => {
  test.describe.configure({ timeout: 120_000 });

  test("uses three peer destinations and exposes Worker Submitted inside Receipt Inbox", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");
    await page.goto("/financial/expenses?date_kind=all&project_id=project-a", {
      waitUntil: "domcontentloaded",
    });

    const workspaceNav = page
      .locator("[data-expense-operations-shell]")
      .getByRole("navigation", { name: "Expense Operations workspace" });
    await expect(workspaceNav.getByRole("link")).toHaveCount(3);
    await expect(workspaceNav.getByRole("link", { name: "Expenses", exact: true })).toBeVisible();
    await expect(
      workspaceNav.getByRole("link", { name: "Receipt Inbox", exact: true })
    ).toHaveAttribute("href", "/financial/inbox?date_kind=all&project_id=project-a");
    await expect(
      workspaceNav.getByRole("link", { name: "Reimbursements", exact: true })
    ).toHaveAttribute("href", "/labor/reimbursements?project_id=project-a");
    await expect(workspaceNav.getByRole("link", { name: "Worker Receipts" })).toHaveCount(0);

    await page.goto("/financial/inbox", { waitUntil: "domcontentloaded" });
    const sources = page.getByRole("navigation", { name: "Receipt Inbox sources" });
    await expect(sources.getByRole("link", { name: "Expense Uploads" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await sources.getByRole("link", { name: "Worker Submitted" }).click();
    await expect(page).toHaveURL(/\/financial\/inbox\/worker(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Worker Submitted", exact: true })
    ).toBeVisible();
    await expect(
      page
        .locator("[data-expense-operations-shell]")
        .getByRole("link", { name: "Receipt Inbox", exact: true })
    ).toHaveAttribute("aria-current", "page");
  });

  test("keeps the legacy Worker Receipts deep link as a compatibility redirect", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await loginAsE2EOwner(page, "/financial/expenses");
    const legacyRedirect = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/labor/receipts" && response.status() === 307
    );
    await page.goto(
      "/labor/receipts?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15&search=discard-me",
      { waitUntil: "domcontentloaded" }
    );

    const redirectResponse = await legacyRedirect;
    const redirectLocation = new URL(
      redirectResponse.headers()["location"] ?? "",
      redirectResponse.url()
    );
    expect(`${redirectLocation.pathname}${redirectLocation.search}`).toBe(
      "/financial/inbox/worker?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15"
    );
    await expect(page).toHaveURL(
      /\/financial\/inbox\/worker\?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15$/
    );
    await expect(
      page.getByRole("heading", { name: "Worker Submitted", exact: true })
    ).toBeVisible();
    await expect(
      page.locator("[data-app-sidebar]:visible").getByRole("link", {
        name: "Expense Operations",
        exact: true,
      })
    ).toHaveAttribute("aria-current", "page");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(
      /\/financial\/inbox\/worker\?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15$/
    );

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/financial\/expenses(?:\?|$)/);
    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(
      /\/financial\/inbox\/worker\?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15$/
    );
  });

  test("removes Worker Receipts from peer/sidebar navigation at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsE2EOwner(page, "/financial/inbox/worker");
    await expect(page.getByRole("navigation", { name: "Receipt Inbox sources" })).toBeVisible();
    await expect(
      page
        .locator("[data-expense-operations-shell]")
        .getByRole("navigation", { name: "Expense Operations workspace" })
        .getByRole("link")
    ).toHaveCount(3);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

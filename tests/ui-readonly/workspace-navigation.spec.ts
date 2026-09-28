import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixture";

const primary = [
  "Dashboard",
  "Projects",
  "Estimates",
  "Finance",
  "Labor",
  "Contacts",
  "Inbox",
  "Reports",
  "Settings",
];
const routes = [
  ["/projects", "Projects"],
  ["/estimates", "Estimates"],
  ["/financial", "Finance"],
  ["/finance", "Finance"],
  ["/financial/payments", "Finance"],
  ["/bills", "Finance"],
  ["/labor", "Labor"],
  ["/reports/workforce?tab=payments", "Labor"],
  ["/customers", "Contacts"],
  ["/financial/vendors", "Contacts"],
  ["/financial/inbox", "Inbox"],
  ["/reports", "Reports"],
  ["/settings/company", "Settings"],
  ["/dashboard", "Dashboard"],
] as const;

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`workspace navigation at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("hh.sidebarCollapsed", "0"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
    });

    for (const [route, owner] of routes) {
      await test.step(`${route} belongs to ${owner}`, async () => {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(response?.status(), route).toBe(200);
        if (route === "/bills") {
          expect(await response!.text()).not.toContain("Element type is invalid");
        }
        await expect(page.locator("[data-app-scroll-root]")).toBeVisible();
        await expect(
          page
            .getByText(
              /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error/
            )
            .first()
        ).not.toBeVisible();
        const mobile = viewport.width < 640;
        if (mobile) await page.getByRole("button", { name: "Open menu", exact: true }).click();
        const sidebar = page.locator("[data-app-sidebar]:visible");
        await expect(sidebar).toHaveCount(1);
        const links = sidebar.locator("[data-sidebar-navigation] a");
        await expect(links).toHaveCount(9);
        for (const label of primary)
          await expect(sidebar.getByRole("link", { name: label, exact: true })).toBeVisible();
        await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);
        await expect(sidebar.getByRole("link", { name: owner, exact: true })).toHaveAttribute(
          "aria-current",
          "page"
        );
        if (mobile) await page.keyboard.press("Escape");
        const overflow = await page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
        );
        expect(overflow, route).toBeLessThanOrEqual(2);
      });
    }

    await page.goto("/financial");
    const finance = page.getByRole("navigation", { name: "Finance workspace", exact: true });
    await finance.getByRole("button", { name: "Billing · Money In" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Payments Received", exact: true })
    ).toHaveAttribute("href", "/financial/payments");
    await page.screenshot({ path: testInfo.outputPath(`finance-billing-${viewport.width}.png`) });
    await page.getByRole("menuitem", { name: "Invoices", exact: true }).click();
    await expect(page).toHaveURL(/\/financial\/invoices$/);
    await expect(
      page.locator("[data-app-scroll-root]").getByRole("heading", { name: "Invoices", exact: true })
    ).toBeVisible();
    await finance.getByRole("button", { name: "Payables · Money Out" }).click();
    await expect(page.getByRole("menuitem", { name: "Bills & Vendor Payments" })).toHaveAttribute(
      "href",
      "/bills"
    );
    await expect(page.getByRole("menuitem", { name: "Payments Received" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Bills & Vendor Payments" }).click();
    await expect(page).toHaveURL(/\/bills$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/financial\/invoices$/);

    if (viewport.width < 640) {
      const bottom = page.getByRole("navigation", { name: "Bottom navigation" });
      await expect(bottom.getByRole("link")).toHaveCount(5);
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await page
        .locator("[data-app-sidebar]:visible")
        .getByRole("link", { name: "Contacts", exact: true })
        .click();
      await expect(page.getByRole("dialog", { name: "Navigation menu" })).not.toBeVisible();
      await expect(page).toHaveURL(/\/customers$/);
    }

    // Exercise real SPA navigation; a hard goto here tears down in-flight invoice requests.
    if (viewport.width < 640)
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page
      .locator("[data-app-sidebar]:visible")
      .getByRole("link", { name: "Projects", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("navigation", { name: "Projects workspace" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`projects-${viewport.width}.png`) });
    const contrast = await new AxeBuilder({ page })
      .include("[data-workspace-navigation]")
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);
    await testInfo.attach("console-errors", {
      body: JSON.stringify(errors, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
}

// Focused regression for the existing Finance hub used by the consolidated sidebar.
test("Finance primary hub and workspace chrome across viewports", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/financial");
    await expect(
      page.locator("[data-app-scroll-root]").getByRole("heading", { name: "Finance", exact: true })
    ).toBeVisible();
    const workspace = page.getByRole("navigation", { name: "Finance workspace", exact: true });
    await expect(workspace).toHaveCount(1);
    await expect(workspace.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await workspace.getByRole("button", { name: "Billing · Money In" }).click();
    await expect(page.getByRole("menuitem", { name: "Payments Received" })).toHaveAttribute(
      "href",
      "/financial/payments"
    );
    await page.keyboard.press("Escape");
    if (viewport.width < 640)
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
    const sidebar = page.locator("[data-app-sidebar]:visible");
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar.getByRole("link", { name: "Finance", exact: true })).toHaveAttribute(
      "href",
      "/financial"
    );
    await expect(sidebar.getByRole("link", { name: "Finance", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await page.screenshot({ path: testInfo.outputPath(`finance-hub-${viewport.width}.png`) });
    if (viewport.width < 640) await page.keyboard.press("Escape");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(2);
  }
  expect(errors).toEqual([]);
});

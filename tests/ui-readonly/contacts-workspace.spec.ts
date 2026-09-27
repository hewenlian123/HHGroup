import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixture";
import { E2E_PRESERVED_CUSTOMER_ID, E2E_PRESERVED_PROJECT_ID } from "../e2e-cleanup-db";

const customerId = process.env.E2E_UI_CUSTOMER_ID || E2E_PRESERVED_CUSTOMER_ID;
const projectId = process.env.E2E_UI_PROJECT_ID || E2E_PRESERVED_PROJECT_ID;

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const vendorId = "77777777-7777-4777-8777-777777777771";
const vendor = {
  id: vendorId,
  name: "[E2E] Contact Vendor",
  contact_name: "Alex",
  email: "vendor@example.test",
  phone: "+1 808 555 0123",
  address: "Fixture address",
  notes: null,
  status: "active",
  created_at: "2026-09-01T00:00:00Z",
};

async function healthy(page: Page) {
  await expect(page.locator("[data-app-scroll-root]")).toBeVisible();
  await expect(
    page
      .getByText(
        /Application error|Unhandled Runtime Error|Internal Server Error|Unable to load data/
      )
      .first()
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
    )
  ).toBeLessThanOrEqual(2);
}
async function clickAndExpectNavigation200(
  page: Page,
  link: ReturnType<Page["locator"]>,
  href: string,
  reloadCachedRoute = false
) {
  const expected = new URL(href, page.url());
  const historyState = await page.evaluate(() => JSON.stringify(history.state));
  const navigated = page.waitForResponse((response) => {
    const actual = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      actual.pathname === expected.pathname &&
      [...expected.searchParams].every(([key, value]) => actual.searchParams.get(key) === value)
    );
  });
  await link.click();
  await expect(page).toHaveURL(expected.toString());
  if (reloadCachedRoute) await page.reload({ waitUntil: "networkidle" });
  const response = await navigated;
  expect(response.status(), href).toBe(200);
  await page.waitForLoadState("networkidle");
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(history.state)))
    .not.toBe(historyState);
}
async function section(page: Page, label: string) {
  const nav = page.getByRole("navigation", { name: "Contact detail sections", exact: true });
  const link = nav.getByRole("link", { name: label, exact: true });
  let href: string | null;
  let target = link;
  if (await link.isVisible()) href = await link.getAttribute("href");
  else {
    await nav.getByRole("button", { name: "More contact sections" }).click();
    target = page.getByRole("menuitem", { name: label, exact: true });
    href = await target.getAttribute("href");
  }
  expect(href).toBeTruthy();
  await clickAndExpectNavigation200(page, target, href!);
  await expect(page).toHaveURL(new RegExp(`tab=${label.toLowerCase()}(?:&|$)`));
  await expect(page.getByRole("region", { name: label, exact: true })).toBeVisible();
}

for (const viewport of viewports) {
  test(`Contacts workspace smoke ${viewport.width}`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("hh.sidebarCollapsed", "0"));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
    });
    const goto = async (path: string) => {
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status(), path).toBe(200);
      await healthy(page);
    };
    const capture = async (name: string) =>
      page.screenshot({ path: testInfo.outputPath(`${name}-${viewport.width}.png`) });

    const aliasResponse = await page.goto("/contacts", { waitUntil: "networkidle" });
    expect([200, 307]).toContain(aliasResponse?.status());
    await expect(page).toHaveURL(/\/customers\/overview$/);
    await healthy(page);
    await goto("/customers/overview");
    const nav = page.getByRole("navigation", { name: "Contacts workspace", exact: true });
    await expect(nav).toHaveCount(1);
    for (const [label, href] of [
      ["Overview", "/customers/overview"],
      ["Customers", "/customers"],
      ["Subcontractors", "/subcontractors"],
      ["Vendors", "/vendors"],
    ]) {
      const direct = nav.getByRole("link", { name: label, exact: true });
      if (await direct.isVisible()) await expect(direct).toHaveAttribute("href", href);
      else {
        await nav.getByRole("button", { name: "More Contacts sections", exact: true }).click();
        await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveAttribute(
          "href",
          href
        );
        await page.keyboard.press("Escape");
      }
    }
    await expect(nav.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
    await expect(page.getByText(/contacts unavailable\. Check/)).toHaveCount(0);
    const search = page.getByRole("textbox", { name: "Search contacts" });
    await search.fill("no-match-contact-fixture-919");
    await expect(page.getByText("No contacts match your filters", { exact: true })).toBeVisible();
    await search.fill("");
    await page.getByRole("combobox", { name: "Contact type" }).selectOption("Customer");
    await expect(page.locator("[data-contact-list] article").first()).toContainText("Customer");
    await page.getByRole("combobox", { name: "Contact type" }).selectOption("all");
    await page.getByRole("combobox", { name: "Contact status" }).selectOption("inactive");
    await page.getByRole("combobox", { name: "Contact status" }).selectOption("all");
    await capture("overview");
    const contrast = await new AxeBuilder({ page })
      .include("[data-workspace-navigation]")
      .include(".page-container")
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);
    for (const link of await nav.locator("a:visible,button:visible").all()) {
      const bounds = await link.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    if (viewport.width < 640)
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
    const sidebar = page.locator("[data-app-sidebar]:visible");
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar.locator("[data-sidebar-navigation] a")).toHaveCount(9);
    await expect(sidebar.getByRole("link", { name: "Contacts", exact: true })).toHaveAttribute(
      "href",
      "/customers"
    );
    if (viewport.width < 640) await page.keyboard.press("Escape");
    await page.emulateMedia({ forcedColors: "active" });
    await capture("overview-forced-colors");
    await healthy(page);
    await page.emulateMedia({ forcedColors: "none" });

    await clickAndExpectNavigation200(
      page,
      nav.getByRole("link", { name: "Customers", exact: true }),
      "/customers"
    );
    await healthy(page);
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole("textbox", { name: "Search customers" })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Search customers" })
      .fill("no-match-contact-fixture-919");
    await expect(page.getByText("No customers match your filters", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Search customers" }).fill("");
    await page.getByRole("combobox", { name: "Customer status" }).selectOption("active");
    await capture("customers");
    await goto(`/customers/${customerId}?contactSmoke=1`);
    await expect(page.getByRole("textbox", { name: "Customer Name", exact: true })).toBeVisible();
    const customerName = await page
      .getByRole("textbox", { name: "Customer Name", exact: true })
      .inputValue();
    expect(customerName).not.toBe("");
    await capture("customer-detail");
    await section(page, "Projects");
    await expect(page).toHaveURL(/contactSmoke=1/);
    const projectLink = page
      .getByRole("region", { name: "Projects", exact: true })
      .locator(`a[href="/projects/${projectId}"]`);
    await expect(projectLink).toBeVisible();
    await clickAndExpectNavigation200(page, projectLink, `/projects/${projectId}`);
    await healthy(page);
    await page.goBack();
    await expect(page.getByRole("region", { name: "Projects", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const projectBackResponse = await page.reload({ waitUntil: "networkidle" });
    expect(projectBackResponse?.status()).toBe(200);
    await healthy(page);
    await section(page, "Estimates");
    await expect(page.getByRole("link", { name: "Open Estimates", exact: true })).toHaveAttribute(
      "href",
      "/estimates"
    );
    for (const [label, name, route] of [
      ["Invoices", "Open customer invoices", "/financial/invoices"],
      ["Payments", "Open payments received", "/financial/payments"],
    ]) {
      await section(page, label);
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", `${route}?customerId=${customerId}`);
      await clickAndExpectNavigation200(page, link, `${route}?customerId=${customerId}`);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(new RegExp(`${route}\\?customerId=${customerId}`));
      await healthy(page);
      await page.goBack();
      await expect(page.getByRole("region", { name: label, exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const detailBackResponse = await page.reload({ waitUntil: "networkidle" });
      expect(detailBackResponse?.status()).toBe(200);
      await healthy(page);
    }
    await section(page, "Documents");
    await expect(
      page
        .getByRole("region", { name: "Documents", exact: true })
        .locator(`a[href="/documents?project_id=${projectId}"]`)
    ).toBeVisible();
    await section(page, "History");
    await capture("customer-history");
    await section(page, "Overview");
    await page.goBack();
    await expect(page.getByRole("region", { name: "History", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const historyBackResponse = await page.reload({ waitUntil: "networkidle" });
    expect(historyBackResponse?.status()).toBe(200);
    await healthy(page);
    await page.goForward();
    await expect(page.getByRole("region", { name: "Overview", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const historyForwardResponse = await page.reload({ waitUntil: "networkidle" });
    expect(historyForwardResponse?.status()).toBe(200);
    await healthy(page);

    await goto("/labor/subcontractors");
    await expect(page).toHaveURL(/\/subcontractors$/);
    const subSearch = page.getByRole("textbox", { name: "Search subcontractors" });
    await expect(subSearch).toBeVisible();
    await subSearch.fill("no-match-contact-fixture-919");
    if (viewport.width >= 768)
      await expect(
        page.getByText("No subcontractors match your filters", { exact: true })
      ).toBeVisible();
    else await expect(page.getByText("No subcontractors match your search.")).toBeVisible();
    await subSearch.fill("");
    await capture("subcontractors");
    const subLink = page.locator('a[href^="/subcontractors/"]:visible').first();
    await expect(subLink).toBeVisible();
    const subHref = await subLink.getAttribute("href");
    await clickAndExpectNavigation200(page, subLink, subHref!);
    await healthy(page);
    await expect(page).toHaveURL(new RegExp(`${subHref}$`));
    await expect(page.getByRole("navigation", { name: "Contact detail sections" })).toBeVisible();
    await expect(
      page.getByText("Subcontractor financial data unavailable.", { exact: false })
    ).toHaveCount(0);
    await capture("subcontractor-detail");
    for (const label of ["Projects", "Contracts", "Bills", "Payments", "Documents", "History"]) {
      await section(page, label);
      await healthy(page);
      await capture(`subcontractor-${label.toLowerCase()}`);
    }
    await goto(`/labor${subHref}`);
    await expect(page).toHaveURL(new RegExp(`${subHref}$`));

    // Vendor fixture is HTTP-only and never persisted; operational links keep their existing semantics.
    await page.route("**/api/vendors?includeDisabled=1", (route) =>
      route.fulfill({
        json: {
          vendors: [
            vendor,
            { ...vendor, id: "inactive-vendor", name: "Inactive vendor", status: "inactive" },
          ],
        },
      })
    );
    await goto("/vendors");
    const vendorSearch = page.getByRole("textbox", { name: "Search vendors" });
    for (const query of ["Alex", "vendor@example.test", "808"]) {
      await vendorSearch.fill(query);
      await expect(page.locator("[data-contact-list] article")).toHaveCount(2);
    }
    await vendorSearch.fill("Contact Vendor");
    await expect(page.locator("[data-contact-list] article")).toHaveCount(1);
    await vendorSearch.fill("");
    await page.getByRole("combobox", { name: "Contact status" }).selectOption("inactive");
    await expect(page.locator("[data-contact-list] article")).toHaveCount(1);
    await page.getByRole("combobox", { name: "Contact status" }).selectOption("all");
    await capture("vendors");
    await expect(page.getByRole("link", { name: vendor.name, exact: true })).toHaveAttribute(
      "href",
      `/vendors/${vendorId}`
    );
    await clickAndExpectNavigation200(
      page,
      page.getByRole("link", { name: vendor.name, exact: true }),
      `/vendors/${vendorId}`
    );
    await healthy(page);
    await expect(page).toHaveURL(new RegExp(`/vendors/${vendorId}$`));
    await expect(page.getByRole("link", { name: vendor.email, exact: true })).toHaveAttribute(
      "href",
      `mailto:${vendor.email}`
    );
    await expect(page.getByRole("link", { name: vendor.phone, exact: true })).toHaveAttribute(
      "href",
      `tel:${vendor.phone}`
    );
    await capture("vendor-detail");
    await section(page, "Bills");
    await expect(page.getByRole("link", { name: "Search bills by name" })).toHaveAttribute(
      "href",
      `/bills?search=${encodeURIComponent(vendor.name)}`
    );
    for (const label of ["Materials", "Payments", "Expenses", "Documents", "History"]) {
      await section(page, label);
      await healthy(page);
    }
    await section(page, "Overview");
    await expect(page.getByRole("link", { name: "Back to Vendors" })).toHaveAttribute(
      "href",
      "/vendors"
    );
    await clickAndExpectNavigation200(
      page,
      page.getByRole("link", { name: "Back to Vendors" }),
      "/vendors",
      true
    );
    await healthy(page);
    await expect(page).toHaveURL(/\/vendors$/);
    await goto("/financial/vendors");
    await expect(page.getByRole("textbox", { name: "Search vendors" })).toBeVisible();
    await page.unroute("**/api/vendors?includeDisabled=1");

    for (const [path, workspace] of [
      ["/financial", "Finance"],
      ["/projects", "Projects"],
      ["/labor/overview", "Labor"],
    ]) {
      await goto(path);
      await expect(
        page.getByRole("navigation", { name: `${workspace} workspace`, exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Contacts workspace", exact: true })
      ).toHaveCount(0);
      await capture(`frozen-${workspace.toLowerCase()}`);
    }
    await testInfo.attach("console-errors", {
      body: JSON.stringify(errors, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });

  test(`Contacts empty and unavailable states ${viewport.width}`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    const errors: { url: string; text: string }[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        errors.push({ url: message.location().url, text: message.text() });
    });
    let status = 200;
    await page.route("**/api/vendors?includeDisabled=1", (route) =>
      route.fulfill({
        status,
        json: status === 200 ? { vendors: [] } : { message: "Fixture unavailable" },
      })
    );
    await page.goto("/vendors", { waitUntil: "networkidle" });
    await expect(page.getByText("No contacts yet", { exact: true })).toBeVisible();
    await healthy(page);
    for (const code of [403, 500]) {
      status = code;
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByText("Vendor contacts unavailable.", { exact: false })).toBeVisible();
      await expect(page.getByText("No contacts yet", { exact: true })).toHaveCount(0);
      await expect(page.locator("[data-app-scroll-root]")).not.toContainText("$0");
      await page.screenshot({
        path: testInfo.outputPath(`vendor-unavailable-${code}-${viewport.width}.png`),
      });
    }
    status = 200;
    await page.getByRole("button", { name: "Retry contacts" }).click();
    await expect(page.getByText("No contacts yet", { exact: true })).toBeVisible();
    await page.route(`**/api/customers/${customerId}`, (route) =>
      route.fulfill({ status: 500, json: { message: "Fixture customer unavailable" } })
    );
    await page.goto(`/customers/${customerId}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Customer unavailable" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Customer Name", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(0);
    await healthy(page);
    await page.screenshot({
      path: testInfo.outputPath(`customer-unavailable-${viewport.width}.png`),
    });
    expect(pageErrors).toEqual([]);
    for (const error of errors) {
      expect(error.url).toMatch(/\/api\/(vendors|customers)/);
      expect(error.text).toMatch(/Failed to load resource.*(?:403|500)/);
    }
    await testInfo.attach("induced-error-console", {
      body: JSON.stringify(errors, null, 2),
      contentType: "application/json",
    });
  });
}

test("Contacts compact overview and forced-colors selection", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/customers/overview", { waitUntil: "networkidle" });
    await healthy(page);
    await page.screenshot({ path: testInfo.outputPath(`final-overview-${viewport.width}.png`) });
    if (viewport.width === 390) {
      const bounds = await page.getByRole("textbox", { name: "Search contacts" }).boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThan(viewport.height / 2);
    }
    await page.emulateMedia({ forcedColors: "active" });
    const selected = page
      .getByRole("navigation", { name: "Contacts workspace", exact: true })
      .locator('[aria-current="page"]');
    await expect(selected).toHaveCSS("text-decoration-line", "underline");
    await page.screenshot({
      path: testInfo.outputPath(`final-forced-colors-${viewport.width}.png`),
    });
    await page.goto(`/customers/${customerId}`, { waitUntil: "networkidle" });
    await expect(
      page
        .getByRole("navigation", { name: "Contact detail sections" })
        .locator('[aria-current="page"]')
    ).toHaveCSS("text-decoration-line", "underline");
    await healthy(page);
    await page.emulateMedia({ forcedColors: "none" });
  }
  expect(errors).toEqual([]);
});

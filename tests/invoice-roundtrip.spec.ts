import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "./ui-readonly/fixture";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";
import {
  E2E_PRESERVED_PROJECT_ID as projectId,
  E2E_PRESERVED_CUSTOMER_ID as customerId,
} from "./e2e-cleanup-db";

const invoiceNo = `PW Roundtrip ${randomUUID()}`;
let db: SupabaseClient;
let invoiceId = "";
let original: unknown;
const columns = "id,invoice_no,project_id,customer_id,status,subtotal,tax_amount,total";

test.beforeAll(async ({ browser, baseURL, storageState }) => {
  loadE2EProcessEnv();
  const target = assertEstimateCertificationLocalOnly({
    baseURL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(key, "Local admin credential required for exact fixture cleanup").toBeTruthy();
  db = createClient(target.supabaseOrigin, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Read the actual columns before using the existing UI creation path.
  const schema = await db.from("invoices").select(columns).limit(0);
  expect(schema.error).toBeNull();
  const itemsSchema = await db.from("invoice_items").select("id,invoice_id").limit(0);
  expect(itemsSchema.error).toBeNull();
  const context = await browser.newContext({ baseURL, storageState });
  try {
    const page = await context.newPage();
    await page.goto("/financial/invoices/new", { waitUntil: "networkidle" });
    await page.getByTestId("invoice-new-project-select").selectOption(projectId);
    await page
      .locator("select")
      .filter({ hasText: "[E2E] Test Customer" })
      .first()
      .selectOption(customerId);
    await expect(page.getByTestId("invoice-new-client-input")).toHaveValue("[E2E] Test Customer");
    await page.getByTestId("invoice-new-number-input").fill(invoiceNo);
    await page.getByTestId("invoice-new-due-date-input").fill("2099-06-30");
    await page
      .getByTestId("invoice-new-line-1-item-input")
      .fill("[E2E] Invoice navigation fixture");
    await page.getByTestId("invoice-new-line-1-qty-input").fill("1");
    await page.getByTestId("invoice-new-line-1-rate-input").fill("225");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByTestId("invoice-detail")).toBeVisible({ timeout: 60000 });
    invoiceId = new URL(page.url()).pathname.split("/").pop()!;
    const result = await db.from("invoices").select(columns).eq("id", invoiceId).single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      invoice_no: invoiceNo,
      status: "Draft",
      project_id: projectId,
      customer_id: customerId,
      subtotal: 225,
      tax_amount: 0,
      total: 225,
    });
    original = result.data;
    console.log(`Local Invoice fixture created: ${invoiceId}`);
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  if (!db) return;
  // Look up our unique marker even if setup failed after Save draft completed.
  const owned = await db.from("invoices").select("id").eq("invoice_no", invoiceNo);
  expect(owned.error).toBeNull();
  const ids = (owned.data ?? []).map((row) => row.id);
  try {
    if (original) {
      const current = await db.from("invoices").select(columns).eq("id", invoiceId).single();
      expect(current.error).toBeNull();
      expect(current.data).toEqual(original);
    }
  } finally {
    if (ids.length) {
      const items = await db.from("invoice_items").delete().in("invoice_id", ids);
      expect(items.error).toBeNull();
      const headers = await db.from("invoices").delete().in("id", ids);
      expect(headers.error).toBeNull();
      const remainingItems = await db
        .from("invoice_items")
        .select("id", { count: "exact", head: true })
        .in("invoice_id", ids);
      expect(remainingItems.error).toBeNull();
      expect(remainingItems.count).toBe(0);
    }
    const remaining = await db
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("invoice_no", invoiceNo);
    expect(remaining.error).toBeNull();
    expect(remaining.count).toBe(0);
    console.log(`Local Invoice fixture removed: ${invoiceNo}; header/items remaining=0`);
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Invoice round-trip ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
        errors.push(`Unexpected write: ${request.method()} ${request.url()}`);
    });
    const healthy = async () => {
      expect(
        await page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
        )
      ).toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
    };
    const active = async () => {
      const nav = page.getByRole("navigation", { name: "Finance workspace", exact: true });
      const billing = nav.getByRole("link", { name: "Billing", exact: true });
      await expect(billing).toHaveAttribute("aria-current", "page");
      await expect(
        page
          .getByRole("navigation", { name: "Billing sections", exact: true })
          .getByRole("link", { name: "Invoices", exact: true })
      ).toHaveAttribute("aria-current", "page");
    };
    const search = page.locator('input[placeholder*="Invoice #"]:visible');
    const filters = page
      .getByRole("button", { name: /Filters/ })
      .filter({ visible: true })
      .first();
    const open = page
      .getByTestId(`invoice-mobile-card-${invoiceNo}`)
      .or(page.getByTestId(`invoice-row-${invoiceNo}`))
      .filter({ visible: true });
    const openDetail = async () => {
      if ((await open.getAttribute("role")) === "link") await open.click();
      else await open.locator("button.text-left").click();
      await expect(page.getByTestId("invoice-detail")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await active();
      await healthy();
    };
    await page.goto(`/financial/invoices?customerId=${customerId}`, { waitUntil: "networkidle" });
    await active();
    await search.pressSequentially(invoiceNo);
    await expect(search).toHaveValue(invoiceNo);
    await filters.click();
    await page.getByLabel("Status", { exact: true }).selectOption("Draft");
    await page.getByLabel("Project", { exact: true }).selectOption(projectId);
    await page.getByLabel("Issue from", { exact: true }).fill("2020-01-01");
    await page.getByLabel("Issue to", { exact: true }).fill("2099-12-31");
    if (viewport.width < 768) await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(open).toBeVisible();
    const listUrl = page.url();
    await page.reload({ waitUntil: "networkidle" });
    await expect(search).toHaveValue(invoiceNo);
    await healthy();
    await openDetail();
    await page.screenshot({
      caret: "initial",
      path: info.outputPath(`invoice-detail-${viewport.width}.png`),
    });
    // Browser Back and the explicit detail breadcrumb must both preserve the list.
    await page.goBack();
    await expect(page).toHaveURL(listUrl);
    await expect(search).toHaveValue(invoiceNo);
    await openDetail();
    for (const [href, label] of [
      [`/customers/${customerId}`, "Customer Name"],
      [`/projects/${projectId}`, "project"],
    ]) {
      const link = page.getByTestId("invoice-detail").locator(`a[href="${href}"]`);
      await expect(link, `Linked ${label} context`).toBeVisible();
      const bounds = (await link.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      await link.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      if (label === "project")
        await expect(page.locator(`[data-project-context="${projectId}"]`)).toBeVisible();
      else await expect(page.getByRole("textbox", { name: label, exact: true })).toBeVisible();
      await healthy();
      await page.goBack();
      await expect(page.getByTestId("invoice-detail")).toBeVisible();
      await active();
    }
    await page
      .getByTestId("invoice-detail")
      .getByRole("link", { name: "Invoices", exact: true })
      .click();
    await expect(search).toHaveValue(invoiceNo);
    await expect(page).toHaveURL(listUrl);
    await filters.click();
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue("Draft");
    await expect(page.getByLabel("Project", { exact: true })).toHaveValue(projectId);
    await expect(page.getByLabel("Issue from", { exact: true })).toHaveValue("2020-01-01");
    await expect(page.getByLabel("Issue to", { exact: true })).toHaveValue("2099-12-31");
    if (viewport.width < 768) await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(open).toBeVisible();
    await active();
    await healthy();
    await page.screenshot({
      caret: "initial",
      path: info.outputPath(`invoice-returned-list-${viewport.width}.png`),
    });
    if (viewport.width === 1440) {
      for (const returnTo of [
        "//example.invalid",
        "/financial/invoices/../payments",
        "/financial/invoices/%2e%2e/payments",
        "/financial/invoices-other",
      ]) {
        await page.goto(`/financial/invoices/${invoiceId}?${new URLSearchParams({ returnTo })}`, {
          waitUntil: "networkidle",
        });
        await expect(
          page.getByTestId("invoice-detail").getByRole("link", { name: "Invoices", exact: true })
        ).toHaveAttribute("href", "/financial/invoices");
      }
      const returnTo = "/estimates/44444444-4444-4444-4444-444444444449?tab=payment";
      await page.goto(`/financial/invoices/${invoiceId}?${new URLSearchParams({ returnTo })}`, {
        waitUntil: "networkidle",
      });
      await expect(page.getByTestId("invoice-detail-return-to-estimate")).toHaveAttribute(
        "href",
        returnTo
      );
      await healthy();
    }
    await info.attach("console-page-write-errors", {
      body: JSON.stringify(errors),
      contentType: "application/json",
    });
  });
}

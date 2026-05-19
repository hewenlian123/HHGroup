import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";
import {
  clickVisibleQuickExpenseButton,
  expenseListRow,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
  waitForQuickExpenseProjectLabel,
} from "./e2e-expenses-helpers";

type RuntimeIssue = {
  kind: "console" | "pageerror" | "requestfailed";
  text: string;
  url?: string;
};

type FlowNames = {
  customerName: string;
  projectName: string;
  estimateLineTitle: string;
  changeOrderTitle: string;
  invoiceClientName: string;
  invoiceLineDescription: string;
  expenseVendor: string;
  workerName: string;
  reimbursementVendor: string;
};

const customerNames = new Set<string>();
const projectNames = new Set<string>();
const estimateClients = new Set<string>();
const estimateProjects = new Set<string>();
const changeOrderTitles = new Set<string>();
const invoiceClientNames = new Set<string>();
const expenseVendors = new Set<string>();
const workerNames = new Set<string>();

test.describe.configure({ mode: "serial", timeout: 300_000 });

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key);
}

function isMissingSchemaError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  return /schema cache|does not exist|could not find the table|could not find.*column|column .* does not exist|undefined column|pgrst204/i.test(
    message
  );
}

async function safeSelectIds(
  db: SupabaseClient,
  table: string,
  column: string,
  values: string[]
): Promise<string[]> {
  const unique = Array.from(new Set(values.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await db.from(table).select("id").in(column, unique);
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw new Error(`${table}.${column} collect failed: ${error.message}`);
  }
  return Array.from(new Set((data ?? []).map((row) => String((row as { id: string }).id))));
}

async function safeSelectIdsByLike(
  db: SupabaseClient,
  table: string,
  column: string,
  values: string[]
): Promise<string[]> {
  const ids = new Set<string>();
  for (const value of values.filter(Boolean)) {
    const { data, error } = await db.from(table).select("id").ilike(column, value);
    if (error) {
      if (isMissingSchemaError(error)) continue;
      throw new Error(`${table}.${column} ilike failed: ${error.message}`);
    }
    for (const row of data ?? []) ids.add(String((row as { id: string }).id));
  }
  return Array.from(ids);
}

async function safeDeleteByIds(db: SupabaseClient, table: string, ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return;
  const { error } = await db.from(table).delete().in("id", unique);
  if (error && !isMissingSchemaError(error)) {
    throw new Error(`${table} cleanup failed: ${error.message}`);
  }
}

async function cleanupFullSystemData(): Promise<void> {
  const db = adminClient();
  if (!db) return;

  const projects = Array.from(projectNames);
  const customers = Array.from(customerNames);
  const estimateClientList = Array.from(estimateClients);
  const estimateProjectList = Array.from(estimateProjects);
  const coTitles = Array.from(changeOrderTitles);
  const invoiceClients = Array.from(invoiceClientNames);
  const vendors = Array.from(expenseVendors);
  const workers = Array.from(workerNames);

  const projectIds = new Set(await safeSelectIds(db, "projects", "name", projects));
  const customerIds = new Set(await safeSelectIds(db, "customers", "name", customers));

  const workerIds = new Set<string>();
  for (const table of ["workers", "labor_workers"] as const) {
    for (const id of await safeSelectIds(db, table, "name", workers)) workerIds.add(id);
  }
  const workerIdList = Array.from(workerIds);
  for (const table of [
    "worker_payments",
    "worker_reimbursements",
    "worker_advances",
    "worker_invoices",
    "labor_entries",
  ]) {
    if (workerIdList.length === 0) continue;
    const { data, error } = await db.from(table).select("id").in("worker_id", workerIdList);
    if (error) {
      if (!isMissingSchemaError(error))
        throw new Error(`${table} collect failed: ${error.message}`);
      continue;
    }
    await safeDeleteByIds(
      db,
      table,
      (data ?? []).map((row) => String((row as { id: string }).id))
    );
  }

  const expenseIds = new Set<string>();
  for (const id of await safeSelectIds(db, "expenses", "vendor_name", vendors)) expenseIds.add(id);
  for (const id of await safeSelectIds(db, "expenses", "vendor", vendors)) expenseIds.add(id);
  if (projectIds.size > 0) {
    const { data, error } = await db
      .from("expenses")
      .select("id")
      .in("project_id", Array.from(projectIds));
    if (error) {
      if (!isMissingSchemaError(error)) {
        throw new Error(`expenses project cleanup collect failed: ${error.message}`);
      }
    } else {
      for (const row of data ?? []) expenseIds.add(String((row as { id: string }).id));
    }
  }
  const expenseIdList = Array.from(expenseIds);
  if (expenseIdList.length > 0) {
    const { error: unlinkError } = await db
      .from("bank_transactions")
      .update({ linked_expense_id: null })
      .in("linked_expense_id", expenseIdList);
    if (unlinkError && !isMissingSchemaError(unlinkError)) {
      throw new Error(`bank_transactions unlink cleanup failed: ${unlinkError.message}`);
    }
    const { data: attRows } = await db
      .from("attachments")
      .select("id")
      .eq("entity_type", "expense")
      .in("entity_id", expenseIdList);
    await safeDeleteByIds(
      db,
      "attachments",
      (attRows ?? []).map((row) => String((row as { id: string }).id))
    );
    const { data: lineRows } = await db
      .from("expense_lines")
      .select("id")
      .in("expense_id", expenseIdList);
    await safeDeleteByIds(
      db,
      "expense_lines",
      (lineRows ?? []).map((row) => String((row as { id: string }).id))
    );
    await safeDeleteByIds(db, "expenses", expenseIdList);
  }

  const invoiceIds = await safeSelectIds(db, "invoices", "client_name", invoiceClients);
  if (invoiceIds.length > 0) {
    const { data: invoicePaymentRows } = await db
      .from("invoice_payments")
      .select("id")
      .in("invoice_id", invoiceIds);
    await safeDeleteByIds(
      db,
      "invoice_payments",
      (invoicePaymentRows ?? []).map((row) => String((row as { id: string }).id))
    );
    const { data: invoiceItemRows } = await db
      .from("invoice_items")
      .select("id")
      .in("invoice_id", invoiceIds);
    await safeDeleteByIds(
      db,
      "invoice_items",
      (invoiceItemRows ?? []).map((row) => String((row as { id: string }).id))
    );
    await safeDeleteByIds(db, "invoices", invoiceIds);
  }

  const coIds = new Set(await safeSelectIds(db, "project_change_orders", "title", coTitles));
  if (projectIds.size > 0) {
    const { data, error } = await db
      .from("project_change_orders")
      .select("id")
      .in("project_id", Array.from(projectIds));
    if (error) {
      if (!isMissingSchemaError(error)) {
        throw new Error(`project_change_orders project collect failed: ${error.message}`);
      }
    } else {
      for (const row of data ?? []) coIds.add(String((row as { id: string }).id));
    }
  }
  const coIdList = Array.from(coIds);
  if (coIdList.length > 0) {
    const { data: coAttachmentRows } = await db
      .from("project_change_order_attachments")
      .select("id")
      .in("change_order_id", coIdList);
    await safeDeleteByIds(
      db,
      "project_change_order_attachments",
      (coAttachmentRows ?? []).map((row) => String((row as { id: string }).id))
    );
    const { data: coItemRows } = await db
      .from("project_change_order_items")
      .select("id")
      .in("change_order_id", coIdList);
    await safeDeleteByIds(
      db,
      "project_change_order_items",
      (coItemRows ?? []).map((row) => String((row as { id: string }).id))
    );
    await safeDeleteByIds(db, "project_change_orders", coIdList);
  }

  const estimateIds = new Set<string>();
  for (const id of await safeSelectIds(db, "estimates", "client", estimateClientList)) {
    estimateIds.add(id);
  }
  for (const id of await safeSelectIds(db, "estimates", "project", estimateProjectList)) {
    estimateIds.add(id);
  }
  const estimateIdList = Array.from(estimateIds);
  if (estimateIdList.length > 0) {
    for (const table of [
      "estimate_payment_schedule",
      "estimate_snapshots",
      "estimate_items",
      "estimate_categories",
      "estimate_meta",
    ]) {
      const { data, error } = await db.from(table).select("id").in("estimate_id", estimateIdList);
      if (error) {
        if (!isMissingSchemaError(error))
          throw new Error(`${table} collect failed: ${error.message}`);
        continue;
      }
      await safeDeleteByIds(
        db,
        table,
        (data ?? []).map((row) => String((row as { id: string }).id))
      );
    }
    await safeDeleteByIds(db, "estimates", estimateIdList);
  }

  if (projectIds.size > 0) {
    for (const table of ["labor_entries", "expense_lines"]) {
      const { data, error } = await db
        .from(table)
        .select("id")
        .in("project_id", Array.from(projectIds));
      if (error) {
        if (!isMissingSchemaError(error))
          throw new Error(`${table} collect failed: ${error.message}`);
        continue;
      }
      await safeDeleteByIds(
        db,
        table,
        (data ?? []).map((row) => String((row as { id: string }).id))
      );
    }
    await safeDeleteByIds(db, "projects", Array.from(projectIds));
  }

  if (workerIdList.length > 0) {
    await safeDeleteByIds(db, "labor_workers", workerIdList);
    await safeDeleteByIds(db, "workers", workerIdList);
  }

  if (customerIds.size > 0) {
    await safeDeleteByIds(db, "customers", Array.from(customerIds));
  }
}

async function expectNoDbResiduals(names: FlowNames): Promise<void> {
  const db = adminClient();
  if (!db) return;
  const residuals = {
    customers: await safeSelectIds(db, "customers", "name", [names.customerName]),
    projects: await safeSelectIds(db, "projects", "name", [names.projectName]),
    estimatesByClient: await safeSelectIds(db, "estimates", "client", [names.customerName]),
    changeOrders: await safeSelectIds(db, "project_change_orders", "title", [
      names.changeOrderTitle,
    ]),
    invoices: await safeSelectIds(db, "invoices", "client_name", [names.invoiceClientName]),
    expensesByVendorName: await safeSelectIds(db, "expenses", "vendor_name", [names.expenseVendor]),
    workers: await safeSelectIdsByLike(db, "workers", "name", [names.workerName]),
    laborWorkers: await safeSelectIdsByLike(db, "labor_workers", "name", [names.workerName]),
  };
  expect(residuals).toEqual({
    customers: [],
    projects: [],
    estimatesByClient: [],
    changeOrders: [],
    invoices: [],
    expensesByVendorName: [],
    workers: [],
    laborWorkers: [],
  });
}

function attachRuntimeCollectors(page: Page) {
  const issues: RuntimeIssue[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/ResizeObserver loop|favicon\.ico|net::ERR_ABORTED/i.test(text)) return;
    issues.push({ kind: "console", text, url: msg.location().url });
  });
  page.on("pageerror", (error) => {
    issues.push({ kind: "pageerror", text: error.message });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "request failed";
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(failure)) return;
    issues.push({ kind: "requestfailed", text: failure, url: request.url() });
  });
  return issues;
}

async function expectRuntimeClean(page: Page, testInfo: TestInfo, issues: RuntimeIssue[]) {
  if (issues.length > 0) {
    await page.screenshot({
      path: testInfo.outputPath("runtime-issue.png"),
      fullPage: true,
    });
  }
  expect(issues).toEqual([]);
}

async function expectHealthyPage(page: Page, label: string, testInfo: TestInfo): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect
    .poll(
      async () => {
        const text = (
          await page
            .locator("body")
            .innerText()
            .catch(() => "")
        ).trim();
        return text.length;
      },
      { timeout: 60_000, intervals: [250, 500, 1000] }
    )
    .toBeGreaterThan(20);

  const bodyText = await page.locator("body").innerText();
  const runtimeLeak =
    /Something went wrong|Application error|Unhandled Runtime Error|Hydration failed|This page could not be found|Internal Server Error|digest:|TypeError:|ReferenceError:|undefined|null|null\)|stack trace/i;
  if (runtimeLeak.test(bodyText)) {
    await page.screenshot({
      path: testInfo.outputPath(`${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-error.png`),
      fullPage: true,
    });
  }
  expect(bodyText, `${label} should not show runtime/debug leakage`).not.toMatch(runtimeLeak);

  const main = page.locator("main").first();
  await expect(main).toBeVisible({ timeout: 30_000 });
  const box = await main.boundingBox();
  expect(box?.width ?? 0, `${label} main width`).toBeGreaterThan(100);
  expect(box?.height ?? 0, `${label} main height`).toBeGreaterThan(40);
}

async function prepareDesktopSidebar(page: Page) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.setItem(
      "hh.sidebarSections",
      JSON.stringify({
        PROJECTS: true,
        OPERATIONS: true,
        FINANCE: true,
        LABOR: true,
        PEOPLE: true,
        SYSTEM: true,
      })
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('nav a[href="/dashboard"]').first()).toBeVisible({ timeout: 30_000 });
}

async function clickSidebarRoute(page: Page, href: string, label: string, testInfo: TestInfo) {
  const link = page.locator(`nav a[href="${href}"]`).first();
  await expect(link, `${label} sidebar link`).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegex(href)}(?:[/?#]|$)`), {
    timeout: 45_000,
  });
  await expectHealthyPage(page, label, testInfo);
}

async function selectCustomer(page: Page, customerName: string): Promise<void> {
  await page
    .getByRole("button", { name: /^Select customer$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Select customer" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Search by name or email").fill(customerName);
  await dialog.getByRole("button", { name: new RegExp(escapeRegex(customerName)) }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function createCustomer(
  page: Page,
  params: { name: string; email: string; address: string }
) {
  customerNames.add(params.name);
  await page.goto("/customers", { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page, "customers-before-create", test.info());

  await page
    .getByRole("button", { name: /\+ New Customer|New customer/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "New customer" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const inputs = dialog.locator("input");
  await inputs.nth(0).fill(params.name);
  await inputs.nth(1).fill(params.email);
  await inputs.nth(2).fill("808-555-0100");
  await inputs.nth(3).fill("Playwright Contact");
  await inputs.nth(4).fill(params.address);
  await inputs.nth(5).fill("Created by full system smoke e2e.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const search = page.locator('input[placeholder="Search customers..."]:visible').first();
  const legacySearch = page.locator('input[placeholder="Search customers…"]:visible').first();
  await expect(search.or(legacySearch)).toBeVisible({ timeout: 30_000 });
  await search.or(legacySearch).fill(params.name);
  const link = page.getByRole("link", { name: params.name }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/\/customers\/[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: params.name })).toBeVisible({ timeout: 30_000 });
  return page.url();
}

async function createLinkedProject(
  page: Page,
  params: { customerName: string; projectName: string; address: string }
) {
  projectNames.add(params.projectName);
  await page.goto("/projects/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
    timeout: 30_000,
  });
  await selectCustomer(page, params.customerName);
  await expect(page.getByPlaceholder("Client or company name")).toHaveValue(params.customerName);
  await page.getByPlaceholder("Luxury Villa E").fill(params.projectName);
  await setProjectAddress(page, params.address);
  await page.locator('input[name="budget"]').fill("125000");
  await page.locator('select[name="status"]').selectOption("active");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects(?:[/?#]|$)/, { timeout: 30_000 });

  const search = page.getByTestId("projects-list-search-desktop");
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(params.projectName);
  await page
    .getByRole("link", { name: `Open project ${params.projectName}` })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+/, { timeout: 30_000 });
  await expect(page.locator("h1", { hasText: params.projectName }).first()).toBeVisible({
    timeout: 30_000,
  });
  return page.url();
}

async function setProjectAddress(page: Page, address: string) {
  const addressButton = page
    .getByRole("button", { name: /Add project address|Project address:/ })
    .first();
  await expect(addressButton).toBeVisible({ timeout: 10_000 });
  await addressButton.click();
  const dialog = page.getByRole("dialog", { name: "Address details" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Street address").fill(address);
  await dialog.getByRole("button", { name: "Save address" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: new RegExp(`Project address: ${escapeRegExp(address)}`) })
  ).toBeVisible({ timeout: 10_000 });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createEstimateForProject(
  page: Page,
  params: { customerName: string; projectName: string; lineTitle: string }
) {
  estimateClients.add(params.customerName);
  estimateProjects.add(params.projectName);
  await page.goto("/estimates/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });
  await selectCustomer(page, params.customerName);
  await page.getByPlaceholder("Project name").fill(params.projectName);
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  await page.getByLabel("Line item 1 title").fill(params.lineTitle);
  await page.getByLabel("Line item 1 quantity").fill("1");
  await page.getByLabel("Line item 1 unit price").fill("500");
  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByText(params.customerName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  return page.url();
}

async function createChangeOrderFromList(
  page: Page,
  params: { projectName: string; title: string }
): Promise<string> {
  changeOrderTitles.add(params.title);
  await page.goto("/change-orders", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /New Change Order/i }).click();
  await page.getByRole("menuitem", { name: params.projectName }).click({ force: true });
  await expect(page).toHaveURL(/\/projects\/[^/?#]+\/change-orders\/new/, { timeout: 30_000 });
  await page.getByPlaceholder("e.g. Additional scope").fill(params.title);
  await page.getByPlaceholder("Describe the change and reason.").fill("Full system e2e scope.");
  await page.locator('input[name="amount"]').fill("750");
  await page.getByRole("button", { name: "Create change order" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+\/change-orders\/(?!new(?:[/?#]|$))[^/?#]+/, {
    timeout: 30_000,
  });
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  return page.url();
}

async function selectNativeOptionByLabel(select: Locator, label: string) {
  await expect(select).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => select.locator("option").count(), {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    })
    .toBeGreaterThan(1);
  await select.selectOption({ label });
}

async function createInvoiceForProject(
  page: Page,
  params: { projectName: string; clientName: string; lineDescription: string }
) {
  invoiceClientNames.add(params.clientName);
  await page.goto("/financial/invoices/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "New Invoice" })).toBeVisible({
    timeout: 30_000,
  });
  await selectNativeOptionByLabel(
    page.getByTestId("invoice-new-project-select"),
    params.projectName
  );
  await page.getByPlaceholder("Client").fill(params.clientName);
  await page.getByLabel("Line item 1 description").fill(params.lineDescription);
  await page.getByLabel("Line item 1 quantity").fill("2");
  await page.getByTestId("invoice-new-line-1-rate-input").fill("125.5");
  const createButton = page.getByRole("button", { name: "Create draft invoice" });
  await expect(createButton).toBeEnabled({ timeout: 15_000 });
  await createButton.click();
  await expect(page).toHaveURL(/\/financial\/invoices\/(?!new(?:\/|$))[^/?#]+/, {
    timeout: 30_000,
  });
  await expect(page.getByText(params.clientName)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(params.lineDescription)).toBeVisible({ timeout: 30_000 });
  return page.url();
}

async function createQuickExpenseForProject(
  page: Page,
  params: { projectName: string; vendor: string }
) {
  expenseVendors.add(params.vendor);
  await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForExpensesQuerySuccess(page);
  await clickVisibleQuickExpenseButton(page);
  const dialog = page.getByRole("dialog", { name: /Quick expense/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  if (
    await dialog
      .getByText(/Supabase not configured/i)
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, "Browser Supabase client not configured.");
  }

  await dialog.locator("input[type='number']").fill("88.75");
  const vendorInput = dialog.locator("#quick-expense-vendor");
  await vendorInput.fill(params.vendor);
  await dialog.locator("#quick-expense-project-select").click();
  await page.getByRole("option", { name: params.projectName }).click();
  await waitForQuickExpenseProjectLabel(dialog, params.projectName);
  await vendorInput.fill("");
  await vendorInput.pressSequentially(params.vendor, { delay: 8 });
  await expect(vendorInput).toHaveValue(params.vendor);
  await page.waitForTimeout(150);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  if (
    await dialog
      .getByText(/Possible duplicate/i)
      .isVisible({ timeout: 4_000 })
      .catch(() => false)
  ) {
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
  }

  await expect
    .poll(
      async () => {
        const body = await page.locator("body").innerText();
        if (/save failed/i.test(body)) throw new Error("Quick expense save failed.");
        if (/expense saved/i.test(body) || body.includes(params.vendor)) return "done";
        return null;
      },
      { timeout: 120_000, intervals: [400, 800, 1200] }
    )
    .toBe("done");
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
}

async function createWorker(page: Page, workerName: string): Promise<string> {
  workerNames.add(workerName);
  await page.goto("/labor/workers/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^New Worker$/i })).toBeVisible({
    timeout: 30_000,
  });
  const form = page.locator("section").filter({ hasText: "Name" }).first();
  await form.locator("input").nth(0).fill(workerName);
  await form.locator("input").nth(1).fill("555-0100");
  await form.locator("input").nth(2).fill("E2E Labor");
  await form.locator('input[type="number"]').fill("200");
  await form.locator("textarea").fill("Created by full-system-smoke-and-data-flow.");
  await page.getByRole("button", { name: /^Create Worker$/i }).click();
  await page.waitForURL(
    (url) => /\/workers\/[^/?#]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 30_000 }
  );
  await expect(page.getByRole("heading", { name: workerName })).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname.split("/").filter(Boolean).pop() ?? "";
}

async function createLaborEntry(
  page: Page,
  params: { projectName: string; workerName: string; note: string }
) {
  await page.goto("/labor", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /^Add Entry$/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /^Add Daily Entry$/i });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await selectNativeOptionByLabel(dialog.locator("select").first(), params.projectName);
  await dialog.locator('input[type="date"]').fill(todayLocalISO());

  const workerRow = dialog.locator('[role="row"]').filter({ hasText: params.workerName }).first();
  const scroller = dialog.locator("div.overflow-y-auto, div.overflow-auto").first();
  for (let i = 0; i < 28; i += 1) {
    if (await workerRow.isVisible().catch(() => false)) break;
    await scroller.evaluate((el) => {
      el.scrollTop += Math.max(el.clientHeight, 120);
    });
    await page.waitForTimeout(75);
  }
  await expect(workerRow).toBeVisible({ timeout: 10_000 });
  await workerRow.getByRole("button", { name: /^AM$/ }).click();
  await dialog.getByPlaceholder("Optional").last().fill(params.note);
  await dialog.getByRole("button", { name: /^Save$/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
  await expect(page.locator("tbody tr, [role=row]").filter({ hasText: params.workerName }).first())
    .toBeVisible({ timeout: 30_000 })
    .catch(async () => {
      await expect(page.locator("body")).toContainText(params.workerName, { timeout: 30_000 });
    });
}

async function createReimbursement(
  page: Page,
  params: { projectName: string; workerName: string; vendor: string }
) {
  await page.goto("/labor/reimbursements", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^\+ New Reimbursement$/i }).click();
  const form = page.locator("form").filter({ hasText: "Worker" }).first();
  await expect(form).toBeVisible({ timeout: 20_000 });
  await selectNativeOptionByLabel(form.locator("select").nth(0), params.workerName);
  await selectNativeOptionByLabel(form.locator("select").nth(1), params.projectName);
  await form.locator('input[type="date"]').fill(todayLocalISO());
  await form.getByPlaceholder("Vendor").fill(params.vendor);
  await form.locator('input[type="number"]').fill("30");
  await form.getByPlaceholder("Link").fill("https://example.test/e2e-reimbursement-receipt.png");
  await form.getByPlaceholder("Description").fill("full system smoke reimbursement");
  await form.getByRole("button", { name: /^Save$/i }).click();
  await expect(form).not.toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: params.vendor })
      .filter({ hasText: params.workerName })
  ).toBeVisible({ timeout: 30_000 });
}

async function selectProjectDetailMoreTab(page: Page, tabName: string) {
  await page.getByRole("button", { name: /^More/i }).click();
  await page.getByRole("menuitem", { name: tabName, exact: true }).click();
}

async function expectVisibleLinkHref(page: Page, hrefPath: string) {
  await expect(page.locator(`a[href="${hrefPath}"]`).first()).toBeVisible({ timeout: 30_000 });
}

test.afterEach(async () => {
  await cleanupFullSystemData();
  customerNames.clear();
  projectNames.clear();
  estimateClients.clear();
  estimateProjects.clear();
  changeOrderTitles.clear();
  invoiceClientNames.clear();
  expenseVendors.clear();
  workerNames.clear();
});

test("sidebar smoke loads every major module without crashes", async ({ page }, testInfo) => {
  const issues = attachRuntimeCollectors(page);
  await prepareDesktopSidebar(page);
  await expectHealthyPage(page, "dashboard", testInfo);

  const modules = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Projects", href: "/projects" },
    { label: "Estimates", href: "/estimates" },
    { label: "Change Orders", href: "/change-orders" },
    { label: "Customers", href: "/customers" },
    { label: "Tasks", href: "/tasks" },
    { label: "Punch List", href: "/punch-list" },
    { label: "Schedule", href: "/schedule" },
    { label: "Site Photos", href: "/site-photos" },
    { label: "Inspection Log", href: "/inspection-log" },
    { label: "Material Catalog", href: "/materials/catalog" },
    { label: "Inbox draft", href: "/financial/inbox" },
    { label: "Owner dashboard", href: "/financial/owner" },
    { label: "Invoices", href: "/financial/invoices" },
    { label: "Payments Received", href: "/financial/payments" },
    { label: "Commission Payments", href: "/financial/commissions" },
    { label: "Deposits", href: "/financial/deposits" },
    { label: "Bills", href: "/bills" },
    { label: "Expenses", href: "/financial/expenses" },
    { label: "Accounts", href: "/financial/accounts" },
    { label: "Time Entries", href: "/labor" },
    { label: "Reimbursements", href: "/labor/reimbursements" },
    { label: "Worker Balances", href: "/labor/worker-balances" },
    { label: "Worker Payments", href: "/labor/payments" },
    { label: "Worker Advances", href: "/labor/advances" },
    { label: "Receipt Uploads", href: "/labor/receipts" },
    { label: "Worker Profile", href: "/workers" },
    { label: "Worker Summary", href: "/workers/summary" },
    { label: "Vendors", href: "/labor/subcontractors" },
    { label: "Subcontractors", href: "/subcontractors" },
    { label: "Documents", href: "/documents" },
    { label: "Settings", href: "/settings" },
  ];

  for (const mod of modules) {
    await clickSidebarRoute(page, mod.href, mod.label, testInfo);
  }

  await expectRuntimeClean(page, testInfo, issues);
});

test("creates linked system data and verifies cross-module flow", async ({ page }, testInfo) => {
  const issues = attachRuntimeCollectors(page);
  const suffix = Date.now();
  const names: FlowNames = {
    customerName: `PW Full Customer ${suffix}`,
    projectName: `PW Full Project ${suffix}`,
    estimateLineTitle: `PW full estimate line ${suffix}`,
    changeOrderTitle: `PW full change order ${suffix}`,
    invoiceClientName: `PW Full Invoice Client ${suffix}`,
    invoiceLineDescription: `PW full invoice line ${suffix}`,
    expenseVendor: `E2E-QE-FSYS-${suffix}`,
    workerName: `[E2E] Labor Full ${suffix}`,
    reimbursementVendor: `[E2E] Vendor ${suffix}`,
  };
  const address = `500 Full Smoke Ave ${suffix}`;

  const customerUrl = await createCustomer(page, {
    name: names.customerName,
    email: `pw-full-${suffix}@example.com`,
    address,
  });
  const customerPath = new URL(customerUrl).pathname;

  const projectUrl = await createLinkedProject(page, {
    customerName: names.customerName,
    projectName: names.projectName,
    address,
  });
  const projectPath = new URL(projectUrl).pathname;

  const estimateUrl = await createEstimateForProject(page, {
    customerName: names.customerName,
    projectName: names.projectName,
    lineTitle: names.estimateLineTitle,
  });
  const estimatePath = new URL(estimateUrl).pathname;

  const changeOrderUrl = await createChangeOrderFromList(page, {
    projectName: names.projectName,
    title: names.changeOrderTitle,
  });
  const changeOrderPath = new URL(changeOrderUrl).pathname;

  const invoiceUrl = await createInvoiceForProject(page, {
    projectName: names.projectName,
    clientName: names.invoiceClientName,
    lineDescription: names.invoiceLineDescription,
  });
  const invoicePath = new URL(invoiceUrl).pathname.replace(/\/preview$/, "");

  await createQuickExpenseForProject(page, {
    projectName: names.projectName,
    vendor: names.expenseVendor,
  });

  await createWorker(page, names.workerName);
  await createLaborEntry(page, {
    projectName: names.projectName,
    workerName: names.workerName,
    note: `full system labor ${suffix}`,
  });
  await createReimbursement(page, {
    projectName: names.projectName,
    workerName: names.workerName,
    vendor: names.reimbursementVendor,
  });

  await page.goto(projectUrl, { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page, "project-detail", testInfo);
  await expect(page.getByText(names.customerName).first()).toBeVisible({ timeout: 30_000 });
  await expectVisibleLinkHref(page, customerPath);
  await expectVisibleLinkHref(page, estimatePath);

  await page.getByRole("tab", { name: "Cost" }).click();
  await expectVisibleLinkHref(page, invoicePath);

  await selectProjectDetailMoreTab(page, "Expenses");
  await expect(page.getByText(names.expenseVendor).first()).toBeVisible({ timeout: 30_000 });

  await selectProjectDetailMoreTab(page, "Change Orders");
  await expectVisibleLinkHref(page, changeOrderPath);
  await expect(page.getByText(names.changeOrderTitle).first()).toBeVisible({ timeout: 30_000 });

  await selectProjectDetailMoreTab(page, "Labor");
  await expect(page.getByText(names.workerName).first()).toBeVisible({ timeout: 30_000 });

  await page.goto(customerUrl, { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page, "customer-detail", testInfo);
  await expectVisibleLinkHref(page, projectPath);
  await expectVisibleLinkHref(page, estimatePath);
  await expectVisibleLinkHref(page, changeOrderPath);

  await page.goto("/financial/owner", { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page, "owner-dashboard", testInfo);

  await page.goto("/financial/expenses", { waitUntil: "domcontentloaded" });
  await waitForExpensesQuerySuccess(page);
  await expensesVendorSearch(page).fill(names.projectName);
  await expect(expenseListRow(page, names.projectName)).toBeVisible({ timeout: 30_000 });

  await page.goto("/labor/reimbursements", { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page, "reimbursements-list", testInfo);
  const reimbursementRow = page
    .locator("tbody tr")
    .filter({ hasText: names.reimbursementVendor })
    .filter({ hasText: names.workerName })
    .first();
  await expect(reimbursementRow).toBeVisible({ timeout: 30_000 });

  await cleanupFullSystemData();
  await expectNoDbResiduals(names);
  await expectRuntimeClean(page, testInfo, issues);
});

test("mobile primary actions stay reachable without blocking overlays", async ({
  page,
}, testInfo) => {
  const issues = attachRuntimeCollectors(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const checks = [
    { label: "Projects mobile", href: "/projects", action: "New project" },
    { label: "Estimates mobile", href: "/estimates", action: "New estimate" },
    { label: "Change Orders mobile", href: "/change-orders", action: "New change order" },
    { label: "Customers mobile", href: "/customers", action: "New customer" },
    { label: "Invoices mobile", href: "/financial/invoices", action: "New invoice" },
    { label: "Expenses mobile", href: "/financial/expenses", action: "Quick" },
    { label: "Labor mobile", href: "/labor", action: "Add entry" },
    { label: "Workers mobile", href: "/workers", action: "Add worker" },
    { label: "Documents mobile", href: "/documents", action: "Upload" },
    { label: "Settings mobile", href: "/settings", action: "Company" },
  ];

  for (const check of checks) {
    await page.goto(check.href, { waitUntil: "domcontentloaded" });
    await expectHealthyPage(page, check.label, testInfo);
    await expect(
      page
        .getByRole("button", { name: new RegExp(escapeRegex(check.action), "i") })
        .or(page.getByRole("link", { name: new RegExp(escapeRegex(check.action), "i") }))
        .first()
    ).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            pointerEvents: getComputedStyle(document.body).pointerEvents,
            openDialogs: document.querySelectorAll('[role="dialog"]').length,
          })),
        { timeout: 10_000 }
      )
      .toMatchObject({ pointerEvents: "auto", openDialogs: 0 });
  }

  await expectRuntimeClean(page, testInfo, issues);
});

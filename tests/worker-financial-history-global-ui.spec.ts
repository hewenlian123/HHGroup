import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { loadE2EProcessEnv } from "./e2e-load-env";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const RUN_ID = Date.now();
const WORKER_ID = randomUUID();
const INVOICE_ID = randomUUID();
const WORKER_NAME = `PW Financial History ${RUN_ID}`;
const INVOICE_AMOUNT = 125.55;

let admin: SupabaseClient | null = null;

function envClient(): SupabaseClient | null {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  assertE2EBaseUrlSafeForMutations(BASE, "worker financial history global UI");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function cleanup(client: SupabaseClient) {
  for (const operation of [
    () => client.from("worker_invoices").delete().eq("id", INVOICE_ID),
    () => client.from("worker_reimbursements").delete().eq("worker_id", WORKER_ID),
    () => client.from("labor_workers").delete().eq("id", WORKER_ID),
    () => client.from("workers").delete().eq("id", WORKER_ID),
  ]) {
    const result = await operation();
    expect(result.error).toBeNull();
  }
}

async function seed(client: SupabaseClient) {
  await cleanup(client);
  const worker = await client
    .from("workers")
    .insert({ id: WORKER_ID, name: WORKER_NAME, status: "active" })
    .select("id")
    .single();
  expect(worker.error).toBeNull();
  const laborWorker = await client
    .from("labor_workers")
    .upsert({ id: WORKER_ID, name: WORKER_NAME, active: true, rate: 0, type: "QA" })
    .select("id")
    .single();
  expect(laborWorker.error).toBeNull();
  const reimbursement = await client.from("worker_reimbursements").insert({
    worker_id: WORKER_ID,
    amount: INVOICE_AMOUNT,
    vendor: "PW financial history",
    description: "PW financial history reimbursement",
    reimbursement_date: "2026-09-02",
    status: "pending",
  });
  expect(reimbursement.error).toBeNull();
  const invoice = await client.from("worker_invoices").insert({
    id: INVOICE_ID,
    worker_id: WORKER_ID,
    amount: INVOICE_AMOUNT,
    invoice_file: "",
    status: "unpaid",
  });
  expect(invoice.error).toBeNull();
}

async function expectNoRootOverflow(page: Page, viewport: number) {
  expect(
    await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth),
    `${viewport}px viewport has no root horizontal overflow`
  ).toBe(true);
}

test.describe("Worker financial-history global UI", () => {
  test.beforeAll(async () => {
    admin = envClient();
    if (admin) await seed(admin);
  });

  test.afterAll(async () => {
    if (admin) await cleanup(admin);
  });

  test("keeps the same balance and invoice amounts in dense and stacked records", async ({
    page,
  }) => {
    test.skip(!admin, "Local Supabase service-role environment is required.");
    await loginAsE2EOwner(page, "/reports/workforce?tab=balances");

    await expect(page.getByTestId(`worker-balance-row-${WORKER_ID}`)).toContainText("$125.55");

    await page.setViewportSize({ width: 390, height: 844 });
    const balanceCard = page.getByTestId(`worker-balance-card-${WORKER_ID}`);
    await expect(balanceCard).toContainText("Reimbursements");
    await expect(balanceCard).toContainText("$125.55");
    const openWorker = balanceCard.getByRole("link", { name: "Open Worker", exact: true });
    await expect(openWorker).toBeVisible();
    expect((await openWorker.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoRootOverflow(page, 390);

    await loginAsE2EOwner(page, "/labor/worker-invoices");
    const invoiceCard = page.getByTestId(`worker-invoice-card-${INVOICE_ID}`);
    await expect(invoiceCard).toContainText(WORKER_NAME);
    await expect(invoiceCard).toContainText("$125.55");
    await expect(invoiceCard.getByRole("button", { name: /actions for invoice/i })).toBeVisible();
    await expectNoRootOverflow(page, 390);

    await loginAsE2EOwner(page, `/labor/workers/${WORKER_ID}/balance`);
    const summary = page.getByTestId("worker-balance-summary");
    await expect(summary).toContainText("Reimbursements");
    await expect(summary).toContainText("$125.55");
    const backToBalances = page.getByRole("link", { name: "Back to Balances", exact: true });
    await expect(backToBalances).toBeVisible();
    expect((await backToBalances.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoRootOverflow(page, 390);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId("worker-balance-summary")).toContainText("$125.55");
    await expectNoRootOverflow(page, 1440);
  });
});

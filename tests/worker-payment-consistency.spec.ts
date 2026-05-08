import { test, expect, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { allowWorkerPaymentMutations } from "./e2e-env-helpers";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const RUN_TAG = `PW Pay Consistency ${Date.now()}`;

type BalanceResponse = {
  summary: {
    laborOwed: number;
    reimbursements: number;
    payments: number;
    advances: number;
    balance: number;
  };
  laborEntries: Array<{
    id: string;
    amount: number;
    workerPaymentId: string | null;
    payrollSettled: boolean;
  }>;
  reimbursements: Array<{ id: string; amount: number; status: string }>;
};

const ids = {
  project: randomUUID(),
  worker: randomUUID(),
  laborPaid: randomUUID(),
  laborRemaining: randomUUID(),
  reimbursement: randomUUID(),
};

let admin: SupabaseClient | null = null;

function envClient(): SupabaseClient | null {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key);
}

async function insertFirstSuccess(
  client: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[]
): Promise<void> {
  let last = "";
  for (const payload of variants) {
    const { error } = await client.from(table).insert(payload);
    if (!error) return;
    last = error.message ?? "";
    if (!/column|schema cache|could not find|unknown field|foreign key|23503/i.test(last)) break;
  }
  throw new Error(`Failed to seed ${table}: ${last || "unknown error"}`);
}

async function upsertFirstSuccess(
  client: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[],
  onConflict = "id"
): Promise<void> {
  let last = "";
  for (const payload of variants) {
    const { error } = await client.from(table).upsert(payload, { onConflict });
    if (!error) return;
    last = error.message ?? "";
    if (!/column|schema cache|could not find|unknown field|foreign key|23503/i.test(last)) break;
  }
  throw new Error(`Failed to seed ${table}: ${last || "unknown error"}`);
}

async function cleanupSeedRows(client: SupabaseClient): Promise<void> {
  await client.from("worker_reimbursements").delete().eq("worker_id", ids.worker);
  await client.from("worker_payments").delete().eq("worker_id", ids.worker);
  await client.from("labor_entries").delete().eq("worker_id", ids.worker);
  await client.from("labor_workers").delete().eq("id", ids.worker);
  await client.from("workers").delete().eq("id", ids.worker);
  await client.from("projects").delete().eq("id", ids.project);
}

async function seedConsistencyRows(client: SupabaseClient): Promise<void> {
  await cleanupSeedRows(client);

  await insertFirstSuccess(client, "projects", [
    {
      id: ids.project,
      name: `${RUN_TAG} Project`,
      status: "active",
      budget: 0,
      spent: 0,
    },
    {
      id: ids.project,
      name: `${RUN_TAG} Project`,
      status: "active",
    },
  ]);

  await insertFirstSuccess(client, "workers", [
    {
      id: ids.worker,
      name: `${RUN_TAG} Worker`,
      half_day_rate: 0,
      status: "active",
      notes: RUN_TAG,
    },
    {
      id: ids.worker,
      name: `${RUN_TAG} Worker`,
      status: "active",
    },
  ]);

  await upsertFirstSuccess(client, "labor_workers", [
    {
      id: ids.worker,
      name: `${RUN_TAG} Worker`,
      active: true,
      rate: 0,
      type: "Sub",
    },
    {
      id: ids.worker,
      name: `${RUN_TAG} Worker`,
    },
  ]);

  const today = new Date();
  const dateA = new Date(today);
  dateA.setUTCDate(today.getUTCDate() - 3);
  const dateB = new Date(today);
  dateB.setUTCDate(today.getUTCDate() - 2);
  const laborBase = {
    worker_id: ids.worker,
    project_id: ids.project,
    cost_code: "TEST",
    status: "Approved",
    morning: true,
    afternoon: false,
    notes: RUN_TAG,
    worker_payment_id: null,
  };
  await insertFirstSuccess(client, "labor_entries", [
    {
      ...laborBase,
      id: ids.laborPaid,
      work_date: dateA.toISOString().slice(0, 10),
      cost_amount: 50,
    },
    {
      id: ids.laborPaid,
      worker_id: ids.worker,
      work_date: dateA.toISOString().slice(0, 10),
      cost_amount: 50,
      status: "Approved",
      morning: true,
      afternoon: false,
      worker_payment_id: null,
      notes: RUN_TAG,
    },
    {
      id: ids.laborPaid,
      worker_id: ids.worker,
      work_date: dateA.toISOString().slice(0, 10),
      cost_amount: 50,
      status: "Approved",
      notes: RUN_TAG,
    },
  ]);
  await insertFirstSuccess(client, "labor_entries", [
    {
      ...laborBase,
      id: ids.laborRemaining,
      work_date: dateB.toISOString().slice(0, 10),
      cost_amount: 75,
    },
    {
      id: ids.laborRemaining,
      worker_id: ids.worker,
      work_date: dateB.toISOString().slice(0, 10),
      cost_amount: 75,
      status: "Approved",
      morning: true,
      afternoon: false,
      worker_payment_id: null,
      notes: RUN_TAG,
    },
    {
      id: ids.laborRemaining,
      worker_id: ids.worker,
      work_date: dateB.toISOString().slice(0, 10),
      cost_amount: 75,
      status: "Approved",
      notes: RUN_TAG,
    },
  ]);

  await insertFirstSuccess(client, "worker_reimbursements", [
    {
      id: ids.reimbursement,
      worker_id: ids.worker,
      project_id: ids.project,
      amount: 30,
      description: RUN_TAG,
      vendor: `${RUN_TAG} Vendor`,
      status: "pending",
      reimbursement_date: today.toISOString().slice(0, 10),
    },
    {
      id: ids.reimbursement,
      worker_id: ids.worker,
      project_id: ids.project,
      amount: 30,
      vendor: `${RUN_TAG} Vendor`,
      status: "pending",
    },
  ]);
}

async function skipIfBackendUnavailable(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  if (
    await page
      .getByText(/Supabase is not configured|Failed to load/i)
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, "Backend / Supabase unavailable.");
  }
}

async function balanceJson(page: Page): Promise<BalanceResponse> {
  const res = await page.request.get(
    `/api/labor/workers/${encodeURIComponent(ids.worker)}/balance?t=${Date.now()}`
  );
  if (!res.ok()) {
    expect(res.ok(), `GET balance failed: ${res.status()} ${await res.text()}`).toBe(true);
  }
  return (await res.json()) as BalanceResponse;
}

function expectMoney(actual: number, expected: number) {
  expect(Math.round(actual * 100)).toBe(Math.round(expected * 100));
}

function totalAmount(dialog: Locator) {
  return dialog
    .locator("p.text-sm.font-semibold")
    .filter({ hasText: "Total Payment Amount" })
    .locator("span.tabular-nums");
}

async function closeAnyReceiptPreview(page: Page) {
  const receipt = page.getByRole("dialog", { name: /Receipt preview/i });
  if (await receipt.isVisible({ timeout: 10_000 }).catch(() => false)) {
    const close = receipt.getByRole("button", { name: /^Close$/i });
    if (await close.isVisible().catch(() => false)) {
      await close.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(receipt).not.toBeVisible({ timeout: 20_000 });
  }
}

test.describe("Worker payment consistency", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(async () => {
    admin = envClient();
    if (!admin) return;
    await seedConsistencyRows(admin);
  });

  test.afterAll(async () => {
    if (admin) await cleanupSeedRows(admin);
  });

  test("partial pay settles only selected items and leaves modal selecting the remaining balance", async ({
    page,
  }, testInfo) => {
    test.skip(
      !allowWorkerPaymentMutations(testInfo),
      'Pick Playwright project "chromium-payments", use localhost, or set E2E_ALLOW_PAYMENT_MUTATIONS=1.'
    );
    test.skip(!admin, "Supabase service role env is not available.");

    await page.goto(`${BASE}/labor/workers/${encodeURIComponent(ids.worker)}/balance`);
    await skipIfBackendUnavailable(page);
    await expect(page.getByRole("heading", { name: new RegExp(RUN_TAG) })).toBeVisible({
      timeout: 30_000,
    });

    const before = await balanceJson(page);
    expectMoney(before.summary.laborOwed, 125);
    expectMoney(before.summary.reimbursements, 30);
    expectMoney(before.summary.payments, 0);
    expectMoney(before.summary.balance, 155);

    await page.getByRole("button", { name: "Pay Worker" }).click();
    const dialog = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(dialog).toBeVisible();
    await expect(totalAmount(dialog)).toHaveText("$155.00");

    await dialog
      .locator("label")
      .filter({ hasText: "$75.00" })
      .locator('input[type="checkbox"]')
      .uncheck();
    await dialog
      .locator("label")
      .filter({ hasText: "$30.00" })
      .locator('input[type="checkbox"]')
      .uncheck();
    await expect(totalAmount(dialog)).toHaveText("$50.00");

    const payPost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/labor/workers/") &&
        r.url().includes("/pay") &&
        r.request().method() === "POST",
      { timeout: 65_000 }
    );
    await dialog.getByRole("button", { name: "Confirm Payment" }).click();
    const payResp = await payPost;
    const payText = await payResp.text().catch(() => "");
    expect(payResp.ok(), `POST /pay failed (${payResp.status()}): ${payText}`).toBe(true);
    const posted = payResp.request().postDataJSON() as {
      labor_entry_ids?: string[];
      reimbursement_ids?: string[];
    };
    expect(posted.labor_entry_ids).toEqual([ids.laborPaid]);
    expect(posted.reimbursement_ids).toEqual([]);
    await expect(dialog).not.toBeVisible({ timeout: 30_000 });
    await closeAnyReceiptPreview(page);

    const { data: laborLinks, error: laborLinkError } = await admin!
      .from("labor_entries")
      .select("id, worker_payment_id")
      .in("id", [ids.laborPaid, ids.laborRemaining]);
    expect(laborLinkError).toBeNull();
    const paidLink = (laborLinks ?? []).find((r) => r.id === ids.laborPaid)?.worker_payment_id;
    const remainingLink = (laborLinks ?? []).find(
      (r) => r.id === ids.laborRemaining
    )?.worker_payment_id;
    expect(paidLink).toBeTruthy();
    expect(remainingLink).toBeNull();

    const after = await balanceJson(page);
    const paidLabor = after.laborEntries.find((r) => r.id === ids.laborPaid);
    const remainingLabor = after.laborEntries.find((r) => r.id === ids.laborRemaining);
    expect(paidLabor?.workerPaymentId, JSON.stringify(after)).toBeTruthy();
    expect(paidLabor?.payrollSettled).toBe(true);
    expect(remainingLabor?.workerPaymentId).toBeNull();
    expect(remainingLabor?.payrollSettled).toBe(false);
    expectMoney(after.summary.laborOwed, 75);
    expectMoney(after.summary.reimbursements, 30);
    expectMoney(after.summary.payments, 50);
    expectMoney(after.summary.balance, 105);
    expect(after.reimbursements.find((r) => r.id === ids.reimbursement)?.status).toMatch(
      /^pending$/i
    );

    await page.getByRole("button", { name: "Pay Worker" }).click();
    const again = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(again).toBeVisible();
    await expect(again.locator("label").filter({ hasText: "$50.00" })).toHaveCount(0);
    await expect(
      again.locator("label").filter({ hasText: "$75.00" }).locator('input[type="checkbox"]')
    ).toBeChecked();
    await expect(
      again.locator("label").filter({ hasText: "$30.00" }).locator('input[type="checkbox"]')
    ).toBeChecked();
    await expect(totalAmount(again)).toHaveText("$105.00");
    await again.getByRole("button", { name: "Cancel" }).click();
    await expect(again).not.toBeVisible();

    const overlayState = await page.evaluate(() => ({
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      openDialogs: document.querySelectorAll('[role="dialog"]').length,
      fixedOverlays: document.querySelectorAll("[data-radix-dialog-overlay]").length,
    }));
    expect(overlayState.bodyPointerEvents).not.toBe("none");
    expect(overlayState.openDialogs).toBe(0);
    expect(overlayState.fixedOverlays).toBe(0);

    await page.reload();
    await skipIfBackendUnavailable(page);
    await expect(page.getByRole("heading", { name: new RegExp(RUN_TAG) })).toBeVisible({
      timeout: 30_000,
    });
    const refreshed = await balanceJson(page);
    expectMoney(refreshed.summary.laborOwed, 75);
    expectMoney(refreshed.summary.reimbursements, 30);
    expectMoney(refreshed.summary.payments, 50);
    expectMoney(refreshed.summary.balance, 105);

    await page.getByRole("button", { name: "Pay Worker" }).click();
    const afterRefresh = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(afterRefresh).toBeVisible();
    await expect(afterRefresh.locator("label").filter({ hasText: "$50.00" })).toHaveCount(0);
    await expect(totalAmount(afterRefresh)).toHaveText("$105.00");
    await afterRefresh.getByRole("button", { name: "Cancel" }).click();
  });
});

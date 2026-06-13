import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PREFIX = "LOCAL-REIMBURSEMENT-PAYCENTER-DELETE-ME";
const RUN_ID = Date.now();
const WORKER_ID = randomUUID();
const PROJECT_ID = randomUUID();
const PAID_PAYMENT_ID = randomUUID();
const PAID_REIMBURSEMENT_PAYMENT_ID = randomUUID();
const IDS = {
  june1: randomUUID(),
  june2: randomUUID(),
  june3: randomUUID(),
  may1: randomUUID(),
  may2: randomUUID(),
  paid: randomUUID(),
  juneReimb1: randomUUID(),
  juneReimb2: randomUUID(),
  juneReimb3: randomUUID(),
  mayReimb1: randomUUID(),
  mayReimb2: randomUUID(),
  paidReimbursement: randomUUID(),
  advance: randomUUID(),
};
const WORKER_NAME = `${PREFIX} Worker ${RUN_ID}`;
const PROJECT_NAME = `${PREFIX} Project ${RUN_ID}`;

type BalanceResponse = {
  summary: {
    laborOwed: number;
    reimbursements: number;
    advances: number;
    payments: number;
    balance: number;
  };
  laborEntries: Array<{ id: string; amount: number }>;
  reimbursements: Array<{ id: string; amount: number; status: string }>;
  advances: Array<{ id: string; amount: number; status: string }>;
  payments: Array<{ id: string; amount: number }>;
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

async function cleanupRows(client: SupabaseClient) {
  await client.from("worker_reimbursements").delete().eq("worker_id", WORKER_ID);
  await client.from("worker_advances").delete().eq("worker_id", WORKER_ID);
  await client.from("worker_payments").delete().eq("worker_id", WORKER_ID);
  await client.from("labor_entries").delete().eq("worker_id", WORKER_ID);
  await client.from("labor_workers").delete().eq("id", WORKER_ID);
  await client.from("workers").delete().eq("id", WORKER_ID);
  await client.from("projects").delete().eq("id", PROJECT_ID);
}

async function insertFirstSuccess(
  client: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[]
) {
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
) {
  let last = "";
  for (const payload of variants) {
    const { error } = await client.from(table).upsert(payload, { onConflict });
    if (!error) return;
    last = error.message ?? "";
    if (!/column|schema cache|could not find|unknown field|foreign key|23503/i.test(last)) break;
  }
  throw new Error(`Failed to upsert ${table}: ${last || "unknown error"}`);
}

async function seedRows(client: SupabaseClient) {
  await cleanupRows(client);

  await insertFirstSuccess(client, "projects", [
    {
      id: PROJECT_ID,
      name: PROJECT_NAME,
      status: "active",
      budget: 0,
      spent: 0,
    },
    { id: PROJECT_ID, name: PROJECT_NAME, status: "active" },
  ]);
  await insertFirstSuccess(client, "workers", [
    {
      id: WORKER_ID,
      name: WORKER_NAME,
      daily_rate: 580,
      half_day_rate: 290,
      status: "active",
      notes: PREFIX,
    },
    { id: WORKER_ID, name: WORKER_NAME, status: "active" },
  ]);
  await upsertFirstSuccess(client, "labor_workers", [
    { id: WORKER_ID, name: WORKER_NAME, active: true, rate: 580, type: "QA" },
    { id: WORKER_ID, name: WORKER_NAME },
  ]);
  await insertFirstSuccess(client, "worker_payments", [
    {
      id: PAID_PAYMENT_ID,
      worker_id: WORKER_ID,
      total_amount: 999,
      amount: 999,
      payment_method: "Cash",
      payment_date: "2026-06-20",
      note: `${PREFIX} pre-paid row`,
      labor_entry_ids: [IDS.paid],
    },
    {
      id: PAID_PAYMENT_ID,
      worker_id: WORKER_ID,
      total_amount: 999,
      payment_method: "Cash",
      created_at: "2026-06-20T12:00:00.000Z",
      labor_entry_ids: [IDS.paid],
    },
  ]);
  await insertFirstSuccess(client, "worker_payments", [
    {
      id: PAID_REIMBURSEMENT_PAYMENT_ID,
      worker_id: WORKER_ID,
      total_amount: 999,
      amount: 999,
      payment_method: "Cash",
      payment_date: "2026-05-30",
      note: `${PREFIX} pre-paid reimbursement`,
    },
    {
      id: PAID_REIMBURSEMENT_PAYMENT_ID,
      worker_id: WORKER_ID,
      total_amount: 999,
      payment_method: "Cash",
      created_at: "2026-05-30T12:00:00.000Z",
    },
  ]);

  const laborBase = {
    worker_id: WORKER_ID,
    project_id: PROJECT_ID,
    cost_code: "QA",
    status: "Approved",
    morning: true,
    afternoon: true,
    days_worked: 1,
    daily_rate_snapshot: 580,
    amount_snapshot: 580,
    labor_cost_snapshot: 580,
    cost_amount: 580,
    notes: PREFIX,
  };
  for (const [id, workDate] of [
    [IDS.june1, "2026-06-03"],
    [IDS.june2, "2026-06-04"],
    [IDS.june3, "2026-06-05"],
    [IDS.may1, "2026-05-12"],
    [IDS.may2, "2026-05-13"],
  ] as const) {
    await insertFirstSuccess(client, "labor_entries", [
      { ...laborBase, id, work_date: workDate, worker_payment_id: null },
      { ...laborBase, id, work_date: workDate },
    ]);
  }
  await insertFirstSuccess(client, "labor_entries", [
    {
      ...laborBase,
      id: IDS.paid,
      work_date: "2026-06-15",
      cost_amount: 999,
      amount_snapshot: 999,
      labor_cost_snapshot: 999,
      worker_payment_id: PAID_PAYMENT_ID,
    },
    {
      ...laborBase,
      id: IDS.paid,
      work_date: "2026-06-15",
      cost_amount: 999,
      amount_snapshot: 999,
      labor_cost_snapshot: 999,
      status: "paid",
    },
  ]);

  for (const [id, reimbursementDate, amount, vendor, status, paymentId] of [
    [IDS.juneReimb1, "2026-06-06", 35, `${PREFIX} June Vendor 1`, "pending", null],
    [IDS.juneReimb2, "2026-06-07", 80, `${PREFIX} June Vendor 2`, "approved", null],
    [IDS.juneReimb3, "2026-06-08", 120, `${PREFIX} June Vendor 3`, "open", null],
    [IDS.mayReimb1, "2026-05-11", 45, `${PREFIX} May Vendor 1`, "pending", null],
    [IDS.mayReimb2, "2026-05-12", 75, `${PREFIX} May Vendor 2`, "approved", null],
    [
      IDS.paidReimbursement,
      "2026-06-09",
      999,
      `${PREFIX} Paid Vendor`,
      "paid",
      PAID_REIMBURSEMENT_PAYMENT_ID,
    ],
  ] as const) {
    await insertFirstSuccess(client, "worker_reimbursements", [
      {
        id,
        worker_id: WORKER_ID,
        project_id: PROJECT_ID,
        amount,
        description: PREFIX,
        vendor,
        status,
        reimbursement_date: reimbursementDate,
        paid_at: status === "paid" ? "2026-05-30T12:00:00.000Z" : null,
        payment_id: paymentId,
      },
      {
        id,
        worker_id: WORKER_ID,
        project_id: PROJECT_ID,
        amount,
        description: PREFIX,
        vendor,
        status,
        reimbursement_date: reimbursementDate,
      },
      {
        id,
        worker_id: WORKER_ID,
        project_id: PROJECT_ID,
        amount,
        vendor,
        status,
      },
    ]);
  }
  await insertFirstSuccess(client, "worker_advances", [
    {
      id: IDS.advance,
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      amount: 50,
      status: "pending",
      advance_date: "2026-06-02",
      notes: `${PREFIX} advance`,
    },
    {
      id: IDS.advance,
      worker_id: WORKER_ID,
      amount: 50,
      status: "pending",
      advance_date: "2026-06-02",
    },
  ]);
}

async function balanceJson(page: Page): Promise<BalanceResponse> {
  const res = await page.request.get(
    `/api/labor/workers/${encodeURIComponent(WORKER_ID)}/balance?t=${Date.now()}`
  );
  expect(res.ok(), `GET balance failed: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as BalanceResponse;
}

function expectMoney(actual: number, expected: number) {
  expect(Math.round(actual * 100)).toBe(Math.round(expected * 100));
}

async function closeAnyReceiptPreview(
  page: Page,
  expectedTotal = "$1,925.00",
  expectAdvance = true
) {
  const receipt = page.getByRole("dialog", { name: /Receipt preview/i });
  if (await receipt.isVisible({ timeout: 20_000 }).catch(() => false)) {
    await expect(receipt.getByText(WORKER_NAME)).toBeVisible();
    await expect(receipt.getByText(expectedTotal).first()).toBeVisible();
    if (expectAdvance) {
      await expect(receipt.getByText(/Advance deduction/i).first()).toBeVisible();
    }
    const close = receipt.getByRole("button", { name: /^Close$/i });
    if (await close.isVisible().catch(() => false)) await close.click();
    else await page.keyboard.press("Escape");
    await expect(receipt).not.toBeVisible({ timeout: 20_000 });
  }
}

test.describe("Worker Balance Pay Center", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    admin = envClient();
    if (!admin) return;
    await seedRows(admin);
  });

  test.afterAll(async () => {
    if (!admin) return;
    await cleanupRows(admin);
    const { data, error } = await admin
      .from("labor_entries")
      .select("id")
      .eq("worker_id", WORKER_ID);
    if (error) throw new Error(`Failed to verify cleanup: ${error.message}`);
    expect(data ?? []).toHaveLength(0);
  });

  test("selects reimbursement months, pays selected items, and leaves unselected months open", async ({
    page,
  }) => {
    test.skip(!admin, "Supabase service role env is not available.");

    await page.goto(`${BASE}/labor/workers/${encodeURIComponent(WORKER_ID)}/balance`);
    await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({
      timeout: 30_000,
    });

    const before = await balanceJson(page);
    expect(before.laborEntries.map((row) => row.id).sort()).toEqual(
      [IDS.june1, IDS.june2, IDS.june3, IDS.may1, IDS.may2].sort()
    );
    expectMoney(before.summary.laborOwed, 2900);
    expectMoney(before.summary.reimbursements, 355);
    expectMoney(before.summary.advances, 50);
    expectMoney(before.summary.balance, 3205);
    expect(before.reimbursements.map((row) => row.id).sort()).toEqual(
      [IDS.juneReimb1, IDS.juneReimb2, IDS.juneReimb3, IDS.mayReimb1, IDS.mayReimb2].sort()
    );

    const june = page.getByTestId("worker-balance-month-2026-06");
    const may = page.getByTestId("worker-balance-month-2026-05");
    await expect(june).toContainText("3 entries");
    await expect(june).toContainText("3 days");
    await expect(june).toContainText("$1,740.00");
    await expect(may).toContainText("2 entries");
    await expect(may).toContainText("2 days");
    await expect(may).toContainText("$1,160.00");
    await expect(june.locator("tbody tr")).toHaveCount(3);
    await expect(may.locator("tbody tr")).toHaveCount(0);

    const juneReimbursements = page.getByTestId("worker-balance-reimbursement-month-2026-06");
    const mayReimbursements = page.getByTestId("worker-balance-reimbursement-month-2026-05");
    await expect(juneReimbursements).toContainText("3 reimbursements");
    await expect(juneReimbursements).toContainText("$235.00");
    await expect(mayReimbursements).toContainText("2 reimbursements");
    await expect(mayReimbursements).toContainText("$120.00");
    await expect(juneReimbursements.locator("tbody tr")).toHaveCount(3);
    await expect(mayReimbursements.locator("tbody tr")).toHaveCount(0);
    await expect(page.getByText(`${PREFIX} Paid Vendor`)).toHaveCount(0);

    await juneReimbursements.getByRole("checkbox", { name: /Select June 2026/i }).check();
    await expect(page.getByText("3 items · $235.00")).toBeVisible();

    await june.getByRole("checkbox", { name: /Select June 2026/i }).check();
    await expect(page.getByText("3 entries · $1,740.00")).toBeVisible();
    await expect(page.getByText("$1,925.00").first()).toBeVisible();
    await page
      .getByRole("button", { name: /^Pay Selected$/i })
      .first()
      .click();

    const dialog = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Selected labor", { exact: true }).first()).toBeVisible();
    await expect(
      dialog.getByText("Selected reimbursements", { exact: true }).first()
    ).toBeVisible();
    await expect(dialog.getByText("$1,740.00").first()).toBeVisible();
    await expect(dialog.getByText("Reimbursements", { exact: true })).toBeVisible();
    await expect(dialog.getByText("$235.00").first()).toBeVisible();
    await expect(dialog.getByText("$35.00").first()).toBeVisible();
    await expect(dialog.getByText("-$50.00").first()).toBeVisible();
    await expect(dialog.getByText("$1,925.00").first()).toBeVisible();
    const reimbursementOption = dialog.locator("label", { hasText: "$80.00" }).first();
    await reimbursementOption.locator('input[type="checkbox"]').uncheck();
    await expect(dialog.getByText("$1,845.00").first()).toBeVisible();
    await reimbursementOption.locator('input[type="checkbox"]').check();
    await expect(dialog.getByText("$1,925.00").first()).toBeVisible();

    const payPost = page.waitForResponse(
      (res) =>
        res.url().includes("/api/labor/workers/") &&
        res.url().includes("/pay") &&
        res.request().method() === "POST",
      { timeout: 65_000 }
    );
    await dialog.getByRole("button", { name: /^Confirm Payment$/i }).click();
    const payResponse = await payPost;
    expect(payResponse.ok(), await payResponse.text()).toBe(true);
    const posted = payResponse.request().postDataJSON() as {
      amount?: number;
      advance_deduction_amount?: number;
      labor_entry_ids?: string[];
      reimbursement_ids?: string[];
    };
    expect(posted.labor_entry_ids?.sort()).toEqual([IDS.june1, IDS.june2, IDS.june3].sort());
    expect(posted.reimbursement_ids?.sort()).toEqual(
      [IDS.juneReimb1, IDS.juneReimb2, IDS.juneReimb3].sort()
    );
    expectMoney(Number(posted.advance_deduction_amount), 50);
    expectMoney(Number(posted.amount), 1925);

    await expect(dialog).not.toBeVisible({ timeout: 30_000 });
    await closeAnyReceiptPreview(page, "$1,925.00");

    const after = await balanceJson(page);
    expect(after.laborEntries.map((row) => row.id).sort()).toEqual([IDS.may1, IDS.may2].sort());
    expect(after.reimbursements.map((row) => row.id).sort()).toEqual(
      [IDS.mayReimb1, IDS.mayReimb2].sort()
    );
    expectMoney(after.summary.laborOwed, 1160);
    expectMoney(after.summary.reimbursements, 120);
    expectMoney(after.summary.advances, 0);
    expectMoney(after.summary.balance, 1280);

    await expect(page.getByTestId("worker-balance-month-2026-06")).toHaveCount(0);
    await expect(page.getByTestId("worker-balance-month-2026-05")).toContainText("$1,160.00");
    await expect(page.getByTestId("worker-balance-reimbursement-month-2026-06")).toHaveCount(0);
    await expect(page.getByTestId("worker-balance-reimbursement-month-2026-05")).toContainText(
      "$120.00"
    );

    await page.goto(`${BASE}/workers/${encodeURIComponent(WORKER_ID)}?tab=payments`);
    await expect(page.getByRole("heading", { name: WORKER_NAME })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("$1,925.00").first()).toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE}/labor/workers/${encodeURIComponent(WORKER_ID)}/balance`);
    await expect(page.getByTestId("worker-balance-month-2026-06")).toHaveCount(0);
    await expect(page.getByTestId("worker-balance-month-2026-05")).toBeVisible();
    await expect(page.getByTestId("worker-balance-reimbursement-month-2026-06")).toHaveCount(0);
    await expect(page.getByTestId("worker-balance-reimbursement-month-2026-05")).toBeVisible();

    await page
      .getByTestId("worker-balance-reimbursement-month-2026-05")
      .getByRole("checkbox", { name: /Select May 2026/i })
      .check();
    await expect(page.getByText("2 items · $120.00")).toBeVisible();
    await page
      .getByRole("button", { name: /^Pay Selected$/i })
      .first()
      .click();
    const reimbursementOnly = page.getByRole("dialog", { name: /Pay Worker/i });
    await expect(reimbursementOnly).toBeVisible();
    await expect(reimbursementOnly.getByText("0 entries · No month selected")).toBeVisible();
    await expect(reimbursementOnly.getByText("$120.00").first()).toBeVisible();
    await expect(reimbursementOnly.getByText("-$50.00")).toHaveCount(0);
    const reimbOnlyPost = page.waitForResponse(
      (res) =>
        res.url().includes("/api/labor/workers/") &&
        res.url().includes("/pay") &&
        res.request().method() === "POST",
      { timeout: 65_000 }
    );
    await reimbursementOnly.getByRole("button", { name: /^Confirm Payment$/i }).click();
    const reimbOnlyResponse = await reimbOnlyPost;
    expect(reimbOnlyResponse.ok(), await reimbOnlyResponse.text()).toBe(true);
    const reimbOnlyPosted = reimbOnlyResponse.request().postDataJSON() as {
      amount?: number;
      advance_deduction_amount?: number;
      labor_entry_ids?: string[];
      reimbursement_ids?: string[];
    };
    expect(reimbOnlyPosted.labor_entry_ids).toEqual([]);
    expect(reimbOnlyPosted.reimbursement_ids?.sort()).toEqual(
      [IDS.mayReimb1, IDS.mayReimb2].sort()
    );
    expectMoney(Number(reimbOnlyPosted.advance_deduction_amount), 0);
    expectMoney(Number(reimbOnlyPosted.amount), 120);
    await expect(reimbursementOnly).not.toBeVisible({ timeout: 30_000 });
    await closeAnyReceiptPreview(page, "$120.00", false);

    const finalBalance = await balanceJson(page);
    expect(finalBalance.laborEntries.map((row) => row.id).sort()).toEqual(
      [IDS.may1, IDS.may2].sort()
    );
    expect(finalBalance.reimbursements).toHaveLength(0);
    expectMoney(finalBalance.summary.laborOwed, 1160);
    expectMoney(finalBalance.summary.reimbursements, 0);
    expectMoney(finalBalance.summary.balance, 1160);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/labor/workers/${encodeURIComponent(WORKER_ID)}/balance`);
    await expect(page.getByTestId("worker-balance-month-2026-05")).toBeVisible({
      timeout: 30_000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const RUN_TAG = `PW Worker Rate Snapshot ${Date.now()}`;

const ids = {
  worker: randomUUID(),
  project: randomUUID(),
  initialRate: randomUUID(),
  workerInvoice: randomUUID(),
};

function makeApplyIds() {
  return {
    worker: randomUUID(),
    project: randomUUID(),
    initialRate: randomUUID(),
  };
}

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

async function cleanup(client: SupabaseClient): Promise<void> {
  await client.from("worker_payments").delete().eq("worker_id", ids.worker);
  await client.from("worker_invoices").delete().eq("worker_id", ids.worker);
  await client.from("labor_entries").delete().eq("worker_id", ids.worker);
  await client.from("worker_rate_history").delete().eq("worker_id", ids.worker);
  await client.from("labor_workers").delete().eq("id", ids.worker);
  await client.from("workers").delete().eq("id", ids.worker);
  await client.from("projects").delete().eq("id", ids.project);
}

async function cleanupApplyIds(
  client: SupabaseClient,
  applyIds: ReturnType<typeof makeApplyIds>
): Promise<void> {
  await client.from("worker_payments").delete().eq("worker_id", applyIds.worker);
  await client.from("worker_invoices").delete().eq("worker_id", applyIds.worker);
  await client.from("labor_entries").delete().eq("worker_id", applyIds.worker);
  await client.from("worker_rate_history").delete().eq("worker_id", applyIds.worker);
  await client.from("labor_workers").delete().eq("id", applyIds.worker);
  await client.from("workers").delete().eq("id", applyIds.worker);
  await client.from("projects").delete().eq("id", applyIds.project);
}

async function apiJson<T>(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await request.fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    data: body,
  });
  const json = (await response.json().catch(() => ({}))) as { message?: string };
  expect(response.ok(), `${method} ${path}: ${json.message ?? response.statusText()}`).toBe(true);
  return json as T;
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test("daily rate history snapshots protect old labor, balances, payroll, payments, and worker invoices", async ({
  request,
}) => {
  const admin = envClient();
  if (!admin) {
    test.skip(true, "Requires local E2E Supabase service role credentials.");
    return;
  }

  await cleanup(admin);

  await insertFirstSuccess(admin, "projects", [
    { id: ids.project, name: `${RUN_TAG} Project`, status: "active", budget: 0, spent: 0 },
    { id: ids.project, name: `${RUN_TAG} Project`, status: "active" },
  ]);
  await insertFirstSuccess(admin, "workers", [
    {
      id: ids.worker,
      name: `${RUN_TAG} Worker`,
      role: "Labor",
      phone: "555-0190",
      half_day_rate: 190,
      daily_rate: 190,
      status: "active",
      notes: RUN_TAG,
    },
  ]);
  await upsertFirstSuccess(admin, "labor_workers", [
    { id: ids.worker, name: `${RUN_TAG} Worker`, active: true, rate: 190, type: "Sub" },
    { id: ids.worker, name: `${RUN_TAG} Worker` },
  ]);
  await insertFirstSuccess(admin, "worker_rate_history", [
    {
      id: ids.initialRate,
      worker_id: ids.worker,
      rate_type: "daily",
      daily_rate: 190,
      effective_from: "2026-04-01",
      effective_to: null,
      notes: "initial E2E daily rate",
    },
  ]);

  await apiJson(request, "POST", `/api/labor/workers/${ids.worker}/rate-history`, {
    dailyRate: 240,
    effectiveFrom: "2026-05-01",
    notes: "May raise",
  });

  const april = await apiJson<{ id: string }>(request, "POST", "/api/labor/entries", {
    workerId: ids.worker,
    projectId: ids.project,
    workDate: "2026-04-10",
    hours: 1,
    costCode: "E2E",
    notes: `${RUN_TAG} April full day`,
  });
  const may = await apiJson<{ id: string }>(request, "POST", "/api/labor/entries", {
    workerId: ids.worker,
    projectId: ids.project,
    workDate: "2026-05-10",
    hours: 1,
    costCode: "E2E",
    notes: `${RUN_TAG} May full day`,
  });
  const halfDay = await apiJson<{ id: string }>(request, "POST", "/api/labor/entries", {
    workerId: ids.worker,
    projectId: ids.project,
    workDate: "2026-05-12",
    hours: 0.5,
    costCode: "E2E",
    notes: `${RUN_TAG} May half day`,
  });

  const { data: entryRows, error: entryErr } = await admin
    .from("labor_entries")
    .select(
      "id, work_date, cost_amount, daily_rate_snapshot, amount_snapshot, labor_cost_snapshot, days_worked"
    )
    .in("id", [april.id, may.id, halfDay.id])
    .order("work_date", { ascending: true });
  expect(entryErr?.message).toBeUndefined();

  const byId = new Map((entryRows ?? []).map((row) => [String(row.id), row]));
  expect(Number(byId.get(april.id)?.daily_rate_snapshot)).toBe(190);
  expect(Number(byId.get(april.id)?.cost_amount)).toBe(190);
  expect(Number(byId.get(april.id)?.amount_snapshot)).toBe(190);
  expect(Number(byId.get(may.id)?.daily_rate_snapshot)).toBe(240);
  expect(Number(byId.get(may.id)?.labor_cost_snapshot)).toBe(240);
  expect(Number(byId.get(halfDay.id)?.daily_rate_snapshot)).toBe(240);
  expect(Number(byId.get(halfDay.id)?.days_worked)).toBe(0.5);
  expect(Number(byId.get(halfDay.id)?.cost_amount)).toBe(120);

  await insertFirstSuccess(admin, "worker_invoices", [
    {
      id: ids.workerInvoice,
      worker_id: ids.worker,
      project_id: ids.project,
      amount: 33,
      status: "pending",
      created_at: "2026-05-10T12:00:00.000Z",
    },
    {
      id: ids.workerInvoice,
      worker_id: ids.worker,
      project_id: ids.project,
      amount: 33,
      created_at: "2026-05-10T12:00:00.000Z",
    },
  ]);

  const balanceBeforePay = await apiJson<{
    summary: { laborOwed: number; balance: number };
  }>(request, "GET", `/api/labor/workers/${ids.worker}/balance`);
  expect(balanceBeforePay.summary.laborOwed).toBeCloseTo(550, 2);

  const payrollBeforePay = await apiJson<{
    rows: Array<{ workerId: string; laborOwed: number; workerInvoices: number; earned: number }>;
  }>(request, "GET", "/api/labor/payroll-summary?fromDate=2026-04-01&toDate=2026-05-31");
  const payrollWorker = payrollBeforePay.rows.find((row) => row.workerId === ids.worker);
  expect(payrollWorker?.laborOwed).toBeCloseTo(550, 2);
  expect(payrollWorker?.workerInvoices).toBeCloseTo(33, 2);
  expect(payrollWorker?.earned).toBeCloseTo(583, 2);

  await apiJson(request, "POST", `/api/labor/workers/${ids.worker}/pay`, {
    amount: 550,
    payment_method: "Check",
    payment_date: "2026-05-13",
    notes: `${RUN_TAG} pay snapshots`,
    labor_entry_ids: [april.id, may.id, halfDay.id],
    reimbursement_ids: [],
  });

  await apiJson(request, "POST", `/api/labor/workers/${ids.worker}/rate-history`, {
    dailyRate: 300,
    effectiveFrom: "2026-05-15",
    notes: "later raise after payment",
  });

  const { data: afterRows, error: afterErr } = await admin
    .from("labor_entries")
    .select("id, cost_amount, daily_rate_snapshot, amount_snapshot")
    .in("id", [april.id, may.id, halfDay.id]);
  expect(afterErr?.message).toBeUndefined();
  const afterById = new Map((afterRows ?? []).map((row) => [String(row.id), row]));
  expect(Number(afterById.get(april.id)?.daily_rate_snapshot)).toBe(190);
  expect(Number(afterById.get(april.id)?.amount_snapshot)).toBe(190);
  expect(Number(afterById.get(may.id)?.daily_rate_snapshot)).toBe(240);
  expect(Number(afterById.get(halfDay.id)?.amount_snapshot)).toBe(120);

  const { data: paymentRows, error: paymentErr } = await admin
    .from("worker_payments")
    .select("total_amount")
    .eq("worker_id", ids.worker);
  expect(paymentErr?.message).toBeUndefined();
  expect((paymentRows ?? []).reduce((sum, row) => sum + Number(row.total_amount), 0)).toBeCloseTo(
    550,
    2
  );

  const { data: historyRows, error: historyErr } = await admin
    .from("worker_rate_history")
    .select("daily_rate, effective_from, effective_to, notes")
    .eq("worker_id", ids.worker)
    .order("effective_from", { ascending: true });
  expect(historyErr?.message).toBeUndefined();
  expect(historyRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        daily_rate: 190,
        effective_from: "2026-04-01",
        effective_to: "2026-04-30",
      }),
      expect.objectContaining({
        daily_rate: 240,
        effective_from: "2026-05-01",
        effective_to: "2026-05-14",
      }),
      expect.objectContaining({
        daily_rate: 300,
        effective_from: "2026-05-15",
        effective_to: null,
      }),
    ])
  );

  const payrollAfterRaise = await apiJson<{
    rows: Array<{ workerId: string; laborOwed: number; workerInvoices: number; earned: number }>;
  }>(request, "GET", "/api/labor/payroll-summary?fromDate=2026-04-01&toDate=2026-05-31");
  const payrollAfterWorker = payrollAfterRaise.rows.find((row) => row.workerId === ids.worker);
  expect(payrollAfterWorker?.laborOwed).toBeCloseTo(550, 2);
  expect(payrollAfterWorker?.workerInvoices).toBeCloseTo(33, 2);
  expect(payrollAfterWorker?.earned).toBeCloseTo(583, 2);

  await cleanup(admin);
});

test("backdated rate can explicitly update only unpaid labor entry snapshots", async ({
  request,
}) => {
  const admin = envClient();
  if (!admin) {
    test.skip(true, "Requires local E2E Supabase service role credentials.");
    return;
  }

  const applyIds = makeApplyIds();
  const runTag = `${RUN_TAG} Apply`;

  await cleanupApplyIds(admin, applyIds);

  try {
    await insertFirstSuccess(admin, "projects", [
      { id: applyIds.project, name: `${runTag} Project`, status: "active", budget: 0, spent: 0 },
      { id: applyIds.project, name: `${runTag} Project`, status: "active" },
    ]);
    await insertFirstSuccess(admin, "workers", [
      {
        id: applyIds.worker,
        name: `${runTag} Worker`,
        role: "Labor",
        phone: "555-0290",
        half_day_rate: 280,
        daily_rate: 280,
        status: "active",
        notes: runTag,
      },
    ]);
    await upsertFirstSuccess(admin, "labor_workers", [
      { id: applyIds.worker, name: `${runTag} Worker`, active: true, rate: 280, type: "Sub" },
      { id: applyIds.worker, name: `${runTag} Worker` },
    ]);
    await insertFirstSuccess(admin, "worker_rate_history", [
      {
        id: applyIds.initialRate,
        worker_id: applyIds.worker,
        rate_type: "daily",
        daily_rate: 280,
        effective_from: "2026-03-01",
        effective_to: null,
        notes: "initial apply E2E daily rate",
      },
    ]);

    const unpaidFull = await apiJson<{ id: string }>(request, "POST", "/api/labor/entries", {
      workerId: applyIds.worker,
      projectId: applyIds.project,
      workDate: "2026-04-10",
      hours: 1,
      costCode: "E2E",
      notes: `${runTag} unpaid April full day`,
    });
    const paidFull = await apiJson<{ id: string }>(request, "POST", "/api/labor/entries", {
      workerId: applyIds.worker,
      projectId: applyIds.project,
      workDate: "2026-04-12",
      hours: 1,
      costCode: "E2E",
      notes: `${runTag} paid April full day`,
    });
    const unpaidHalf = await apiJson<{ id: string }>(request, "POST", "/api/labor/entries", {
      workerId: applyIds.worker,
      projectId: applyIds.project,
      workDate: "2026-05-10",
      hours: 0.5,
      costCode: "E2E",
      notes: `${runTag} unpaid May half day`,
    });

    await apiJson(request, "POST", `/api/labor/workers/${applyIds.worker}/pay`, {
      amount: 280,
      payment_method: "Check",
      payment_date: "2026-04-13",
      notes: `${runTag} paid entry should stay frozen`,
      labor_entry_ids: [paidFull.id],
      reimbursement_ids: [],
    });

    const change = await apiJson<{
      history: { id: string; dailyRate: number; effectiveFrom: string; effectiveTo: string | null };
      applyToUnpaidPreview: {
        affectedCount: number;
        oldTotal: number;
        newTotal: number;
        difference: number;
      };
    }>(request, "POST", `/api/labor/workers/${applyIds.worker}/rate-history`, {
      dailyRate: 290,
      effectiveFrom: "2026-04-01",
      notes: "Backdated apply test",
    });

    expect(change.history.dailyRate).toBe(290);
    expect(change.history.effectiveFrom).toBe("2026-04-01");
    expect(change.applyToUnpaidPreview).toMatchObject({
      affectedCount: 2,
      oldTotal: 420,
      newTotal: 435,
      difference: 15,
    });

    const apply = await apiJson<{
      summary: { affectedCount: number; oldTotal: number; newTotal: number; difference: number };
    }>(request, "POST", `/api/labor/workers/${applyIds.worker}/rate-history/apply-unpaid`, {
      rateHistoryId: change.history.id,
    });
    expect(apply.summary).toMatchObject({
      affectedCount: 2,
      oldTotal: 420,
      newTotal: 435,
      difference: 15,
    });

    const { data: rows, error: rowsErr } = await admin
      .from("labor_entries")
      .select(
        "id, cost_amount, daily_rate_snapshot, amount_snapshot, labor_cost_snapshot, worker_payment_id, rate_history_id, notes"
      )
      .in("id", [unpaidFull.id, paidFull.id, unpaidHalf.id]);
    expect(rowsErr?.message).toBeUndefined();
    const byId = new Map((rows ?? []).map((row) => [String(row.id), row]));

    expect(Number(byId.get(unpaidFull.id)?.daily_rate_snapshot)).toBe(290);
    expect(Number(byId.get(unpaidFull.id)?.amount_snapshot)).toBe(290);
    expect(Number(byId.get(unpaidFull.id)?.labor_cost_snapshot)).toBe(290);
    expect(Number(byId.get(unpaidFull.id)?.cost_amount)).toBe(290);
    expect(byId.get(unpaidFull.id)?.rate_history_id).toBe(change.history.id);
    expect(String(byId.get(unpaidFull.id)?.notes ?? "")).toContain("Rate snapshot updated");

    expect(Number(byId.get(unpaidHalf.id)?.daily_rate_snapshot)).toBe(290);
    expect(Number(byId.get(unpaidHalf.id)?.amount_snapshot)).toBe(145);
    expect(Number(byId.get(unpaidHalf.id)?.labor_cost_snapshot)).toBe(145);
    expect(Number(byId.get(unpaidHalf.id)?.cost_amount)).toBe(145);
    expect(byId.get(unpaidHalf.id)?.rate_history_id).toBe(change.history.id);

    expect(Number(byId.get(paidFull.id)?.daily_rate_snapshot)).toBe(280);
    expect(Number(byId.get(paidFull.id)?.amount_snapshot)).toBe(280);
    expect(Number(byId.get(paidFull.id)?.cost_amount)).toBe(280);
    expect(String(byId.get(paidFull.id)?.worker_payment_id ?? "")).toBeTruthy();

    const balance = await apiJson<{ summary: { laborOwed: number; balance: number } }>(
      request,
      "GET",
      `/api/labor/workers/${applyIds.worker}/balance`
    );
    expect(balance.summary.laborOwed).toBeCloseTo(435, 2);
    expect(balance.summary.balance).toBeCloseTo(435, 2);

    const payroll = await apiJson<{
      rows: Array<{ workerId: string; laborOwed: number; paid: number; balance: number }>;
    }>(request, "GET", "/api/labor/payroll-summary?fromDate=2026-04-01&toDate=2030-12-31");
    const payrollWorker = payroll.rows.find((row) => row.workerId === applyIds.worker);
    expect(payrollWorker?.laborOwed).toBeCloseTo(715, 2);
    expect(payrollWorker?.paid).toBeCloseTo(280, 2);
    expect(payrollWorker?.balance).toBeCloseTo(435, 2);

    const { data: paymentRows, error: paymentErr } = await admin
      .from("worker_payments")
      .select("total_amount, labor_entry_ids")
      .eq("worker_id", applyIds.worker);
    expect(paymentErr?.message).toBeUndefined();
    expect((paymentRows ?? []).reduce((sum, row) => sum + Number(row.total_amount), 0)).toBe(280);
    expect(paymentRows?.[0]?.labor_entry_ids).toContain(paidFull.id);

    const { data: historyRows, error: historyErr } = await admin
      .from("worker_rate_history")
      .select("daily_rate, effective_from, effective_to")
      .eq("worker_id", applyIds.worker)
      .order("effective_from", { ascending: true });
    expect(historyErr?.message).toBeUndefined();
    expect(historyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          daily_rate: 280,
          effective_from: "2026-03-01",
          effective_to: "2026-03-31",
        }),
        expect.objectContaining({
          daily_rate: 290,
          effective_from: "2026-04-01",
          effective_to: null,
        }),
      ])
    );
  } finally {
    await cleanupApplyIds(admin, applyIds);
  }
});

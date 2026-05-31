import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = e2eTargetOrigin();
const LOAD_MS = 60_000;

type Supabase = SupabaseClient;

function supabaseForLocalMutations(): Supabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function cleanupMarkerData(supabase: Supabase, marker: string): Promise<void> {
  const { data: bills } = await supabase
    .from("ap_bills")
    .select("id")
    .or(`bill_no.ilike.%${marker}%,vendor_name.ilike.%${marker}%,notes.ilike.%${marker}%`);
  const billIds = (bills ?? []).map((row) => row.id).filter(Boolean);
  if (billIds.length > 0) {
    await supabase.from("ap_bill_payments").delete().in("bill_id", billIds);
  }

  await supabase
    .from("subcontract_payment_schedule")
    .delete()
    .or(`title.ilike.%${marker}%,description.ilike.%${marker}%`);

  if (billIds.length > 0) {
    await supabase.from("ap_bills").delete().in("id", billIds);
  }

  await supabase.from("subcontracts").delete().ilike("description", `%${marker}%`);
  await supabase.from("subcontractors").delete().ilike("name", `%${marker}%`);
  await supabase.from("projects").delete().ilike("name", `%${marker}%`);
}

async function createFixture(supabase: Supabase, marker: string) {
  const projectId = randomUUID();
  const subcontractorId = randomUUID();
  const subcontractId = randomUUID();
  const projectName = `${marker} Project`;
  const subcontractorName = `${marker} Electrical`;

  const { error: projectError } = await supabase.from("projects").insert({
    id: projectId,
    name: projectName,
    status: "Active",
    budget: 1000,
    contract_amount: 1000,
    spent: 0,
  });
  expect(projectError?.message ?? "").toBe("");

  const { error: subcontractorError } = await supabase.from("subcontractors").insert({
    id: subcontractorId,
    name: subcontractorName,
    active: true,
  });
  expect(subcontractorError?.message ?? "").toBe("");

  const { error: subcontractError } = await supabase.from("subcontracts").insert({
    id: subcontractId,
    project_id: projectId,
    subcontractor_id: subcontractorId,
    cost_code: `${marker}-ELEC`,
    contract_amount: 1000,
    description: `${marker} rough electrical package`,
  });
  expect(subcontractError?.message ?? "").toBe("");

  return { projectId, projectName, subcontractId, subcontractorId, subcontractorName };
}

async function addPaymentViaUi(
  page: Page,
  billId: string,
  params: { amount: string; method: string; notes: string }
): Promise<void> {
  await page.goto(`${BASE}/bills/${billId}`, { waitUntil: "domcontentloaded", timeout: LOAD_MS });
  await page.getByRole("button", { name: /^Add payment$/ }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible({ timeout: LOAD_MS });
  await dialog.locator('input[type="number"]').fill(params.amount);
  await dialog.getByPlaceholder("e.g. Check, ACH").fill(params.method);
  await dialog.locator("input").last().fill(params.notes);
  await dialog.getByRole("button", { name: /^Add payment$/ }).click();
  await expect(dialog).toBeHidden({ timeout: LOAD_MS });
  await page.reload({ waitUntil: "domcontentloaded" });
}

test.describe("subcontractor Phase 2 AP linkage", () => {
  test.describe.configure({ timeout: 240_000 });

  test("creates an AP bill from a subcontract payment schedule and reflects partial payment totals", async ({
    page,
  }, testInfo) => {
    test.skip(!allowDeleteMutations(testInfo), "Local subcontract AP mutation target required.");
    const supabase = supabaseForLocalMutations();
    if (!supabase) {
      test.skip(true, "Local Supabase service role env is required for fixture setup.");
      return;
    }

    const marker = `TEST-SUB-AP-${Date.now()}`;
    const scheduleTitle = `${marker} Rough-in`;
    await cleanupMarkerData(supabase, marker);
    const fixture = await createFixture(supabase, marker);

    try {
      await page.goto(
        `${BASE}/projects/${fixture.projectId}/subcontracts/${fixture.subcontractId}`,
        {
          waitUntil: "domcontentloaded",
          timeout: LOAD_MS,
        }
      );
      await expect(page.getByRole("heading", { name: "Contract Summary" })).toBeVisible({
        timeout: LOAD_MS,
      });
      await expect(page.getByRole("heading", { name: "Payment Schedule" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Linked AP Bills" })).toBeVisible();
      await expect(page.getByText("Contract Amount").first()).toBeVisible();
      await expect(page.getByText("AP Outstanding").first()).toBeVisible();

      const scheduleForm = page.locator("form").filter({
        has: page.getByPlaceholder("Deposit, rough-in, final"),
      });
      await scheduleForm.getByPlaceholder("Deposit, rough-in, final").fill(scheduleTitle);
      await scheduleForm.locator('input[type="number"]').fill("300");
      await scheduleForm.locator('input[type="date"]').fill("2026-06-15");
      await scheduleForm.getByRole("button", { name: /^Add$/ }).click();

      await expect(page.getByText(scheduleTitle).first()).toBeVisible({ timeout: LOAD_MS });
      await expect(page.locator("body")).toContainText(fmtUsd(300), { timeout: LOAD_MS });

      const { data: schedule, error: scheduleError } = await supabase
        .from("subcontract_payment_schedule")
        .select("id,ap_bill_id,amount,status")
        .eq("subcontract_id", fixture.subcontractId)
        .eq("title", scheduleTitle)
        .maybeSingle();
      expect(scheduleError?.message ?? "").toBe("");
      expect(schedule?.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(num(schedule?.amount)).toBe(300);
      expect(schedule?.ap_bill_id).toBeNull();

      const scheduleRow = page.locator("tr").filter({ hasText: scheduleTitle }).first();
      await scheduleRow.getByRole("button", { name: "Create AP Bill" }).click();
      await expect(
        page.locator("tr").filter({ hasText: scheduleTitle }).getByRole("link", {
          name: "View AP Bill",
        })
      ).toBeVisible({ timeout: LOAD_MS });

      const { data: billedSchedule, error: billedScheduleError } = await supabase
        .from("subcontract_payment_schedule")
        .select("id,ap_bill_id,status")
        .eq("id", schedule!.id)
        .maybeSingle();
      expect(billedScheduleError?.message ?? "").toBe("");
      expect(billedSchedule?.status).toBe("billed");
      expect(billedSchedule?.ap_bill_id).toMatch(/^[0-9a-f-]{36}$/i);
      const billId = billedSchedule!.ap_bill_id as string;

      const duplicate = await supabase.rpc("create_ap_bill_from_subcontract_schedule", {
        p_schedule_id: schedule!.id,
      });
      expect(duplicate.error?.message ?? "").toBe("");
      const duplicateRow = Array.isArray(duplicate.data) ? duplicate.data[0] : duplicate.data;
      expect(duplicateRow?.ap_bill_id).toBe(billId);
      expect(duplicateRow?.created).toBe(false);

      const { data: bill, error: billError } = await supabase
        .from("ap_bills")
        .select(
          "id,vendor_name,project_id,subcontractor_id,subcontract_id,amount,paid_amount,balance_amount,status,category,notes"
        )
        .eq("id", billId)
        .maybeSingle();
      expect(billError?.message ?? "").toBe("");
      expect(bill).toMatchObject({
        id: billId,
        vendor_name: fixture.subcontractorName,
        project_id: fixture.projectId,
        subcontractor_id: fixture.subcontractorId,
        subcontract_id: fixture.subcontractId,
        status: "Draft",
        category: "Subcontract",
      });
      expect(num(bill?.amount)).toBe(300);
      expect(num(bill?.paid_amount)).toBe(0);
      expect(num(bill?.balance_amount)).toBe(300);
      expect(String(bill?.notes ?? "")).toContain(scheduleTitle);

      await page.getByRole("link", { name: "View AP Bill" }).click();
      await expect(page).toHaveURL(new RegExp(`/bills/${billId}$`), { timeout: LOAD_MS });
      await expect(page.getByText(fixture.subcontractorName).first()).toBeVisible({
        timeout: LOAD_MS,
      });
      await expect(page.getByRole("link", { name: fixture.subcontractorName })).toBeVisible();
      await expect(page.getByText(fmtUsd(300)).first()).toBeVisible();

      await addPaymentViaUi(page, billId, {
        amount: "125",
        method: "Check",
        notes: `${marker} partial AP payment`,
      });
      await expect(page.getByText("Partially Paid", { exact: true }).first()).toBeVisible({
        timeout: LOAD_MS,
      });
      await expect(page.locator("body")).toContainText(fmtUsd(125), { timeout: LOAD_MS });
      await expect(page.locator("body")).toContainText(fmtUsd(175), { timeout: LOAD_MS });

      const { data: paidBill, error: paidBillError } = await supabase
        .from("ap_bills")
        .select("paid_amount,balance_amount,status")
        .eq("id", billId)
        .maybeSingle();
      expect(paidBillError?.message ?? "").toBe("");
      expect(num(paidBill?.paid_amount)).toBe(125);
      expect(num(paidBill?.balance_amount)).toBe(175);
      expect(paidBill?.status).toBe("Partially Paid");

      await page.goto(
        `${BASE}/projects/${fixture.projectId}/subcontracts/${fixture.subcontractId}`,
        {
          waitUntil: "domcontentloaded",
          timeout: LOAD_MS,
        }
      );
      await expect(page.getByRole("heading", { name: "Contract Summary" })).toBeVisible({
        timeout: LOAD_MS,
      });
      await expect(page.locator("body")).toContainText("Scheduled");
      await expect(page.locator("body")).toContainText("Billed To Date");
      await expect(page.locator("body")).toContainText("Paid To Date");
      await expect(page.locator("body")).toContainText("AP Outstanding");
      await expect(page.locator("body")).toContainText("Remaining Contract");
      await expect(page.locator("body")).toContainText(fmtUsd(300), { timeout: LOAD_MS });
      await expect(page.locator("body")).toContainText(fmtUsd(125), { timeout: LOAD_MS });
      await expect(page.locator("body")).toContainText(fmtUsd(175), { timeout: LOAD_MS });
      await expect(page.locator("body")).toContainText(fmtUsd(700), { timeout: LOAD_MS });
    } finally {
      await cleanupMarkerData(supabase, marker);
    }
  });
});

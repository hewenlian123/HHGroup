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

async function cleanupMarkerData(supabase: Supabase, marker: string): Promise<void> {
  const { data: bills } = await supabase
    .from("ap_bills")
    .select("id")
    .or(`bill_no.ilike.%${marker}%,vendor_name.ilike.%${marker}%,notes.ilike.%${marker}%`);
  const billIds = (bills ?? []).map((row) => row.id).filter(Boolean);
  if (billIds.length > 0) {
    await supabase.from("ap_bill_payments").delete().in("bill_id", billIds);
    await supabase.from("ap_bills").delete().in("id", billIds);
  }

  await supabase
    .from("subcontract_payment_schedule")
    .delete()
    .or(`title.ilike.%${marker}%,description.ilike.%${marker}%`);
  await supabase.from("subcontracts").delete().ilike("description", `%${marker}%`);
  await supabase.from("subcontractors").delete().ilike("name", `%${marker}%`);
  await supabase.from("projects").delete().ilike("name", `%${marker}%`);
}

async function createFixture(supabase: Supabase, marker: string) {
  const projectId = randomUUID();
  const subcontractorId = randomUUID();
  const subcontractId = randomUUID();
  const projectName = `${marker} Project`;
  const subcontractorName = `${marker} Roofing`;
  const subcontractDescription = `${marker} standing seam roof package`;

  const { error: projectError } = await supabase.from("projects").insert({
    id: projectId,
    name: projectName,
    status: "Active",
    budget: 5000,
    contract_amount: 5000,
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
    cost_code: `${marker}-ROOF`,
    contract_amount: 1200,
    description: subcontractDescription,
    status: "Active",
  });
  expect(subcontractError?.message ?? "").toBe("");

  return { projectId, projectName, subcontractId, subcontractorId, subcontractorName };
}

async function createManualLinkedBillViaUi(
  page: Page,
  params: {
    amount: string;
    billNo: string;
    marker: string;
    projectId: string;
    projectName: string;
    subcontractId: string;
    subcontractorId: string;
    subcontractorName: string;
  }
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`${BASE}/financial/bills/new`);
  await expect(page).toHaveURL(/\/bills\/new(?:[/?#]|$)/, { timeout: LOAD_MS });
  await expect(page.getByText("Vendor / payee name")).toBeVisible({ timeout: LOAD_MS });

  const form = page.locator("form").first();
  const inputs = form.locator("input");
  await inputs.nth(0).fill(params.billNo);
  await page.getByRole("combobox").nth(0).selectOption("Vendor");

  const subcontractorSelect = page.getByRole("combobox", { name: "Subcontractor" });
  await expect(subcontractorSelect.locator(`option[value="${params.subcontractorId}"]`)).toHaveText(
    params.subcontractorName,
    { timeout: LOAD_MS }
  );
  await subcontractorSelect.selectOption(params.subcontractorId);

  const subcontractSelect = page.getByRole("combobox", { name: "Subcontract / Contract" });
  await expect(subcontractSelect.locator(`option[value="${params.subcontractId}"]`)).toContainText(
    params.projectName,
    { timeout: LOAD_MS }
  );
  await subcontractSelect.selectOption(params.subcontractId);

  await expect(inputs.nth(1)).toHaveValue(params.subcontractorName, { timeout: LOAD_MS });
  await expect(page.getByRole("combobox").nth(1)).toHaveValue(params.projectId);

  await inputs.nth(2).fill(today);
  await inputs.nth(3).fill(today);
  await page.getByPlaceholder("0.00").fill(params.amount);
  await inputs.last().fill(`Manual subcontract AP linkage ${params.marker}`);

  await page.getByRole("button", { name: /^Create bill$/i }).click();
  await expect(page).toHaveURL(/\/bills\/[0-9a-f-]{36}$/i, { timeout: LOAD_MS });
  const billId = page.url().split("/").filter(Boolean).pop() ?? "";
  expect(billId).toMatch(/^[0-9a-f-]{36}$/i);
  return billId;
}

test.describe("manual subcontract AP bill linkage", () => {
  test.describe.configure({ timeout: 180_000 });

  test("creates a subcontract-linked AP bill from /bills/new without touching schedules", async ({
    page,
  }, testInfo) => {
    test.skip(!allowDeleteMutations(testInfo), "Local subcontract AP mutation target required.");
    const supabase = supabaseForLocalMutations();
    if (!supabase) {
      test.skip(true, "Local Supabase service role env is required for fixture setup.");
      return;
    }

    const marker = `TEST-MANUAL-SUB-AP-${Date.now()}`;
    const billNo = `${marker}-001`;
    await cleanupMarkerData(supabase, marker);
    const fixture = await createFixture(supabase, marker);

    try {
      const billId = await createManualLinkedBillViaUi(page, {
        amount: "450",
        billNo,
        marker,
        ...fixture,
      });

      const { data: bill, error: billError } = await supabase
        .from("ap_bills")
        .select(
          "id,bill_no,vendor_name,project_id,subcontractor_id,subcontract_id,amount,paid_amount,balance_amount,status,notes"
        )
        .eq("id", billId)
        .maybeSingle();
      expect(billError?.message ?? "").toBe("");
      expect(bill).toMatchObject({
        id: billId,
        bill_no: billNo,
        vendor_name: fixture.subcontractorName,
        project_id: fixture.projectId,
        subcontractor_id: fixture.subcontractorId,
        subcontract_id: fixture.subcontractId,
        status: "Draft",
      });
      expect(num(bill?.amount)).toBe(450);
      expect(num(bill?.paid_amount)).toBe(0);
      expect(num(bill?.balance_amount)).toBe(450);

      const { data: schedules, error: scheduleError } = await supabase
        .from("subcontract_payment_schedule")
        .select("id")
        .eq("subcontract_id", fixture.subcontractId);
      expect(scheduleError?.message ?? "").toBe("");
      expect(schedules ?? []).toHaveLength(0);

      await expect(page.getByText(fixture.subcontractorName).first()).toBeVisible({
        timeout: LOAD_MS,
      });
      await expect(page.getByRole("link", { name: fixture.subcontractorName })).toHaveAttribute(
        "href",
        `/projects/${fixture.projectId}/subcontracts/${fixture.subcontractId}`,
        { timeout: LOAD_MS }
      );

      await page.goto(`${BASE}/bills`, { waitUntil: "domcontentloaded", timeout: LOAD_MS });
      const billRow = page.locator("tr").filter({ hasText: billNo }).first();
      await expect(billRow).toContainText(fixture.projectName, { timeout: LOAD_MS });
      await expect(
        billRow.getByRole("link", { name: `Subcontract: ${fixture.subcontractorName}` })
      ).toHaveAttribute(
        "href",
        `/projects/${fixture.projectId}/subcontracts/${fixture.subcontractId}`
      );
    } finally {
      await cleanupMarkerData(supabase, marker);
    }
  });
});

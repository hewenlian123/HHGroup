import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = e2eTargetOrigin();
const LOAD_MS = 60_000;

type Supabase = SupabaseClient;

function supabaseForLocalMutations(): Supabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
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

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmtUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtUsdCompact(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  await supabase.from("projects").delete().ilike("name", `%${marker}%`);
}

async function apSnapshot(
  supabase: Supabase
): Promise<{ totalBills: number; outstanding: number }> {
  const { data, error } = await supabase
    .from("ap_bills")
    .select("amount,paid_amount,balance_amount,status")
    .neq("status", "Void");
  expect(error?.message ?? "").toBe("");

  let totalBills = 0;
  let outstanding = 0;
  for (const row of data ?? []) {
    const amount = num(row.amount);
    const paid = num(row.paid_amount);
    const storedBalance = Math.max(0, num(row.balance_amount));
    const derivedBalance = Math.max(0, money(amount - paid));
    totalBills += amount;
    if (row.status !== "Paid") {
      outstanding += storedBalance > 0 ? storedBalance : derivedBalance;
    }
  }
  return { totalBills: money(totalBills), outstanding: money(outstanding) };
}

async function loadBill(supabase: Supabase, billId: string) {
  const { data, error } = await supabase
    .from("ap_bills")
    .select("id,bill_no,vendor_name,project_id,amount,paid_amount,balance_amount,status,category")
    .eq("id", billId)
    .maybeSingle();
  expect(error?.message ?? "").toBe("");
  expect(data?.id).toBe(billId);
  return data!;
}

async function loadBillPayments(supabase: Supabase, billId: string) {
  const { data, error } = await supabase
    .from("ap_bill_payments")
    .select("id,bill_id,payment_date,amount,payment_method,reference_no,notes")
    .eq("bill_id", billId)
    .order("created_at", { ascending: true });
  expect(error?.message ?? "").toBe("");
  return data ?? [];
}

async function createProjectViaUi(
  page: Page,
  params: { projectName: string; customerName: string }
): Promise<void> {
  await page.goto(`${BASE}/projects/new`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible({
    timeout: LOAD_MS,
  });
  await page.getByPlaceholder("Luxury Villa E").fill(params.projectName);
  await page.getByPlaceholder("Client or company name").fill(params.customerName);
  await page.locator("#project-address").click();
  const addressDialog = page.getByRole("dialog", { name: "Address details" }).last();
  await expect(addressDialog).toBeVisible({ timeout: LOAD_MS });
  await page.locator("#project-address-street").fill("100 Bill Payment Test Ave");
  await addressDialog.getByRole("button", { name: "Save address" }).click();
  await expect(addressDialog).toBeHidden({ timeout: LOAD_MS });
  await page.locator('input[name="budget"]').fill("1000");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects(?:[?#]|$)/, { timeout: LOAD_MS });
}

async function createBillViaUi(
  page: Page,
  params: {
    amount: string;
    billNo: string;
    marker: string;
    projectId: string;
    projectName: string;
    vendorName: string;
  }
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`${BASE}/financial/bills/new`);
  await expect(page).toHaveURL(/\/bills\/new(?:[/?#]|$)/, { timeout: LOAD_MS });
  await expect(page.getByText("Vendor / payee name")).toBeVisible({ timeout: LOAD_MS });

  const form = page.locator("form").first();
  const inputs = form.locator("input");
  await inputs.nth(0).fill(params.billNo);
  await inputs.nth(1).fill(params.vendorName);
  await page.getByRole("combobox").nth(0).selectOption("Vendor");

  const projectSelect = page.getByRole("combobox").nth(1);
  await expect(projectSelect.locator(`option[value="${params.projectId}"]`)).toHaveText(
    params.projectName,
    { timeout: LOAD_MS }
  );
  await projectSelect.selectOption(params.projectId);

  await inputs.nth(2).fill(today);
  await inputs.nth(3).fill(today);
  await page.getByPlaceholder("0.00").fill(params.amount);

  const category = page.getByRole("combobox", { name: "Category" });
  await category.click();
  await category.fill("Materials");
  await category.press("Tab");
  await inputs.last().fill(`Playwright bill payment regression ${params.marker}`);

  await page.getByRole("button", { name: /^Create bill$/i }).click();
  await expect(page).toHaveURL(/\/bills\/[0-9a-f-]{36}$/i, { timeout: LOAD_MS });
  const billId = page.url().split("/").filter(Boolean).pop() ?? "";
  expect(billId).toMatch(/^[0-9a-f-]{36}$/i);
  return billId;
}

async function addPaymentViaUi(
  page: Page,
  billId: string,
  params: { amount: string; method: string; notes: string }
): Promise<void> {
  await page.goto(`${BASE}/bills/${billId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: /^Add payment$/ }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible({ timeout: LOAD_MS });
  await dialog.getByPlaceholder("0.00").fill(params.amount);
  await dialog.getByPlaceholder("e.g. Check, ACH").fill(params.method);
  await dialog.locator("input").nth(4).fill(params.notes);
  await dialog.getByRole("button", { name: /^Add payment$/ }).click();
  await expect(dialog).toBeHidden({ timeout: LOAD_MS });
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function expectOwnerPendingAp(page: Page, outstanding: number): Promise<void> {
  await page.goto(`${BASE}/financial/owner`);
  await expect(page.locator("body")).toContainText(
    new RegExp(`AP\\s+${escapeRegExp(fmtUsd(outstanding))}`),
    { timeout: LOAD_MS }
  );
}

async function expectDashboardAp(page: Page, outstanding: number): Promise<void> {
  await page.goto(`${BASE}/dashboard`);
  await expect(page.locator("body")).toContainText(
    new RegExp(`${escapeRegExp(fmtUsdCompact(outstanding))}\\s+AP`),
    { timeout: LOAD_MS }
  );
}

async function expectProjectBillsAndNoActualCost(
  page: Page,
  params: { billNos: string[]; projectId: string; vendors: string[] }
): Promise<void> {
  await page.goto(`${BASE}/projects/${params.projectId}`);
  await page.getByRole("tab", { name: "Cost" }).click();
  await expect(page.getByTestId("snapshot-cost-actual")).toContainText(/\$0(?:\.00)?/, {
    timeout: LOAD_MS,
  });
  await page.getByRole("button", { name: /More/i }).click();
  await page.getByRole("menuitem", { name: "Bills" }).click();
  await expect(page.getByText("Bills (AP)")).toBeVisible({ timeout: LOAD_MS });
  for (const vendor of params.vendors) {
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: LOAD_MS });
  }
  for (const billNo of params.billNos) {
    await expect(page.getByText(billNo).first()).toBeVisible({ timeout: LOAD_MS });
  }
}

test.describe("Bills/AP payment flow", () => {
  test.describe.configure({ timeout: 240_000 });

  test("full and partial bill payments update AP outstanding without project actual cost double count", async ({
    page,
  }, testInfo) => {
    test.skip(!allowDeleteMutations(testInfo), "Local bill/project mutation target required.");
    const supabase = supabaseForLocalMutations();
    if (!supabase) {
      test.skip(true, "Supabase env is required for DB evidence.");
      return;
    }

    const stamp = Date.now();
    const marker = `TEST-BILL-PAYMENT-${stamp}`;
    const projectName = `${marker}-PROJECT`;
    const customerName = `${marker}-CUSTOMER`;
    const fullVendor = `${marker}-FULL-VENDOR`;
    const partialVendor = `${marker}-PARTIAL-VENDOR`;
    const fullBillNo = `${marker}-FULL-001`;
    const partialBillNo = `${marker}-PARTIAL-001`;

    await cleanupMarkerData(supabase, marker);
    const before = await apSnapshot(supabase);

    try {
      await createProjectViaUi(page, { projectName, customerName });
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id,name")
        .eq("name", projectName)
        .maybeSingle();
      expect(projectError?.message ?? "").toBe("");
      expect(project?.id).toMatch(/^[0-9a-f-]{36}$/i);

      const fullBillId = await createBillViaUi(page, {
        amount: "100",
        billNo: fullBillNo,
        marker,
        projectId: project!.id,
        projectName,
        vendorName: fullVendor,
      });
      const fullUnpaid = await loadBill(supabase, fullBillId);
      expect(fullUnpaid).toMatchObject({
        bill_no: fullBillNo,
        vendor_name: fullVendor,
        project_id: project!.id,
        status: "Draft",
        category: "Materials",
      });
      expect(num(fullUnpaid.amount)).toBe(100);
      expect(num(fullUnpaid.paid_amount)).toBe(0);
      expect(num(fullUnpaid.balance_amount)).toBe(100);

      const afterFullCreate = await apSnapshot(supabase);
      expect(money(afterFullCreate.outstanding - before.outstanding)).toBe(100);
      await expectDashboardAp(page, afterFullCreate.outstanding);
      await expectOwnerPendingAp(page, afterFullCreate.outstanding);
      await expectProjectBillsAndNoActualCost(page, {
        billNos: [fullBillNo],
        projectId: project!.id,
        vendors: [fullVendor],
      });

      await addPaymentViaUi(page, fullBillId, {
        amount: "100",
        method: "Cash",
        notes: `Playwright bill payment regression ${marker}`,
      });
      const fullPaid = await loadBill(supabase, fullBillId);
      expect(num(fullPaid.paid_amount)).toBe(100);
      expect(num(fullPaid.balance_amount)).toBe(0);
      expect(fullPaid.status).toBe("Paid");
      const fullPayments = await loadBillPayments(supabase, fullBillId);
      expect(fullPayments).toHaveLength(1);
      expect(fullPayments[0]).toMatchObject({
        bill_id: fullBillId,
        payment_method: "Cash",
      });
      expect(num(fullPayments[0].amount)).toBe(100);

      const afterFullPaid = await apSnapshot(supabase);
      expect(money(afterFullPaid.outstanding - before.outstanding)).toBe(0);
      await expectDashboardAp(page, afterFullPaid.outstanding);
      await expectOwnerPendingAp(page, afterFullPaid.outstanding);
      await page.goto(`${BASE}/bills/${fullBillId}`);
      await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible({
        timeout: LOAD_MS,
      });
      await expect(page.getByText("$0.00").first()).toBeVisible({ timeout: LOAD_MS });

      const partialBillId = await createBillViaUi(page, {
        amount: "100",
        billNo: partialBillNo,
        marker,
        projectId: project!.id,
        projectName,
        vendorName: partialVendor,
      });
      const partialUnpaid = await loadBill(supabase, partialBillId);
      expect(num(partialUnpaid.amount)).toBe(100);
      expect(num(partialUnpaid.paid_amount)).toBe(0);
      expect(num(partialUnpaid.balance_amount)).toBe(100);

      await addPaymentViaUi(page, partialBillId, {
        amount: "40",
        method: "Check",
        notes: `Playwright bill partial payment regression ${marker}`,
      });
      const partialPaid = await loadBill(supabase, partialBillId);
      expect(num(partialPaid.paid_amount)).toBe(40);
      expect(num(partialPaid.balance_amount)).toBe(60);
      expect(partialPaid.status).toBe("Partially Paid");
      const partialPayments = await loadBillPayments(supabase, partialBillId);
      expect(partialPayments).toHaveLength(1);
      expect(partialPayments[0]).toMatchObject({
        bill_id: partialBillId,
        payment_method: "Check",
      });
      expect(num(partialPayments[0].amount)).toBe(40);

      const afterPartialPayment = await apSnapshot(supabase);
      expect(money(afterPartialPayment.outstanding - before.outstanding)).toBe(60);
      await expectDashboardAp(page, afterPartialPayment.outstanding);
      await expectOwnerPendingAp(page, afterPartialPayment.outstanding);
      await page.goto(`${BASE}/bills/${partialBillId}`);
      await expect(page.getByText("Partially Paid", { exact: true }).first()).toBeVisible({
        timeout: LOAD_MS,
      });

      await page.goto(`${BASE}/bills`);
      const fullRow = page.locator("tbody tr").filter({ hasText: fullBillNo }).first();
      const partialRow = page.locator("tbody tr").filter({ hasText: partialBillNo }).first();
      await expect(fullRow).toBeVisible({ timeout: LOAD_MS });
      await expect(fullRow).toContainText("Paid");
      await expect(fullRow).toContainText("$0.00");
      await expect(partialRow).toBeVisible({ timeout: LOAD_MS });
      await expect(partialRow).toContainText("$60.00");

      await expectProjectBillsAndNoActualCost(page, {
        billNos: [fullBillNo, partialBillNo],
        projectId: project!.id,
        vendors: [fullVendor, partialVendor],
      });
    } finally {
      await cleanupMarkerData(supabase, marker);
      const { data: remainingBills } = await supabase
        .from("ap_bills")
        .select("id")
        .or(`bill_no.ilike.%${marker}%,vendor_name.ilike.%${marker}%,notes.ilike.%${marker}%`);
      const { data: remainingPayments } = await supabase
        .from("ap_bill_payments")
        .select("id")
        .or(`notes.ilike.%${marker}%,reference_no.ilike.%${marker}%`);
      const { data: remainingProjects } = await supabase
        .from("projects")
        .select("id")
        .ilike("name", `%${marker}%`);
      expect(remainingBills ?? []).toHaveLength(0);
      expect(remainingPayments ?? []).toHaveLength(0);
      expect(remainingProjects ?? []).toHaveLength(0);
    }
  });
});

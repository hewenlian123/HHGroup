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
    .or(`bill_no.ilike.%${marker}%,vendor_name.ilike.%${marker}%`);
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
    .select("amount, paid_amount, balance_amount, status")
    .neq("status", "Void");
  expect(error?.message ?? "").toBe("");

  let totalBills = 0;
  let outstanding = 0;
  for (const row of data ?? []) {
    const amount = num(row.amount);
    const paid = num(row.paid_amount);
    const storedBalance = num(row.balance_amount);
    const derivedBalance = Math.max(0, money(amount - paid));
    totalBills += amount;
    if (row.status !== "Paid") {
      outstanding += storedBalance > 0 ? storedBalance : derivedBalance;
    }
  }
  return { totalBills: money(totalBills), outstanding: money(outstanding) };
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
  await page.locator("#project-address-street").fill("100 Bill Linkage Test Ave");
  await addressDialog.getByRole("button", { name: "Save address" }).click();
  await expect(addressDialog).toBeHidden({ timeout: LOAD_MS });
  await page.locator('input[name="budget"]').fill("1000");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects(?:[?#]|$)/, { timeout: LOAD_MS });
}

async function createBillViaUi(
  page: Page,
  params: {
    billNo: string;
    vendorName: string;
    projectId: string;
    projectName: string;
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
  await page.getByPlaceholder("0.00").fill("100");

  const category = page.getByRole("combobox", { name: "Category" });
  await category.click();
  await category.fill("Materials");
  await category.press("Tab");
  await inputs.last().fill("Playwright bill project linkage test");

  await page.getByRole("button", { name: /^Create bill$/i }).click();
  await expect(page).toHaveURL(/\/bills\/[0-9a-f-]{36}$/i, { timeout: LOAD_MS });
  const billId = page.url().split("/").filter(Boolean).pop() ?? "";
  expect(billId).toMatch(/^[0-9a-f-]{36}$/i);
  return billId;
}

test.describe("Bills project linkage and AP outstanding", () => {
  test.describe.configure({ timeout: 180_000 });

  test("new unpaid project bill persists bill number and increases AP outstanding without project cost double count", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(!allowDeleteMutations(testInfo), "Local bill/project mutation target required.");
    const supabase = supabaseForLocalMutations();
    if (!supabase) {
      test.skip(true, "Supabase env is required for DB evidence.");
      return;
    }

    const stamp = Date.now();
    const marker = `TEST-BILL-AP-${stamp}`;
    const projectName = `${marker}-PROJECT`;
    const customerName = `${marker}-CUSTOMER`;
    const vendorName = `${marker}-VENDOR`;
    const billNo = `${marker}-001`;

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

      const billId = await createBillViaUi(page, {
        billNo,
        vendorName,
        projectId: project!.id,
        projectName,
      });

      const { data: bill, error: billError } = await supabase
        .from("ap_bills")
        .select(
          "id,bill_no,vendor_name,project_id,amount,paid_amount,balance_amount,status,category"
        )
        .eq("id", billId)
        .maybeSingle();
      expect(billError?.message ?? "").toBe("");
      expect(bill).toMatchObject({
        id: billId,
        bill_no: billNo,
        vendor_name: vendorName,
        project_id: project!.id,
        status: "Draft",
        category: "Materials",
      });
      expect(num(bill?.amount)).toBe(100);
      expect(num(bill?.paid_amount)).toBe(0);
      expect(num(bill?.balance_amount)).toBe(100);

      const afterCreate = await apSnapshot(supabase);
      expect(money(afterCreate.totalBills - before.totalBills)).toBe(100);
      expect(money(afterCreate.outstanding - before.outstanding)).toBe(100);

      await expect(page.getByText(billNo).first()).toBeVisible({ timeout: LOAD_MS });
      await expect(page.getByText(vendorName).first()).toBeVisible();
      await expect(page.getByText(projectName).first()).toBeVisible();
      await expect(page.getByText("Balance", { exact: true })).toBeVisible();
      await expect(page.getByText("$100.00").first()).toBeVisible();

      await page.goto(`${BASE}/bills`);
      await page.waitForLoadState("domcontentloaded");
      const row = page.locator("tbody tr").filter({ hasText: billNo }).first();
      await expect(row).toBeVisible({ timeout: LOAD_MS });
      await expect(row).toContainText(vendorName);
      await expect(row).toContainText(projectName);
      await expect(row.getByText("$100.00")).toHaveCount(2);

      await page.goto(`${BASE}/finance`);
      await expect(page.locator("body")).toContainText(fmtUsd(afterCreate.totalBills), {
        timeout: LOAD_MS,
      });

      await page.goto(`${BASE}/dashboard`);
      await expect(page.locator("body")).toContainText(
        new RegExp(`${escapeRegExp(fmtUsdCompact(afterCreate.outstanding))}\\s+AP`),
        { timeout: LOAD_MS }
      );

      await page.goto(`${BASE}/financial/owner`);
      await expect(page.locator("body")).toContainText(
        new RegExp(`AP\\s+${escapeRegExp(fmtUsd(afterCreate.outstanding))}`),
        { timeout: LOAD_MS }
      );

      await page.goto(`${BASE}/projects/${project!.id}`);
      await page.getByRole("tab", { name: "Cost" }).click();
      await expect(page.getByTestId("snapshot-cost-actual")).toContainText(/\$0(?:\.00)?/, {
        timeout: LOAD_MS,
      });
      await page.getByRole("button", { name: /More/i }).click();
      await page.getByRole("menuitem", { name: "Bills" }).click();
      await expect(page.getByText("Bills (AP)")).toBeVisible({ timeout: LOAD_MS });
      await expect(page.getByText(vendorName)).toBeVisible();
      await expect(page.getByText(billNo)).toBeVisible();
      await expect(page.getByText("$100")).toBeVisible();

      const paymentResponse = await request.post(`${BASE}/api/bills/${billId}/payments`, {
        data: {
          payment_date: new Date().toISOString().slice(0, 10),
          amount: 25,
          payment_method: "Check",
          reference_no: `${marker}-PAY`,
        },
      });
      expect(paymentResponse.ok(), await paymentResponse.text()).toBeTruthy();

      const editResponse = await request.patch(`${BASE}/api/bills/${billId}`, {
        data: { amount: 150 },
      });
      expect(editResponse.ok(), await editResponse.text()).toBeTruthy();

      const { data: editedBill, error: editedError } = await supabase
        .from("ap_bills")
        .select("amount,paid_amount,balance_amount,status")
        .eq("id", billId)
        .maybeSingle();
      expect(editedError?.message ?? "").toBe("");
      expect(num(editedBill?.amount)).toBe(150);
      expect(num(editedBill?.paid_amount)).toBe(25);
      expect(num(editedBill?.balance_amount)).toBe(125);
      expect(editedBill?.status).toBe("Partially Paid");
    } finally {
      await cleanupMarkerData(supabase, marker);
      const { data: remainingBills } = await supabase
        .from("ap_bills")
        .select("id")
        .or(`bill_no.ilike.%${marker}%,vendor_name.ilike.%${marker}%`);
      const { data: remainingProjects } = await supabase
        .from("projects")
        .select("id")
        .ilike("name", `%${marker}%`);
      expect(remainingBills ?? []).toHaveLength(0);
      expect(remainingProjects ?? []).toHaveLength(0);
    }
  });
});

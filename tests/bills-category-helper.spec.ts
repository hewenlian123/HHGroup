import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";
import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";

const BASE = e2eTargetOrigin();
const VENDOR = "TEST-BILL-CATEGORY-DELETE-ME";
const BILL_DETAIL_URL = /\/bills\/[0-9a-f-]{36}$/i;
const LOAD_MS = 60_000;

async function cleanupTestBillsByVendor(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;
  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rows, error } = await supabase
    .from("ap_bills")
    .select("id")
    .ilike("vendor_name", `%${VENDOR}%`);
  if (error) {
    console.warn("[bills-category-helper] cleanup select:", error.message);
    return;
  }
  for (const row of rows ?? []) {
    if (!row.id) continue;
    await supabase.from("ap_bill_payments").delete().eq("bill_id", row.id);
    await supabase.from("ap_bills").delete().eq("id", row.id);
  }
}

async function fillNewBillForm(page: import("@playwright/test").Page): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const form = page.locator("form").first();
  const inputs = form.locator("input");

  await expect(page.getByText("Vendor / payee name")).toBeVisible({ timeout: LOAD_MS });
  await inputs.nth(0).fill(`${VENDOR}-001`);
  await inputs.nth(1).fill(VENDOR);
  await page.getByRole("combobox").nth(0).selectOption("Vendor");

  const projectSelect = page.getByRole("combobox").nth(1);
  await expect(async () => {
    expect(await projectSelect.locator("option").count()).toBeGreaterThan(1);
  }).toPass({ timeout: LOAD_MS, intervals: [400, 800, 1500] });
  await projectSelect.selectOption({ index: 1 });

  await inputs.nth(2).fill(today);
  await inputs.nth(3).fill(today);
  await page.getByPlaceholder("0.00").fill("123.45");

  const category = page.getByRole("combobox", { name: "Category" });
  await category.click();
  await category.fill("Foundation");
  const foundationOption = page.getByRole("option", { name: /^Foundation$/ });
  if ((await foundationOption.count()) > 0) {
    await foundationOption.first().click();
  } else {
    await page.getByRole("option", { name: /Add “Foundation”/ }).click();
  }
  await expect(category).toHaveValue("Foundation");

  await inputs.last().fill("category helper smoke");
}

test.describe("Bills category helper", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(({ page }, testInfo) => {
    test.skip(
      !allowDeleteMutations(testInfo),
      "Local dev, chromium-delete-mutations, or E2E_ALLOW_DELETE_MUTATIONS=1 required."
    );
    page.on("pageerror", (err) => {
      throw new Error(`Page error: ${err.message}`);
    });
  });

  test.afterAll(async () => {
    await cleanupTestBillsByVendor();
  });

  test("new bill: category combobox, create, detail, edit, delete", async ({ page }) => {
    await page.goto(`${BASE}/bills/new`);
    await page.waitForLoadState("networkidle");
    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    await fillNewBillForm(page);
    await page.getByRole("button", { name: /^Create bill$/i }).click();
    await page.waitForURL(BILL_DETAIL_URL, { timeout: 45_000 });
    const billId = page.url().split("/").filter(Boolean).pop();
    expect(billId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Foundation", { exact: true })).toBeVisible({
      timeout: LOAD_MS,
    });

    await page.goto(`${BASE}/bills/${billId}/edit`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue("Foundation", {
      timeout: LOAD_MS,
    });

    await page.goto(`${BASE}/bills/${billId}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Delete$/i }).click();
    await page.getByRole("button", { name: /^Confirm delete$/i }).click();
    await expect(page).toHaveURL(/\/bills\/?$/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("tbody tr").filter({ hasText: VENDOR })).toHaveCount(0, {
      timeout: 20_000,
    });

    await cleanupTestBillsByVendor();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (url && key) {
      assertE2ESupabaseUrlSafeForMutations(url);
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await supabase
        .from("ap_bills")
        .select("id")
        .ilike("vendor_name", `%${VENDOR}%`);
      expect(data?.length ?? 0).toBe(0);
    }
  });
});

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { e2eTargetOrigin } from "./e2e-env-helpers";

const BASE = e2eTargetOrigin();
const LOAD_MS = 60_000;

function readonlySupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function expectPageLoaded(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: LOAD_MS,
  });
  expect(response?.status()).not.toBe(500);
  await page.locator("main").first().waitFor({ state: "visible", timeout: LOAD_MS });
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
  await expect(page.locator("body")).not.toContainText(
    "Application error: a client-side exception has occurred"
  );
}

test.describe("subcontractor Phase 1 foundation", () => {
  test.describe.configure({ timeout: 120_000 });

  test("canonical subcontractor list loads with Phase 1 financial labels", async ({ page }) => {
    await expectPageLoaded(page, "/subcontractors");

    await expect(page.getByText("Contract Amount").first()).toBeVisible();
    await expect(page.getByText("Billed To Date").first()).toBeVisible();
    await expect(page.getByText("Paid To Date").first()).toBeVisible();
    await expect(page.getByText("AP Outstanding").first()).toBeVisible();
    await expect(page.getByText("Remaining Contract").first()).toBeVisible();
  });

  test("canonical detail and project subcontract routes load when seed rows exist", async ({
    page,
  }) => {
    const supabase = readonlySupabase();
    if (!supabase) {
      test.skip(true, "Supabase env is not configured for read-only route smoke.");
      return;
    }

    const { data: subcontractor } = await supabase!
      .from("subcontractors")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!subcontractor?.id) {
      test.skip(true, "No subcontractor row is available for detail smoke.");
      return;
    }
    const subcontractorId = subcontractor.id;

    await expectPageLoaded(page, `/subcontractors/${subcontractorId}`);
    await expect(page.getByText("Contract Amount").first()).toBeVisible();
    await expect(page.getByText("Billed To Date").first()).toBeVisible();
    await expect(page.getByText("AP Outstanding").first()).toBeVisible();

    const { data: subcontract } = await supabase!
      .from("subcontracts")
      .select("id,project_id")
      .limit(1)
      .maybeSingle();
    if (!subcontract?.id || !subcontract?.project_id) {
      test.skip(true, "No subcontract row is available.");
      return;
    }
    const subcontractId = subcontract.id;
    const projectId = subcontract.project_id;

    await expectPageLoaded(page, `/projects/${projectId}/subcontracts`);
    await expect(page.getByText("Billed To Date").first()).toBeVisible();

    await expectPageLoaded(page, `/projects/${projectId}/subcontracts/${subcontractId}`);
    await expect(page.getByText("Remaining Contract").first()).toBeVisible();
  });
});

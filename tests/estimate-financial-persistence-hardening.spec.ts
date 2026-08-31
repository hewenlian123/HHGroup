import { expect, test, type Page } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { gotoWithE2EAuth, loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";
import {
  cleanupEstimateFinancialFixture,
  ESTIMATE_FINANCIAL_FIXTURE_BASELINE as BASELINE,
  ESTIMATE_FINANCIAL_FIXTURE_ID as ESTIMATE_ID,
  ESTIMATE_FINANCIAL_FIXTURE_NUMBER as ESTIMATE_NUMBER,
  seedEstimateFinancialFixture,
} from "./estimate-financial-fixture";

let depositId = "";

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase admin configuration is required.");
  assertEstimateCertificationLocalOnly({
    baseURL: process.env.E2E_BASE_URL,
    supabaseUrl: url,
    databaseUrl: process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        return Math.max(
          root.scrollWidth - root.clientWidth,
          app ? app.scrollWidth - app.clientWidth : 0
        );
      })
    )
    .toBeLessThanOrEqual(1);
}

function collectRuntimeErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

function waitForOwnerAuthResponse(page: Page): ReturnType<Page["waitForResponse"]> {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/auth/v1/user"),
    { timeout: 15_000 }
  );
}

async function loginAndWaitForOwnerAuth(page: Page, destination: string): Promise<void> {
  const authResponse = waitForOwnerAuthResponse(page);
  await loginAsE2EOwner(page, destination);
  expect((await authResponse).ok()).toBe(true);
  await page.waitForLoadState("networkidle");
}

async function gotoAndWaitForOwnerAuth(page: Page, destination: string): Promise<void> {
  await gotoWithE2EAuth(page, destination);
}

async function expectDetailBaseline(page: Page): Promise<void> {
  await expect(page.getByTestId("estimate-detail-header")).toContainText(ESTIMATE_NUMBER);
  const pricing = page.getByRole("region", { name: "Estimate pricing summary" });
  if (await pricing.isVisible().catch(() => false)) {
    await expect(pricing).toContainText(BASELINE.subtotal);
    await expect(pricing).toContainText(BASELINE.tax);
    await expect(pricing).toContainText(BASELINE.discount);
    await expect(pricing).toContainText(BASELINE.total);
    return;
  }

  const mobilePricing = page.locator("details.eb-mobile-summary");
  await expect(mobilePricing).toContainText(BASELINE.total);
  await mobilePricing.locator('summary[aria-label="Toggle price breakdown"]').click();
  await expect(mobilePricing).toContainText(BASELINE.subtotal);
  await expect(mobilePricing).toContainText(BASELINE.tax);
  await expect(mobilePricing).toContainText(BASELINE.discount);
}

test.describe.serial("Estimate financial persistence hardening", () => {
  test.beforeAll(async () => {
    ({ depositId } = await seedEstimateFinancialFixture());
  });

  test.afterAll(async () => {
    await cleanupEstimateFinancialFixture();
  });

  test("server action save and duplicate retry persist the exact baseline after reload", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const runtime = collectRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAndWaitForOwnerAuth(page, `/estimates/${ESTIMATE_ID}`);
    await expectDetailBaseline(page);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const header = page.getByTestId("estimate-detail-header");
      await header.getByRole("button", { name: "Edit", exact: true }).click();
      await page
        .getByRole("navigation", { name: "Pricing inspector sections" })
        .getByRole("button", { name: "Details" })
        .click();
      const details = page.getByRole("dialog", {
        name: "Customer / project / pricing details",
      });
      await details.getByLabel("Tax amount").fill("48.06");
      await details.getByLabel("Discount", { exact: true }).fill("106.81");
      await details.getByRole("button", { name: "Save", exact: true }).click();
      await expect(details).toBeHidden({ timeout: 30_000 });
      await expect(header.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
      await reloadWithE2EAuth(page);
      await expectDetailBaseline(page);
    }

    const db = localAdmin();
    const persisted = await db
      .from("estimate_meta")
      .select("tax, discount")
      .eq("estimate_id", ESTIMATE_ID)
      .single();
    expect(persisted.error).toBeNull();
    expect(Number(persisted.data?.tax)).toBe(48.06);
    expect(Number(persisted.data?.discount)).toBe(106.81);

    const categories = await db
      .from("estimate_categories")
      .select("cost_code, order_index")
      .eq("estimate_id", ESTIMATE_ID)
      .order("order_index");
    expect(categories.error).toBeNull();
    expect(categories.data).toEqual([
      { cost_code: "010000", order_index: 0 },
      { cost_code: "020000", order_index: 1 },
    ]);
    expect(runtime.consoleErrors).toEqual([]);
    expect(runtime.pageErrors).toEqual([]);
  });

  test("Detail, List, Preview, Print, and Payment Preview keep financial parity", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const runtime = collectRuntimeErrors(page);

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1280, height: 900 },
      { width: 820, height: 1180 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await loginAndWaitForOwnerAuth(page, `/estimates/${ESTIMATE_ID}`);
      await expectDetailBaseline(page);
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoAndWaitForOwnerAuth(page, "/estimates");
    await page.getByRole("textbox", { name: "Search estimates" }).fill(ESTIMATE_NUMBER);
    const row = page.locator(".estimate-list-row", { hasText: ESTIMATE_NUMBER });
    await expect(row).toContainText("QA Test Customer");
    await expect(row).toContainText(BASELINE.total);
    await expectNoHorizontalOverflow(page);

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoAndWaitForOwnerAuth(page, `/estimates/${ESTIMATE_ID}/preview`);
      const document = page.getByTestId("estimate-document");
      for (const amount of [
        BASELINE.subtotal,
        BASELINE.tax,
        BASELINE.discount,
        BASELINE.total,
        BASELINE.deposit,
        BASELINE.final,
        BASELINE.remaining,
      ]) {
        await expect(document).toContainText(amount);
      }
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoAndWaitForOwnerAuth(page, `/estimates/${ESTIMATE_ID}/print`);
    const printDocument = page.getByTestId("estimate-document");
    await expect(printDocument).toContainText(BASELINE.total);
    await expect(printDocument).toContainText(BASELINE.deposit);
    await expect(printDocument).toContainText(BASELINE.final);

    await gotoAndWaitForOwnerAuth(page, `/estimates/${ESTIMATE_ID}/payments/${depositId}/preview`);
    await expect(page.getByRole("document", { name: "Payment milestone preview" })).toContainText(
      BASELINE.deposit
    );
    expect(runtime.consoleErrors).toEqual([]);
    expect(runtime.pageErrors).toEqual([]);
  });
});

// MIXED CONTRACT: behavior, financial, accessibility, and responsive assertions remain active.
// Presentation snapshot assertions are task-scoped current evidence and may be replaced by
// an explicit user-requested redesign; they are not permanent UI authority.

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "./estimate-playwright-test";
import { mkdir, writeFile } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  captureUnexpectedBrowserErrors,
  cleanupDenseEstimateFixture,
  DENSE_ESTIMATE_ID,
  DENSE_ESTIMATE_NUMBER,
  seedDenseEstimateFixture,
} from "./estimate-dense-fixture";

const AFTER_EVIDENCE_DIR = "test-results/estimate-print-density/after";

test.beforeAll(seedDenseEstimateFixture);
test.afterAll(cleanupDenseEstimateFixture);

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => browserErrors.set(page, captureUnexpectedBrowserErrors(page)));
test.afterEach(({ page }) => expect(browserErrors.get(page) ?? []).toEqual([]));

test(`${DENSE_ESTIMATE_NUMBER} uses premium print density without losing document or financial content`, async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}/preview`);

  const document = page.getByTestId("estimate-document");
  await expect(document).toBeVisible();
  await expect(page.getByTestId("estimate-line-item-output")).toHaveCount(62);
  await expect(page.locator(".estimate-scope-section")).toHaveCount(10);
  await expect(page.locator(".estimate-payment-row")).toHaveCount(5);
  await expect(document).toContainText("Scope of Work");
  await expect(document).toContainText("Certified Dense Scope 10");

  await expect(page.getByTestId("estimate-preview-summary")).toContainText("$3,253,937.00");
  await expect(page.getByTestId("estimate-document")).toContainText("Payment Schedule");
  await expect(page.getByTestId("estimate-document")).toContainText("Notes & Clarifications");
  await expect(page.getByTestId("estimate-document")).toContainText("Client Acceptance");

  const pdfResponse = await page.request.get(`/api/estimates/${DENSE_ESTIMATE_ID}/pdf`);
  expect(pdfResponse.ok()).toBe(true);
  const pdfBytes = await pdfResponse.body();
  expect(pdfBytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  const pdfPageCount = pdfBytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  // Same 62-item fixture used 13 pages before native pagination.
  expect(pdfPageCount).toBeGreaterThan(1);
  expect(pdfPageCount).toBeLessThanOrEqual(10);
  await page.goto(`/estimates/${DENSE_ESTIMATE_ID}/print?pdf=1`);
  await expect(page.getByTestId("estimate-line-item-output")).toHaveCount(62);
  await page.emulateMedia({ media: "print" });
  const printBytes = await page.pdf({
    format: "Letter",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(printBytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBe(pdfPageCount);
  await mkdir(AFTER_EVIDENCE_DIR, { recursive: true });
  await writeFile(`${AFTER_EVIDENCE_DIR}/E2E-EST-DENSE-0079-after-density.pdf`, pdfBytes);
});

test("small sections share pages and a large section flows across pages", async ({ page }) => {
  test.setTimeout(120_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(["localhost", "127.0.0.1"]).toContain(new URL(url).hostname);
  const db = createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!
  );
  const change = async (query: PromiseLike<{ error: unknown }>) =>
    expect((await query).error).toBeNull();
  await change(
    db.from("estimate_payment_schedule_items").delete().eq("estimate_id", DENSE_ESTIMATE_ID)
  );
  await change(db.from("estimate_items").delete().eq("estimate_id", DENSE_ESTIMATE_ID));
  await change(
    db.from("estimate_meta").update({ tax: 0, discount: 0 }).eq("estimate_id", DENSE_ESTIMATE_ID)
  );
  await change(
    db.from("estimate_items").insert(
      Array.from({ length: 3 }, (_, i) => ({
        estimate_id: DENSE_ESTIMATE_ID,
        cost_code: `dense-0${i + 1}`,
        item_name: `Small item ${i + 1}`,
        desc: `Small item body ${i + 1}.`,
        qty: 1,
        unit: "EA",
        unit_cost: 100,
        markup_pct: 0,
        sort_order: i,
      }))
    )
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}/preview`);
  await expect(page.getByTestId("estimate-line-item-output")).toHaveCount(3);
  await page.emulateMedia({ media: "print" });
  await mkdir("test-results/estimate-print-density/flow", { recursive: true });
  const small = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await writeFile("test-results/estimate-print-density/flow/small-sections.pdf", small);
  expect(small.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBeLessThanOrEqual(2);
  await change(
    db.from("estimate_items").update({ cost_code: "dense-01" }).eq("estimate_id", DENSE_ESTIMATE_ID)
  );
  await change(
    db.from("estimate_items").insert(
      Array.from({ length: 25 }, (_, i) => ({
        estimate_id: DENSE_ESTIMATE_ID,
        cost_code: "dense-01",
        item_name: `Large section item ${i + 4}`,
        desc: `Large item ${i + 4}: labor, materials, preparation, installation and cleanup.`,
        qty: 1,
        unit: "EA",
        unit_cost: 100,
        markup_pct: 0,
        sort_order: i + 3,
      }))
    )
  );
  await page.goto(`/estimates/${DENSE_ESTIMATE_ID}/print?pdf=1`);
  await expect(page.getByTestId("estimate-line-item-output")).toHaveCount(28);
  const large = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await writeFile("test-results/estimate-print-density/flow/large-section.pdf", large);
  const largePages = large.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  expect(largePages).toBeGreaterThan(1);
  expect(largePages).toBeLessThanOrEqual(4);
});

import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const VIEWPORTS = [
  { name: "desktop-wide", width: 1440, height: 1000 },
  { name: "desktop", width: 1280, height: 900 },
  { name: "compact-desktop", width: 1180, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const FIXTURE_ID = randomUUID();
const FIXTURE_FILE = `rq-global-ui-${FIXTURE_ID}.png`;
const MOTION_FIXTURE_ID = randomUUID();
const MOTION_FIXTURE_FILE = `rq-global-ui-motion-${MOTION_FIXTURE_ID}.png`;
const VENDOR_VALIDATION_FIXTURE_ID = randomUUID();
const VENDOR_VALIDATION_FIXTURE_FILE = `rq-global-ui-vendor-validation-${VENDOR_VALIDATION_FIXTURE_ID}.png`;
const AMOUNT_VALIDATION_FIXTURE_ID = randomUUID();
const AMOUNT_VALIDATION_FIXTURE_FILE = `rq-global-ui-amount-validation-${AMOUNT_VALIDATION_FIXTURE_ID}.png`;
const FIXTURE_VENDOR = "[E2E] Receipt Queue Global UI";
const FIXTURE_AMOUNT = "1234.56";
const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lR9G7wAAAABJRU5ErkJggg==";

let admin: SupabaseClient;

test.setTimeout(180_000);

function fixtureRow(page: Page) {
  return page.locator(`[data-queue-file-name="${FIXTURE_FILE}"]`);
}

function motionFixtureRow(page: Page) {
  return page.locator(`[data-queue-file-name="${MOTION_FIXTURE_FILE}"]`);
}

function validationFixtureRow(page: Page, fileName: string) {
  return page.locator(`[data-queue-file-name="${fileName}"]`);
}

function localAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase admin credentials are required.");
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function openReceiptQueue(page: Page) {
  await page.route(`**/api/financial/receipt-queue/${FIXTURE_ID}/preview`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, signedUrl: ONE_PIXEL_PNG }),
    });
  });
  await loginAsE2EOwner(page, "/receipt-queue");
  await expect(fixtureRow(page)).toBeVisible({ timeout: 90_000 });
}

test.beforeAll(async ({ baseURL }) => {
  assertE2EBaseUrlSafeForMutations(baseURL, "Receipt Queue global UI fixture");
  admin = localAdminClient();
  const { error } = await admin.from("receipt_queue").insert([
    {
      id: FIXTURE_ID,
      status: "pending",
      storage_path: `e2e/${FIXTURE_FILE}`,
      receipt_public_url: ONE_PIXEL_PNG,
      file_name: FIXTURE_FILE,
      mime_type: "image/png",
      size_bytes: 68,
      vendor_name: FIXTURE_VENDOR,
      amount: FIXTURE_AMOUNT,
      expense_date: "2026-09-01",
      project_id: null,
      category: "Other",
      source_type: "receipt_upload",
      worker_id: null,
      payment_account_id: null,
      ocr_source: "none",
      error_message: null,
    },
    {
      id: MOTION_FIXTURE_ID,
      status: "pending",
      storage_path: `e2e/${MOTION_FIXTURE_FILE}`,
      receipt_public_url: ONE_PIXEL_PNG,
      file_name: MOTION_FIXTURE_FILE,
      mime_type: "image/png",
      size_bytes: 68,
      vendor_name: "[E2E] Receipt Queue Motion",
      amount: "12.34",
      expense_date: "2026-09-01",
      project_id: null,
      category: "Other",
      source_type: "receipt_upload",
      worker_id: null,
      payment_account_id: null,
      ocr_source: "none",
      error_message: null,
    },
    {
      id: VENDOR_VALIDATION_FIXTURE_ID,
      status: "pending",
      storage_path: `e2e/${VENDOR_VALIDATION_FIXTURE_FILE}`,
      receipt_public_url: ONE_PIXEL_PNG,
      file_name: VENDOR_VALIDATION_FIXTURE_FILE,
      mime_type: "image/png",
      size_bytes: 68,
      vendor_name: "",
      amount: "12.34",
      expense_date: "2026-09-01",
      project_id: null,
      category: "Other",
      source_type: "receipt_upload",
      worker_id: null,
      payment_account_id: null,
      ocr_source: "none",
      error_message: null,
    },
    {
      id: AMOUNT_VALIDATION_FIXTURE_ID,
      status: "pending",
      storage_path: `e2e/${AMOUNT_VALIDATION_FIXTURE_FILE}`,
      receipt_public_url: ONE_PIXEL_PNG,
      file_name: AMOUNT_VALIDATION_FIXTURE_FILE,
      mime_type: "image/png",
      size_bytes: 68,
      vendor_name: "[E2E] Receipt Queue Amount Validation",
      amount: "0",
      expense_date: "2026-09-01",
      project_id: null,
      category: "Other",
      source_type: "receipt_upload",
      worker_id: null,
      payment_account_id: null,
      ocr_source: "none",
      error_message: null,
    },
  ]);
  if (error) throw new Error(`Unable to seed Receipt Queue UI fixture: ${error.message}`);
});

test.afterAll(async () => {
  if (!admin) return;
  const { error } = await admin
    .from("receipt_queue")
    .delete()
    .in("id", [
      FIXTURE_ID,
      MOTION_FIXTURE_ID,
      VENDOR_VALIDATION_FIXTURE_ID,
      AMOUNT_VALIDATION_FIXTURE_ID,
    ]);
  if (error) throw new Error(`Unable to clean Receipt Queue UI fixture: ${error.message}`);
});

test("Receipt Queue uses the HH shell, preserves values, and adapts without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
  await openReceiptQueue(page);

  for (const [index, viewport] of VIEWPORTS.entries()) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (index > 0) {
        await page.goto("/receipt-queue", { waitUntil: "domcontentloaded" });
        await expect(fixtureRow(page)).toBeVisible({ timeout: 90_000 });
      }

      await expect(page.getByRole("heading", { name: "Receipt queue", exact: true })).toBeVisible();
      const workspace = page.locator("[data-receipt-queue-global-ui]");
      await expect(workspace).toBeVisible();

      const row = fixtureRow(page);
      await expect(row.getByLabel("Vendor")).toHaveValue(FIXTURE_VENDOR);
      await expect(row.getByLabel("Amount")).toHaveValue(FIXTURE_AMOUNT);
      await expect(row.getByLabel("Expense date")).toHaveValue("2026-09-01");
      await expect(row.getByText("Ready", { exact: true })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        row: Array.from(document.querySelectorAll<HTMLElement>("[data-receipt-queue-row]"))
          .map((element) => element.scrollWidth - element.clientWidth)
          .reduce((largest, delta) => Math.max(largest, delta), 0),
      }));
      expect(overflow, `${viewport.name} horizontal overflow`).toEqual({ document: 0, row: 0 });

      if (viewport.width <= 820) {
        const controls = row.locator(
          'button:visible, input:visible, select:visible, [role="combobox"]:visible'
        );
        const undersized = await controls.evaluateAll((elements) =>
          elements
            .map((element) => ({
              label:
                element.getAttribute("aria-label") ||
                element.getAttribute("data-queue-field") ||
                element.textContent?.trim() ||
                element.tagName,
              height: Math.round(element.getBoundingClientRect().height),
              width: Math.round(element.getBoundingClientRect().width),
            }))
            .filter(({ height, width }) => height < 44 || width < 44)
        );
        expect(undersized, `${viewport.name} controls below 44px`).toEqual([]);

        if (viewport.width === 820) {
          const allFilter = page.getByRole("button", { name: "All", exact: true });
          const allFilterBox = await allFilter.boundingBox();
          expect(allFilterBox, "tablet Receipt Queue All filter geometry").not.toBeNull();
          expect(
            allFilterBox!.width,
            "tablet Receipt Queue All filter width"
          ).toBeGreaterThanOrEqual(44);
          expect(
            allFilterBox!.height,
            "tablet Receipt Queue All filter height"
          ).toBeGreaterThanOrEqual(44);
        }
      }
    });
  }
});

test("Receipt Queue preview remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReceiptQueue(page);
  const row = fixtureRow(page);
  await row.getByRole("button", { name: "Preview receipt" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(FIXTURE_FILE);
});

test("Receipt Queue makes loading and empty states explicit", async ({ page }) => {
  await loginAsE2EOwner(page, "/dashboard");
  let releaseQueue!: () => void;
  const queueGate = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await page.route("**/rest/v1/receipt_queue**", async (route) => {
    await queueGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0" },
      body: "[]",
    });
  });

  await page.goto("/receipt-queue", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status", { name: "Loading queue" })).toBeVisible();
  releaseQueue();
  await expect(page.locator("[data-receipt-queue-empty]")).toBeVisible({ timeout: 15_000 });
});

test("Receipt Queue exposes a persistent error channel when the queue query fails", async ({
  page,
}) => {
  await loginAsE2EOwner(page, "/dashboard");
  await page.route("**/rest/v1/receipt_queue**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "[E2E] receipt queue unavailable" }),
    });
  });
  await page.goto("/receipt-queue", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("receipt-queue-error")).toContainText(
    "Unable to load receipt queue",
    { timeout: 15_000 }
  );
});

test("Receipt Queue compact rows avoid high-frequency pointer motion", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openReceiptQueue(page);
  const row = fixtureRow(page);

  await row.hover({ position: { x: 2, y: 2 } });
  await expect
    .poll(() => row.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");

  await page.mouse.down();
  await expect
    .poll(() => row.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");
  await page.mouse.up();
});

test("Receipt Queue validation remains visible without shake under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 820, height: 1180 });
  await openReceiptQueue(page);

  for (const validation of [
    {
      row: validationFixtureRow(page, AMOUNT_VALIDATION_FIXTURE_FILE),
      field: "Amount",
      message: "Amount required",
    },
    {
      row: validationFixtureRow(page, VENDOR_VALIDATION_FIXTURE_FILE),
      field: "Vendor",
      message: "Vendor required",
    },
  ] as const) {
    await validation.row.getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.locator('[data-toast="true"]').filter({ hasText: validation.message }).last()
    ).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    const animationName = await validation.row
      .getByLabel(validation.field)
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(animationName, `${validation.field} validation movement`).toBe("none");
  }
});

test("Receipt Queue exit and progress motion avoid layout properties and honor reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 820, height: 1180 });
  await openReceiptQueue(page);

  const progress = page.getByRole("progressbar", { name: "Receipt queue completion" });
  await expect(progress).toBeVisible();
  const progressTransition = await progress.evaluate(
    (element) => getComputedStyle(element).transitionProperty
  );
  expect(progressTransition.split(",").map((property) => property.trim())).not.toContain("width");

  const row = motionFixtureRow(page);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => row.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");

  const reducedFade = await row.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      transitionProperties: style.transitionProperty.split(",").map((property) => property.trim()),
    };
  });
  expect(reducedFade.transform).toBe("none");
  expect(reducedFade.transitionProperties).not.toEqual(
    expect.arrayContaining(["max-height", "margin", "padding", "width"])
  );

  await expect(row).toBeHidden({ timeout: 5_000 });
});

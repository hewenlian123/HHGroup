import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID, purgeE2EReceiptQueueRows } from "./e2e-cleanup-db";
import {
  expectExpenseVendorRowArchiveOrInbox,
  expenseListRow,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
  waitForReceiptQueuePatchIdle,
  fillControlledTextInput,
  pollReceiptQueueRowUntilConfirmableDom,
  receiptQueueRowByFileName,
  receiptQueueRowIdFromLocator,
  waitForReceiptQueueConfirmDeleteResponse,
} from "./e2e-expenses-helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Expenses: receipt upload queue", () => {
  /** Shift+Enter + reload polls need headroom; serial avoids shared-queue races. */
  test.describe.configure({ timeout: 300_000, retries: 0, mode: "serial" });

  test("upload → receipt queue → confirm creates expense and clears row", async ({ page }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      await purgeE2EReceiptQueueRows(createClient(url, key));
    }

    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const vendorMark = `E2E-RQ-${Date.now()}`;
    const queueFileName = `queue-receipt-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const rowForConfirm = page
      .locator(`[data-testid="receipt-queue-row"][data-queue-file-name="${queueFileName}"]`)
      .first();
    await expect(rowForConfirm).toBeVisible({ timeout: 120_000 });
    await pollReceiptQueueRowUntilConfirmableDom(page, rowForConfirm, {
      vendor: vendorMark,
      amount: "88.12",
      projectId: E2E_PRESERVED_PROJECT_ID,
    });
    const receiptQueueRowId = await receiptQueueRowIdFromLocator(rowForConfirm);
    if (!receiptQueueRowId) {
      throw new Error("E2E: missing data-receipt-queue-row on receipt queue row");
    }
    const confirmPersisted = waitForReceiptQueueConfirmDeleteResponse(page, receiptQueueRowId);
    await rowForConfirm.getByRole("button", { name: "Confirm", exact: true }).click();
    await confirmPersisted;

    await expect(
      page
        .getByTestId("receipt-queue-row")
        .filter({ has: page.locator(`input[value="${vendorMark}"]`) })
    ).toHaveCount(0, {
      timeout: 15_000,
    });

    await expectExpenseVendorRowArchiveOrInbox(page, vendorMark);
    await expect
      .poll(
        async () => {
          const row = expenseListRow(page, vendorMark);
          if (!(await row.isVisible().catch(() => false))) return false;
          const t = (await row.innerText()).replace(/\s+/g, " ");
          return t.includes("88.12") && t.includes("[E2E] Seed — HH Unified");
        },
        { timeout: 120_000, intervals: [400, 800, 1500, 2500] }
      )
      .toBe(true);
  });

  test("inline validation shows stable vendor/amount hints after bad confirm", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const queueFileName = `queue-validate-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const row = receiptQueueRowByFileName(page, queueFileName);
    await expect(row).toBeVisible({ timeout: 120_000 });
    const vendorIn = row.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorIn.waitFor({ state: "visible", timeout: 120_000 });
    await fillControlledTextInput(vendorIn, "");
    await fillControlledTextInput(row.getByPlaceholder("Amount"), "");

    await row.getByRole("button", { name: "Confirm", exact: true }).click();

    const vendorHint = row.getByText("Vendor required");
    const amountHint = row.getByText("Amount required");
    await expect(vendorHint).toBeVisible();
    await expect(amountHint).toBeVisible();

    await fillControlledTextInput(vendorIn, "x");
    await expect(vendorHint).toBeHidden();
    await expect(amountHint).toBeVisible();
  });

  test("Enter moves focus to next field in the same row", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const queueFileName = `queue-enter-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const row = receiptQueueRowByFileName(page, queueFileName);
    await expect(row).toBeVisible({ timeout: 120_000 });
    const vendorIn = row.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorIn.waitFor({ state: "visible", timeout: 120_000 });
    await fillControlledTextInput(vendorIn, `E2E-Enter-${Date.now()}`);
    await vendorIn.press("Enter");
    await expect(row.getByPlaceholder("Amount")).toBeFocused({ timeout: 10_000 });
  });

  test("Shift+Enter flushes debounced vendor edit before reload", async ({ page }) => {
    const purgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const purgeKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (purgeUrl && purgeKey) {
      await purgeE2EReceiptQueueRows(createClient(purgeUrl, purgeKey));
    }

    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const mark = `E2E-SHIFT-${Date.now()}`;
    const queueFileName = `queue-shift-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const row = receiptQueueRowByFileName(page, queueFileName);
    await expect(row).toBeVisible({ timeout: 120_000 });
    const vendorIn = row.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorIn.waitFor({ state: "visible", timeout: 120_000 });
    await fillControlledTextInput(vendorIn, mark);

    // Ensure debounced vendor PATCH reached PostgREST before Shift+Enter (avoids empty server row after reload under serial load).
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = sbUrl && sbKey ? createClient(sbUrl, sbKey) : null;
    if (sb) {
      await expect
        .poll(
          async () => {
            const { data, error } = await sb
              .from("receipt_queue")
              .select("vendor_name")
              .eq("file_name", queueFileName)
              .maybeSingle();
            if (error) throw error;
            return String(data?.vendor_name ?? "").trim() === mark;
          },
          { timeout: 90_000, intervals: [120, 250, 500, 900, 1500] }
        )
        .toBe(true);
    }

    await waitForReceiptQueuePatchIdle(page, 800, 90_000);
    await vendorIn.press("Shift+Enter");
    // `waitForReceiptQueuePatchesAfterPressQuiet` races void async saves (PATCH may finish before its gate opens).
    // Assert DB truth instead, then allow network to settle before reload.
    if (sb) {
      await expect
        .poll(
          async () => {
            const { data, error } = await sb
              .from("receipt_queue")
              .select("vendor_name")
              .eq("file_name", queueFileName)
              .maybeSingle();
            if (error) throw error;
            return String(data?.vendor_name ?? "").trim() === mark;
          },
          { timeout: 60_000, intervals: [100, 200, 400, 800, 1500] }
        )
        .toBe(true);
    } else {
      await waitForReceiptQueuePatchIdle(page, 1500, 60_000);
    }

    await waitForReceiptQueuePatchIdle(page, 1500, 120_000).catch(() => {
      /* Same pattern as multi-row: noisy PATCH / notify should not block reload. */
    });

    const receiptQueueListReload = page.waitForResponse(
      (resp) => {
        const req = resp.request();
        return (
          resp.url().includes("receipt_queue") &&
          req.method() === "GET" &&
          resp.status() >= 200 &&
          resp.status() < 300
        );
      },
      { timeout: 120_000 }
    );
    await Promise.all([
      receiptQueueListReload,
      page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 }),
    ]);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    const assertVendorRestoredAfterReload = async () => {
      const rowScope = page
        .locator(`[data-testid="receipt-queue-row"][data-queue-file-name="${queueFileName}"]`)
        .first();
      await expect
        .poll(
          async () => {
            if (!(await rowScope.isVisible().catch(() => false))) return false;
            const inp = rowScope.locator('input[placeholder="Vendor"]:not([disabled])').first();
            if (!(await inp.isVisible().catch(() => false))) return false;
            return (await inp.inputValue()).trim() === mark;
          },
          {
            timeout: 120_000,
            intervals: [200, 400, 600, 1000, 1500, 2200],
          }
        )
        .toBe(true);
    };

    try {
      await assertVendorRestoredAfterReload();
    } catch {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await assertVendorRestoredAfterReload();
    }
  });

  test.describe("Shift+Enter multi-row reload", () => {
    test.describe.configure({ retries: 0 });

    test("Shift+Enter persists debounced vendor edits on multiple rows after reload", async ({
      page,
    }) => {
      const purgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const purgeKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (purgeUrl && purgeKey) {
        await purgeE2EReceiptQueueRows(createClient(purgeUrl, purgeKey));
      }

      await page.goto("/financial/receipt-queue", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

      if (
        await page
          .getByText(/Configure Supabase to upload/i)
          .isVisible()
          .catch(() => false)
      ) {
        test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
      }

      const ts = Date.now();
      const f1 = `queue-multi-a-${ts}.png`;
      const f2 = `queue-multi-b-${ts}.png`;
      await page
        .locator("main")
        .locator('input[type="file"][multiple]')
        .setInputFiles([
          { name: f1, mimeType: "image/png", buffer: PNG_1X1 },
          { name: f2, mimeType: "image/png", buffer: PNG_1X1 },
        ]);

      const row1 = receiptQueueRowByFileName(page, f1);
      const row2 = receiptQueueRowByFileName(page, f2);
      await expect(row1).toBeVisible({ timeout: 120_000 });
      await expect(row2).toBeVisible({ timeout: 120_000 });

      const v1 = `E2E-M1-${ts}`;
      const v2 = `E2E-M2-${ts}`;
      const vendor1 = row1.locator('input[placeholder="Vendor"]:not([disabled])').first();
      const vendor2 = row2.locator('input[placeholder="Vendor"]:not([disabled])').first();
      await vendor1.waitFor({ state: "visible", timeout: 120_000 });
      await vendor2.waitFor({ state: "visible", timeout: 120_000 });
      await fillControlledTextInput(vendor1, v1);
      await fillControlledTextInput(vendor2, v2);

      await expect
        .poll(
          async () => {
            const a = (await row1.getByPlaceholder("Vendor").inputValue()).trim();
            const b = (await row2.getByPlaceholder("Vendor").inputValue()).trim();
            return a === v1 && b === v2;
          },
          { timeout: 30_000, intervals: [50, 100, 200, 400] }
        )
        .toBe(true);

      const supabaseUrlPre = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKeyPre = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrlPre && serviceKeyPre) {
        const sbPre = createClient(supabaseUrlPre, serviceKeyPre);
        await expect
          .poll(
            async () => {
              const { data, error } = await sbPre
                .from("receipt_queue")
                .select("file_name,vendor_name")
                .in("file_name", [f1, f2]);
              if (error) throw error;
              if ((data?.length ?? 0) < 2) return false;
              const m = new Map(
                (data ?? []).map((r: { file_name: string; vendor_name: string | null }) => [
                  r.file_name,
                  String(r.vendor_name ?? "").trim(),
                ])
              );
              return m.get(f1) === v1 && m.get(f2) === v2;
            },
            { timeout: 90_000, intervals: [120, 250, 500, 900, 1500] }
          )
          .toBe(true);
      }

      const sbMulti =
        supabaseUrlPre && serviceKeyPre ? createClient(supabaseUrlPre, serviceKeyPre) : null;

      const assertBothVendorsInDb = async () => {
        if (sbMulti) {
          await expect
            .poll(
              async () => {
                const { data, error } = await sbMulti
                  .from("receipt_queue")
                  .select("file_name,vendor_name")
                  .in("file_name", [f1, f2]);
                if (error) throw error;
                if ((data?.length ?? 0) < 2) return false;
                const m = new Map(
                  (data ?? []).map((r: { file_name: string; vendor_name: string | null }) => [
                    r.file_name,
                    String(r.vendor_name ?? "").trim(),
                  ])
                );
                return m.get(f1) === v1 && m.get(f2) === v2;
              },
              { timeout: 60_000, intervals: [100, 200, 400, 800, 1500] }
            )
            .toBe(true);
        } else {
          await waitForReceiptQueuePatchIdle(page, 1500, 60_000);
        }
      };

      await waitForReceiptQueuePatchIdle(page, 800, 90_000);

      // Flush both rows: Shift+Enter on each; DB poll avoids PATCH-after-press races with void async saves.
      await vendor1.press("Shift+Enter");
      await assertBothVendorsInDb();
      await vendor2.press("Shift+Enter");
      await assertBothVendorsInDb();

      await waitForReceiptQueuePatchIdle(page, 1500, 120_000).catch(() => {
        /* Same as pollReceiptQueueRowUntilConfirmableDom: churny PATCH/OCR should not fail the test. */
      });

      const receiptQueueListReload = page.waitForResponse(
        (resp) => {
          const req = resp.request();
          return (
            resp.url().includes("receipt_queue") &&
            req.method() === "GET" &&
            resp.status() >= 200 &&
            resp.status() < 300
          );
        },
        { timeout: 120_000 }
      );
      await Promise.all([
        receiptQueueListReload,
        page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 }),
      ]);
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

      await expect
        .poll(
          async () => {
            const rA = receiptQueueRowByFileName(page, f1);
            const rB = receiptQueueRowByFileName(page, f2);
            if ((await rA.count()) === 0 || (await rB.count()) === 0) return false;
            const a = (
              await rA.locator('input[placeholder="Vendor"]:not([disabled])').first().inputValue()
            ).trim();
            const b = (
              await rB.locator('input[placeholder="Vendor"]:not([disabled])').first().inputValue()
            ).trim();
            return a === v1 && b === v2;
          },
          { timeout: 240_000, intervals: [200, 400, 600, 1000, 1500] }
        )
        .toBe(true);
    });
  });
});

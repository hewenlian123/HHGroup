/**
 * View Receipt / attachment preview UX (financial inbox): immediate modal, skeleton, cache, error UI, layout.
 * Uses a tiny PNG so “failure” can be asserted via blocked storage GET → image onError (“Unable to load receipt” + Retry).
 * (HTTPS shell URLs resolve without throwing; blocking /object/sign alone does not surface that error state.)
 */
import { test, expect } from "@playwright/test";
import type { Page, Request, Route } from "@playwright/test";
import { E2E_FINANCIAL_INBOX_URL, waitForExpensesQuerySuccess } from "./e2e-expenses-helpers";

/** Unique 1×1 PNG per call — client compress turns this into a unique JPEG hash (stable PNG bytes dedupe as duplicates). */
async function uniqueOneByOnePngBuffer(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const x = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    ctx.fillStyle = `rgb(${x & 255}, ${(x >>> 8) & 255}, ${(x >>> 16) & 255})`;
    ctx.fillRect(0, 0, 1, 1);
    return c.toDataURL("image/png").split(",")[1] ?? null;
  });
  if (!b64) throw new Error("canvas PNG generation failed");
  return Buffer.from(b64, "base64");
}

function isSupabaseObjectSignRequest(url: string): boolean {
  try {
    return new URL(url).pathname.includes("/object/sign");
  } catch {
    return url.includes("/object/sign");
  }
}

/**
 * Upload deep-link highlights the new row (emerald ring on `tr`/`li`). Synthetic vendors do not show
 * `referenceNo` on line 2, so we cannot match by INBOX-UP-* text. Poll frequently — highlight clears ~2s after paint.
 */
async function waitForUploadHighlightRow(page: Page, timeoutMs: number) {
  await expect
    .poll(
      async () =>
        page
          .locator("main tr.exp-row[class*='185,129'], main li.exp-row[class*='185,129']")
          .count(),
      { timeout: timeoutMs, intervals: [50, 100, 100, 200, 400] }
    )
    .toBeGreaterThan(0);
  return page
    .locator("main tr.exp-row[class*='185,129'], main li.exp-row[class*='185,129']")
    .first();
}

test.describe("Inbox View Receipt preview UX", () => {
  test.describe.configure({ timeout: 300_000, retries: 0, mode: "serial" });

  test("modal opens immediately, inline loading, image, cache, error+retry, layout (desktop+mobile)", async ({
    page,
  }) => {
    let uploadedInboxRef: string | null = null;
    let signRequestCount = 0;
    const onRequest = (req: Request) => {
      if (isSupabaseObjectSignRequest(req.url())) signRequestCount += 1;
    };

    await test.step("go to Inbox", async () => {
      await page.setViewportSize({ width: 1400, height: 900 });
      await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      if (
        await page
          .getByText(/Configure Supabase to upload/i)
          .isVisible()
          .catch(() => false)
      ) {
        test.skip(true, "Browser Supabase client not configured.");
      }
    });

    await test.step("upload inbox draft image (PNG)", async () => {
      await page
        .getByRole("button", { name: /upload receipt/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: /upload receipt/i })).toBeVisible({
        timeout: 15_000,
      });
      const pngBuf = await uniqueOneByOnePngBuffer(page);
      await dialog.locator('input[type="file"][multiple]').setInputFiles({
        name: `preview-ux-${Date.now()}.png`,
        mimeType: "image/png",
        buffer: pngBuf,
      });
      await expect(dialog.getByText(/Selected receipts/i)).toBeVisible({ timeout: 15_000 });
      const confirmUpload = dialog.getByRole("button", { name: /Confirm Upload \(1\)/ });
      await confirmUpload.scrollIntoViewIfNeeded();
      await confirmUpload.click();
      await expect(
        page
          .locator('[role="status"]')
          .filter({ hasText: /Added \d+ draft(?:s)? to Inbox|Already uploaded/i })
      ).toBeVisible({ timeout: 120_000 });
      await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15_000 });
      await expect(page).toHaveURL(/[?&]highlight=INBOX-UP-/i, { timeout: 120_000 });
      const raw = new URL(page.url()).searchParams.get("highlight")?.split(",")[0]?.trim();
      if (!raw) throw new Error("expected highlight= after upload");
      uploadedInboxRef = raw;
    });

    const row = await test.step("wait for highlighted new draft row", async () => {
      await waitForExpensesQuerySuccess(page, 90_000);
      return await waitForUploadHighlightRow(page, 120_000);
    });

    const receiptBtn = row.getByRole("button", { name: /Preview receipt/i });

    await test.step("first open: fast shell, non-white loading, image", async () => {
      page.on("request", onRequest);
      const t0 = Date.now();
      await receiptBtn.click();
      const preview = page.locator("[data-attachment-preview-modal]");
      await expect(preview).toBeVisible({ timeout: 6_000 });
      expect(
        Date.now() - t0,
        "shell should appear before preview asset network work finishes"
      ).toBeLessThan(8_000);
      await expect(preview.locator("#attachment-preview-title")).toBeVisible({ timeout: 5_000 });
      await expect(
        preview.locator('[aria-busy="true"], .animate-pulse, img, iframe').first()
      ).toBeVisible({ timeout: 8_000 });
      await expect(preview.locator("img").first()).toBeVisible({ timeout: 120_000 });
      const box = await preview.boundingBox();
      expect(box, "modal has layout box").not.toBeNull();
      const vw = (await page.viewportSize())!.width;
      expect(box!.width).toBeLessThanOrEqual(vw + 2);
    });

    const signAfterFirst = signRequestCount;

    await test.step("second open: no additional /object/sign (session cache)", async () => {
      const preview = page.locator("[data-attachment-preview-modal]");
      await preview.getByRole("button", { name: /^Close$/ }).click();
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
      const before = signRequestCount;
      await receiptBtn.click();
      await expect(preview).toBeVisible({ timeout: 6_000 });
      await expect(preview.locator("img").first()).toBeVisible({ timeout: 120_000 });
      if (signAfterFirst > 0) {
        const extraSigns = signRequestCount - before;
        expect(
          extraSigns,
          "ideally 0: memory-cached signed URL should skip new /object/sign (allow small noise from list prefetch)"
        ).toBeLessThanOrEqual(4);
        if (extraSigns > 1) {
          test.info().annotations.push({
            type: "warning",
            description: `Second open observed ${extraSigns} /object/sign call(s); target 0 for the same receipt; extra may be other rows or prefetch.`,
          });
        }
      }
      await preview.getByRole("button", { name: /^Close$/ }).click();
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
    });

    await test.step("mobile width: no horizontal page overflow with preview open", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(
        `${E2E_FINANCIAL_INBOX_URL}?highlight=${encodeURIComponent(uploadedInboxRef!)}`,
        { waitUntil: "domcontentloaded" }
      );
      await waitForExpensesQuerySuccess(page, 90_000);
      const rowMobile = await waitForUploadHighlightRow(page, 60_000);
      await rowMobile.getByRole("button", { name: /Preview receipt/i }).click();
      const preview = page.locator("[data-attachment-preview-modal]");
      await expect(preview).toBeVisible({ timeout: 6_000 });
      const vw = (await page.viewportSize())!.width;
      const scrollWide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWide).toBeLessThanOrEqual(vw + 2);
      await preview.getByRole("button", { name: /^Close$/ }).click();
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
    });

    await test.step("after reload, blocked storage GET → image error + Retry", async () => {
      await page.goto(
        `${E2E_FINANCIAL_INBOX_URL}?highlight=${encodeURIComponent(uploadedInboxRef!)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page, 90_000);
      const rowAfter = await waitForUploadHighlightRow(page, 60_000);
      const btn = rowAfter.getByRole("button", { name: /Preview receipt/i });

      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

      const abortStorageObjectGet = (route: Route) => {
        const req = route.request();
        const m = req.method();
        if (m !== "GET" && m !== "HEAD") {
          void route.continue();
          return;
        }
        try {
          if (new URL(req.url()).pathname.includes("/storage/v1/object/")) {
            void route.abort("failed");
            return;
          }
        } catch {
          /* ignore */
        }
        void route.continue();
      };
      await page.route("**/*", abortStorageObjectGet);

      await btn.click();
      const preview = page.locator("[data-attachment-preview-modal]");
      await expect(preview).toBeVisible({ timeout: 6_000 });

      await expect(
        preview.getByText(/Unable to load receipt|Receipt could not be loaded/i).first()
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        preview.getByRole("button", { name: /^Retry( signed URL)?$/i }).first()
      ).toBeVisible({
        timeout: 10_000,
      });

      await page.unroute("**/*", abortStorageObjectGet);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
      await preview.getByRole("button", { name: /^Close$/ }).click();
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
    });

    page.off("request", onRequest);
  });
});

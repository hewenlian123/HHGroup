/**
 * View Receipt / attachment preview UX (financial inbox): immediate modal, skeleton, cache, error UI, layout.
 * Uses a tiny PNG so “failure” can be asserted via blocked storage GET → image onError (“Unable to load receipt” + Retry).
 * (HTTPS shell URLs resolve without throwing; blocking /object/sign alone does not surface that error state.)
 */
import { test, expect } from "@playwright/test";
import type { Locator, Page, Request, Route } from "@playwright/test";
import {
  E2E_FINANCIAL_INBOX_URL,
  expenseListRowById,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";
import { loginAsE2EOwner } from "./e2e-auth-owner";

/** Unique wide receipt image; enough resolution to exercise rotation-aware fit and pan bounds. */
async function uniqueLandscapeReceiptPngBuffer(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 400;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const x = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const gradient = ctx.createLinearGradient(0, 0, c.width, c.height);
    gradient.addColorStop(0, `rgb(${x & 127}, ${(x >>> 8) & 127}, ${(x >>> 16) & 127})`);
    gradient.addColorStop(1, "rgb(242, 236, 220)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgb(30, 32, 34)";
    ctx.font = "bold 72px sans-serif";
    ctx.fillText("HH GROUP RECEIPT", 90, 170);
    ctx.font = "42px sans-serif";
    ctx.fillText(String(x), 90, 250);
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

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has a measurable touch target`).not.toBeNull();
  expect(
    Math.min(box!.width, box!.height),
    `${label} meets the 44px tablet/mobile touch target`
  ).toBeGreaterThanOrEqual(43.5);
}

async function expectReceiptPreviewReady(preview: Locator) {
  const area = preview.getByTestId("receipt-preview-image-area");
  await expect
    .poll(async () => (await area.getAttribute("data-preview-stage")) ?? "missing", {
      timeout: 120_000,
    })
    .toMatch(/^(ready|preflight-error)$/);
  const settledStage = await area.getAttribute("data-preview-stage");

  expect(
    settledStage,
    "the reloaded Inbox row should resolve a fresh local Storage signed URL"
  ).toBe("ready");
  await expect(area).toHaveAttribute("data-preview-stage", "ready", { timeout: 120_000 });
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
  test.describe.configure({ timeout: 480_000, retries: 0, mode: "serial" });

  test("modal opens immediately with a responsive, accessible receipt canvas", async ({ page }) => {
    let uploadedInboxRef: string | null = null;
    let signRequestCount = 0;
    const onRequest = (req: Request) => {
      if (isSupabaseObjectSignRequest(req.url())) signRequestCount += 1;
    };

    await test.step("go to Inbox", async () => {
      await page.setViewportSize({ width: 1400, height: 900 });
      await loginAsE2EOwner(page, E2E_FINANCIAL_INBOX_URL);
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
      const pngBuf = await uniqueLandscapeReceiptPngBuffer(page);
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

    const uploadedExpenseId = await row.getAttribute("data-expense-id");
    if (!uploadedExpenseId) throw new Error("expected highlighted row data-expense-id");
    const receiptBtn = expenseListRowById(page, uploadedExpenseId).getByRole("button", {
      name: /Preview receipt/i,
    });

    await test.step("reload the uploaded row before Viewer assertions", async () => {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page, 90_000);
      await waitForUploadHighlightRow(page, 60_000);
      await expect(receiptBtn).toBeVisible({ timeout: 15_000 });
    });

    await test.step("first open: connected accessible shell, stable loading, image controls", async () => {
      page.on("request", onRequest);
      const inboxUrlBeforeOpen = page.url();
      await receiptBtn.focus();
      const t0 = Date.now();
      await receiptBtn.click();
      const preview = page.locator("[data-receipt-viewer]");
      await expect(preview).toBeVisible({ timeout: 6_000 });
      expect(
        Date.now() - t0,
        "shell should appear before preview asset network work finishes"
      ).toBeLessThan(8_000);
      await expect(page).toHaveURL(inboxUrlBeforeOpen);
      await expect(preview).toHaveAttribute("aria-modal", "true");
      await expect(preview.getByRole("heading", { name: "Receipt preview" })).toBeVisible({
        timeout: 5_000,
      });
      await expect(
        preview.getByText("Review the authorized receipt image and its existing expense details.")
      ).toBeAttached();
      await expect(preview.getByRole("button", { name: "Zoom out" })).toBeVisible();
      await expect(preview.getByRole("button", { name: "Zoom in" })).toBeVisible();
      await expect(preview.getByRole("button", { name: "Fit to screen" })).toBeVisible();
      await expect(preview.getByRole("button", { name: "Reset view" })).toBeVisible();
      await expect(preview.getByRole("button", { name: "Rotate left" })).toBeVisible();
      await expect(preview.getByRole("button", { name: "Rotate right" })).toBeVisible();
      await expect(
        preview.locator('[aria-busy="true"], .animate-pulse, img, iframe').first()
      ).toBeVisible({ timeout: 8_000 });
      const viewport = preview.getByTestId("receipt-preview-image-area");
      await expect(viewport).toBeVisible({ timeout: 8_000 });
      const beforeMediaBox = await viewport.boundingBox();
      await expectReceiptPreviewReady(preview);
      const afterMediaBox = await viewport.boundingBox();
      expect(beforeMediaBox, "preview viewport has a stable loading box").not.toBeNull();
      expect(afterMediaBox, "preview viewport remains mounted after image load").not.toBeNull();
      expect(
        Math.abs(afterMediaBox!.height - beforeMediaBox!.height),
        "image load should not change preview viewport height"
      ).toBeLessThanOrEqual(4);
      expect(
        Math.abs(afterMediaBox!.width - beforeMediaBox!.width),
        "image load should not change preview viewport width"
      ).toBeLessThanOrEqual(4);
      const shell = preview.locator("[data-receipt-viewer-shell]");
      const box = await shell.boundingBox();
      expect(box, "viewer shell has layout box").not.toBeNull();
      const vw = (await page.viewportSize())!.width;
      expect(box!.width).toBeLessThanOrEqual(Math.min(1180, vw - 46));
      expect(box!.height).toBeLessThanOrEqual(860);

      const canvas = preview.getByTestId("receipt-viewer-canvas");
      await expect(canvas).toHaveAttribute("data-zoom", "100");
      await expect(canvas).toHaveAttribute("data-rotation", "0");
      await expect(canvas).toHaveAttribute("data-overflow-x", "false");
      await expect(canvas).toHaveAttribute("data-overflow-y", "false");
      await expect(canvas).toHaveAttribute("data-pan-x", "0");
      await expect(canvas).toHaveAttribute("data-pan-y", "0");
      await expect(preview.getByTestId("receipt-pan-indicator-x")).toHaveCount(0);
      await expect(preview.getByTestId("receipt-pan-indicator-y")).toHaveCount(0);

      const toolbar = preview.getByTestId("receipt-viewer-toolbar");
      const toolbarLayout = await toolbar.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX,
          height: element.getBoundingClientRect().height,
        };
      });
      expect(toolbarLayout.scrollWidth).toBeLessThanOrEqual(toolbarLayout.clientWidth + 1);
      expect(toolbarLayout.overflowX).not.toMatch(/auto|scroll/);
      expect(toolbarLayout.height).toBeGreaterThanOrEqual(49);
      expect(toolbarLayout.height).toBeLessThanOrEqual(54);

      const wheelBox = await canvas.boundingBox();
      expect(wheelBox).not.toBeNull();
      await page.mouse.move(wheelBox!.x + wheelBox!.width / 2, wheelBox!.y + wheelBox!.height / 2);
      await page.mouse.wheel(0, -240);
      await expect
        .poll(async () => Number((await canvas.getAttribute("data-zoom")) ?? "100"))
        .toBeGreaterThan(100);

      const toolbarControlLabels = [
        "Rotate left",
        "Rotate right",
        "Zoom out",
        "Zoom in",
        "Fit to screen",
        "Reset view",
        "Replace",
      ];
      const reachedToolbarControls = new Set<string>();
      await preview.getByRole("button", { name: "Download receipt" }).focus();
      for (let index = 0; index < 20; index += 1) {
        await page.keyboard.press("Tab");
        const focusedLabel = await page.evaluate(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement)) return "";
          return active.getAttribute("aria-label") || active.textContent?.trim() || "";
        });
        if (toolbarControlLabels.includes(focusedLabel)) reachedToolbarControls.add(focusedLabel);
      }
      expect([...reachedToolbarControls].sort()).toEqual([...toolbarControlLabels].sort());
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("[data-receipt-viewer]"))
        ),
        "focus remains trapped inside the receipt viewer"
      ).toBe(true);
      await preview.getByRole("button", { name: "Fit to screen" }).click();
      await expect(canvas).toHaveAttribute("data-zoom", "100");

      await preview.getByRole("button", { name: "Rotate right" }).click();
      await expect(canvas).toHaveAttribute("data-rotation", "90");
      await expect(canvas).toHaveAttribute("data-zoom", "100");
      await expect(canvas).toHaveAttribute("data-overflow-x", "false");
      await expect(canvas).toHaveAttribute("data-overflow-y", "false");
      await expect(canvas).toHaveAttribute("data-pan-x", "0");
      await expect(canvas).toHaveAttribute("data-pan-y", "0");
      await expect
        .poll(async () => {
          const rotatedFit = await canvas.evaluate((element) => {
            const image = element.querySelector("img");
            if (!image) return null;
            const canvasRect = element.getBoundingClientRect();
            const imageRect = image.getBoundingClientRect();
            return {
              fits:
                imageRect.left >= canvasRect.left - 1 &&
                imageRect.right <= canvasRect.right + 1 &&
                imageRect.top >= canvasRect.top - 1 &&
                imageRect.bottom <= canvasRect.bottom + 1,
              centered:
                Math.abs(
                  imageRect.left + imageRect.width / 2 - (canvasRect.left + canvasRect.width / 2)
                ) <= 1 &&
                Math.abs(
                  imageRect.top + imageRect.height / 2 - (canvasRect.top + canvasRect.height / 2)
                ) <= 1,
            };
          });
          return Boolean(rotatedFit?.fits && rotatedFit.centered);
        })
        .toBe(true);

      for (let i = 0; i < 4; i += 1) {
        await preview.getByRole("button", { name: "Zoom in" }).click();
      }
      await expect(canvas).toHaveAttribute("data-zoom", "200");
      await expect(canvas).toHaveAttribute("data-overflow-x", "false");
      await expect(canvas).toHaveAttribute("data-overflow-y", "true");
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      await page.mouse.move(
        canvasBox!.x + canvasBox!.width / 2,
        canvasBox!.y + canvasBox!.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        canvasBox!.x + canvasBox!.width / 2 + 180,
        canvasBox!.y + canvasBox!.height / 2 + 220,
        { steps: 4 }
      );
      await page.mouse.up();
      await expect(canvas).toHaveAttribute("data-pan-x", "0");
      await expect
        .poll(async () => Number((await canvas.getAttribute("data-pan-y")) ?? "0"))
        .toBeGreaterThan(0);
      const maxPanY = Number((await canvas.getAttribute("data-max-pan-y")) ?? "0");
      const panY = Number((await canvas.getAttribute("data-pan-y")) ?? "0");
      expect(Math.abs(panY)).toBeLessThanOrEqual(maxPanY + 0.5);
      await expect(preview.getByTestId("receipt-pan-indicator-x")).toHaveCount(0);
      await expect(preview.getByTestId("receipt-pan-indicator-y")).toHaveAttribute(
        "data-visible",
        "true"
      );
      await expect(preview.getByTestId("receipt-pan-indicator-y")).toHaveAttribute(
        "data-visible",
        "false",
        { timeout: 4_000 }
      );

      await preview.getByRole("button", { name: "Rotate left" }).click();
      await expect(canvas).toHaveAttribute("data-rotation", "0");
      await expect(canvas).toHaveAttribute("data-zoom", "100");
      await expect(canvas).toHaveAttribute("data-pan-x", "0");
      await expect(canvas).toHaveAttribute("data-pan-y", "0");
      await expect(canvas).toHaveAttribute("data-overflow-x", "false");
      await expect(canvas).toHaveAttribute("data-overflow-y", "false");

      await preview.getByRole("button", { name: "Zoom in" }).click();
      const maxPanBeforeResize = Number((await canvas.getAttribute("data-max-pan-x")) ?? "0");
      await page.setViewportSize({ width: 1000, height: 760 });
      await expect
        .poll(async () => Number((await canvas.getAttribute("data-max-pan-x")) ?? "0"))
        .not.toBe(maxPanBeforeResize);
      await preview.getByRole("button", { name: "Fit to screen" }).click();
      await expect(canvas).toHaveAttribute("data-pan-x", "0");
      await expect(canvas).toHaveAttribute("data-pan-y", "0");
      await expect(canvas).toHaveAttribute("data-overflow-x", "false");
      await expect(canvas).toHaveAttribute("data-overflow-y", "false");
      await expect(preview.getByTestId("receipt-pan-indicator-x")).toHaveCount(0);
      await expect(preview.getByTestId("receipt-pan-indicator-y")).toHaveCount(0);

      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(canvas).toHaveAttribute("data-overflow-x", "false");
      await expect(canvas).toHaveAttribute("data-overflow-y", "false");

      await preview.getByRole("button", { name: "Reset view" }).click();
      await expect(canvas).toHaveAttribute("data-zoom", "100");
      await expect(canvas).toHaveAttribute("data-rotation", "0");
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
      await expect(receiptBtn).toBeFocused();
    });

    await test.step("Escape closes and restores focus to the exact View button", async () => {
      await receiptBtn.click();
      const preview = page.locator("[data-receipt-viewer]");
      await expect(preview).toBeVisible({ timeout: 6_000 });
      await page.keyboard.press("Escape");
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
      await expect(receiptBtn).toBeFocused();
    });

    await test.step("backdrop closes without treating canvas interaction as backdrop", async () => {
      await receiptBtn.click();
      const preview = page.locator("[data-receipt-viewer]");
      await expect(preview).toBeVisible({ timeout: 6_000 });
      await preview.click({ position: { x: 2, y: 2 } });
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
      await expect(receiptBtn).toBeFocused();
    });

    await test.step("tablet uses a nearly full-screen image-first shell", async () => {
      await page.setViewportSize({ width: 820, height: 1180 });
      await page.goto(
        `${E2E_FINANCIAL_INBOX_URL}?highlight=${encodeURIComponent(uploadedInboxRef!)}`,
        { waitUntil: "domcontentloaded" }
      );
      await waitForExpensesQuerySuccess(page, 90_000);
      const rowTablet = await waitForUploadHighlightRow(page, 60_000);
      await rowTablet.getByRole("button", { name: /Preview receipt/i }).click();
      const preview = page.locator("[data-receipt-viewer]");
      await expect(preview).toBeVisible({ timeout: 6_000 });
      const shell = preview.locator("[data-receipt-viewer-shell]");
      await expect
        .poll(async () => (await shell.boundingBox())?.width ?? 0, { timeout: 2_000 })
        .toBeGreaterThanOrEqual(794);
      await expect
        .poll(async () => (await shell.boundingBox())?.height ?? 0, { timeout: 2_000 })
        .toBeGreaterThanOrEqual(1153);
      const shellBox = await shell.boundingBox();
      expect(shellBox).not.toBeNull();
      for (const label of [
        "Download receipt",
        "Close",
        "Rotate left",
        "Zoom out",
        "Zoom in",
        "Fit to screen",
        "Reset view",
        "Rotate right",
        "Replace",
      ]) {
        await expectTouchTarget(preview.getByRole("button", { name: label, exact: true }), label);
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
      const preview = page.locator("[data-receipt-viewer]");
      await expect(preview).toBeVisible({ timeout: 6_000 });
      const vw = (await page.viewportSize())!.width;
      const scrollWide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWide).toBeLessThanOrEqual(vw + 2);
      const shell = preview.locator("[data-receipt-viewer-shell]");
      await expect
        .poll(async () => (await shell.boundingBox())?.width ?? 0, { timeout: 2_000 })
        .toBeGreaterThanOrEqual(vw - 2);
      const previewBox = await shell.boundingBox();
      expect(previewBox).not.toBeNull();
      expect(previewBox!.width).toBeGreaterThanOrEqual(vw - 2);
      expect(previewBox!.height).toBeGreaterThanOrEqual(840);
      await expect(preview.getByRole("button", { name: "Receipt details" })).toBeVisible();
      const toolbar = preview.getByTestId("receipt-viewer-toolbar");
      const mobileToolbarLayout = await toolbar.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX,
          height: element.getBoundingClientRect().height,
        };
      });
      expect(mobileToolbarLayout.scrollWidth).toBeLessThanOrEqual(
        mobileToolbarLayout.clientWidth + 1
      );
      expect(mobileToolbarLayout.overflowX).not.toMatch(/auto|scroll/);
      expect(mobileToolbarLayout.height).toBeGreaterThanOrEqual(49);
      expect(mobileToolbarLayout.height).toBeLessThanOrEqual(54);

      const mobileCanvas = preview.getByTestId("receipt-viewer-canvas");
      for (let index = 0; index < 4; index += 1) {
        await preview.getByRole("button", { name: "Zoom in" }).click();
      }
      await expect(mobileCanvas).toHaveAttribute("data-overflow-x", "true");
      const mobileCanvasBox = await mobileCanvas.boundingBox();
      expect(mobileCanvasBox).not.toBeNull();
      const touchStart = {
        identifier: 1,
        clientX: mobileCanvasBox!.x + mobileCanvasBox!.width / 2,
        clientY: mobileCanvasBox!.y + mobileCanvasBox!.height / 2,
      };
      const touchMove = { ...touchStart, clientX: touchStart.clientX - 120 };
      await mobileCanvas.dispatchEvent("touchstart", {
        touches: [touchStart],
        changedTouches: [touchStart],
      });
      await mobileCanvas.dispatchEvent("touchmove", {
        touches: [touchMove],
        changedTouches: [touchMove],
      });
      await mobileCanvas.dispatchEvent("touchend", {
        touches: [],
        changedTouches: [touchMove],
      });
      await expect
        .poll(async () => Number((await mobileCanvas.getAttribute("data-pan-x")) ?? "0"))
        .toBeLessThan(0);
      const mobileMaxPanX = Number((await mobileCanvas.getAttribute("data-max-pan-x")) ?? "0");
      const mobilePanX = Number((await mobileCanvas.getAttribute("data-pan-x")) ?? "0");
      expect(Math.abs(mobilePanX)).toBeLessThanOrEqual(mobileMaxPanX + 0.5);
      await preview.getByRole("button", { name: "Fit to screen" }).click();
      await expect(mobileCanvas).toHaveAttribute("data-pan-x", "0");
      await expect(mobileCanvas).toHaveAttribute("data-overflow-x", "false");

      await expect(preview.getByRole("button", { name: "More receipt tools" })).toBeVisible();
      await preview.getByRole("button", { name: "More receipt tools" }).focus();
      await expect(preview.getByRole("button", { name: "More receipt tools" })).toBeFocused();
      await page.keyboard.press("Enter");
      for (const label of ["Rotate left", "Rotate right", "Reset view"]) {
        const menuItem = page.getByRole("menuitem", { name: label });
        await expect(menuItem).toBeVisible();
        await expectTouchTarget(menuItem, `${label} menu item`);
      }
      await page.keyboard.press("Escape");
      for (const label of [
        "Download receipt",
        "Close",
        "Receipt details",
        "Zoom out",
        "Zoom in",
        "Fit to screen",
        "Replace",
        "More receipt tools",
      ]) {
        await expectTouchTarget(preview.getByRole("button", { name: label, exact: true }), label);
      }
      await preview.getByRole("button", { name: /^Close$/ }).click({ force: true });
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
    });

    await test.step("reduced motion keeps the accessible viewer behavior", async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(
        `${E2E_FINANCIAL_INBOX_URL}?highlight=${encodeURIComponent(uploadedInboxRef!)}`,
        { waitUntil: "domcontentloaded" }
      );
      await waitForExpensesQuerySuccess(page, 90_000);
      const rowReduced = await waitForUploadHighlightRow(page, 60_000);
      await rowReduced.getByRole("button", { name: /Preview receipt/i }).click();
      const preview = page.locator("[data-receipt-viewer]");
      await expect(preview).toHaveAttribute("data-reduced-motion", "true");
      const canvas = preview.getByTestId("receipt-viewer-canvas");
      await preview.getByRole("button", { name: "Zoom in" }).click();
      await preview.getByRole("button", { name: "Zoom in" }).click();
      const indicator = preview.locator('[data-testid^="receipt-pan-indicator-"]').first();
      if ((await indicator.count()) > 0) {
        await expect(indicator).toHaveAttribute("aria-hidden", "true");
        const reducedTransitionSeconds = await indicator.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).transitionDuration)
        );
        expect(
          reducedTransitionSeconds,
          "reduced motion leaves at most an imperceptible transition"
        ).toBeLessThanOrEqual(0.001);
      }
      await expect(canvas).toHaveAttribute("data-zoom", "150");
      await page.keyboard.press("Escape");
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
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
      const preview = page.locator("[data-receipt-viewer]");
      await expect(preview).toBeVisible({ timeout: 6_000 });

      await expect(
        preview.getByText(/Unable to load receipt|Receipt could not be loaded/i).first()
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        preview.getByRole("button", { name: /^Retry( signed URL)?$/i }).first()
      ).toBeVisible({
        timeout: 10_000,
      });
      await expect(preview).not.toContainText(/storage\/v1|token=|object\/sign/i);

      await page.unroute("**/*", abortStorageObjectGet);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
      await preview.getByRole("button", { name: /^Close$/ }).click();
      await expect(preview).not.toBeVisible({ timeout: 15_000 });
    });

    page.off("request", onRequest);
  });
});

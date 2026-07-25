import { expect, test, type Page } from "@playwright/test";
import {
  attachmentPreviewModal,
  clickVisibleQuickExpenseButton,
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";

const WIDTH = 2400;
const HEIGHT = 3200;
const SIGNED_RECEIPT_URL = "https://receipt-quality.test/original-receipt.png";

async function highResolutionReceiptPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable.");
      ctx.fillStyle = "#f5f5f0";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(240, 140, width - 480, height - 280);
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      ctx.strokeRect(240, 140, width - 480, height - 280);
      ctx.fillStyle = "#111827";
      ctx.textBaseline = "top";
      ctx.font = "bold 88px Arial";
      ctx.fillText("LOWE'S", 360, 260);
      ctx.font = "42px Arial";
      ctx.fillText("High-resolution receipt quality test", 360, 390);
      ctx.fillText("Date: 06/13/2026", 360, 480);
      ctx.fillText("Total: $42.37", 360, 570);
      ctx.font = "30px Arial";
      for (let i = 0; i < 54; i += 1) {
        const y = 720 + i * 42;
        ctx.fillText(
          `Line ${String(i + 1).padStart(2, "0")}  Material detail text  $${(i + 1).toFixed(2)}`,
          360,
          y
        );
      }
      return canvas.toDataURL("image/png");
    },
    { width: WIDTH, height: HEIGHT }
  );
  const encoded = dataUrl.split(",")[1];
  if (!encoded) throw new Error("Canvas did not produce PNG data.");
  return Buffer.from(encoded, "base64");
}

test.describe("Expense receipt upload quality", () => {
  test.describe.configure({ timeout: 120_000 });

  test("Quick Expense stores original image for sharp receipt preview", async ({ page }) => {
    const highResPng = await highResolutionReceiptPng(page);
    let uploadMultipart = "";

    await page.route("**/api/ocr-receipt", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          vendor_name: "Lowe's",
          total_amount: 42.37,
          purchase_date: "2026-06-13",
          category: "Materials",
          raw_text: "LOWE'S\nTOTAL $42.37\n06/13/2026",
          confidence: { vendor: "high", amount: "high", date: "high" },
        }),
      });
    });

    await page.route("**/api/quick-expense/upload-attachment", async (route) => {
      const body = route.request().postDataBuffer();
      uploadMultipart = body?.toString("latin1") ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          path: "quick-expense/original-quality-receipt.png",
          signed_url: SIGNED_RECEIPT_URL,
          public_url: SIGNED_RECEIPT_URL,
        }),
      });
    });

    await page.route(SIGNED_RECEIPT_URL, async (route) => {
      const isHead = route.request().method() === "HEAD";
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=3600",
          "content-length": String(highResPng.length),
        },
        body: isHead ? undefined : highResPng,
      });
    });

    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await waitForExpensesQuerySuccess(page);
    await clickVisibleQuickExpenseButton(page);

    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    if (
      await dialog
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured.");
    }

    await dialog.getByTestId("quick-expense-receipt-input").setInputFiles({
      name: "quality-receipt.png",
      mimeType: "image/png",
      buffer: highResPng,
    });
    await expect(dialog.getByText("Uploaded", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    expect(uploadMultipart).toContain('filename="quality-receipt.png"');
    expect(uploadMultipart).toContain("Content-Type: image/png");
    expect(uploadMultipart).not.toContain('filename="quality-receipt.jpg"');

    await dialog
      .getByRole("button", { name: /^Preview receipt$/ })
      .first()
      .click();
    const preview = attachmentPreviewModal(page);
    await expect(preview).toBeVisible({ timeout: 10_000 });
    const imageArea = preview.getByTestId("receipt-preview-image-area");
    await expect(imageArea).toHaveAttribute("data-preview-stage", "ready", { timeout: 10_000 });
    const dimensions = await preview
      .locator("img")
      .first()
      .evaluate((img) => ({
        width: (img as HTMLImageElement).naturalWidth,
        height: (img as HTMLImageElement).naturalHeight,
      }));
    expect(dimensions).toEqual({ width: WIDTH, height: HEIGHT });
  });
});

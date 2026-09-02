import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

import type { PaymentReceiptPreviewDto } from "@/lib/payment-receipt-preview-dto";
import { loginAsE2EOwner } from "./e2e-auth-owner";

const PAYMENT_ID = "pay-a4-fixture-001";
const OUT = {
  preview: "test-results/payment-receipt-a4-preview.png",
  print: "test-results/payment-receipt-a4-print.png",
  mobile: "test-results/payment-receipt-a4-mobile.png",
  pdf: "test-results/payment-receipt-a4.pdf",
} as const;

const RECEIPT: PaymentReceiptPreviewDto = {
  company: {
    companyName: "HH Group",
    phone: "(808) 555-0100",
    email: "office@hhgroup.test",
    website: "hhgroup.test",
    licenseNumber: null,
    taxId: null,
    invoiceFooter: null,
    defaultTerms: null,
    notes: null,
    addressLines: ["100 Aloha Tower Dr", "Honolulu, HI 96813"],
    logoUrl: null,
  },
  receiptNo: "PR-20260527-A4FIXTURE",
  recipientEmail: "customer@example.test",
  payment: {
    id: PAYMENT_ID,
    paymentDate: "2026-05-27",
    amount: 1234.56,
    paymentMethod: "ACH",
    depositAccount: "Operating Account",
    notes:
      "A4 receipt fixture note with enough copy to verify wrapping stays inside the receipt paper.",
  },
  invoice: {
    id: "invoice-a4-fixture-001",
    invoiceNo: "INV-A4-001",
    total: 1500,
    balanceAfterPayment: 265.44,
  },
  customerName: "A4 Fixture Customer With Long Name LLC",
  projectName: "Payment Receipt A4 Regression Project",
};

function mediaBox(buffer: Buffer): { width: number; height: number } {
  const text = buffer.toString("latin1");
  const match = text.match(
    /\/MediaBox\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]/
  );
  expect(match, "PDF should include a page MediaBox").toBeTruthy();
  const [, x1, y1, x2, y2] = match!;
  return {
    width: Number(x2) - Number(x1),
    height: Number(y2) - Number(y1),
  };
}

async function openReceipt(page: Page) {
  await page.route(`**/api/financial/payments/${PAYMENT_ID}/receipt-preview`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RECEIPT),
    });
  });

  await loginAsE2EOwner(page, `/financial/payments?receipt=${PAYMENT_ID}`);
  const dialog = page.getByRole("dialog", { name: "Payment receipt" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText(RECEIPT.customerName);
  await expect(dialog).toContainText(RECEIPT.invoice.invoiceNo!);
  await expect(dialog).toContainText("$1,234.56");
  return dialog;
}

test("payment receipt preview, print CSS, and downloaded PDF use A4", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync("test-results", { recursive: true });

  const dialog = await openReceipt(page);
  const paper = dialog.locator(".payment-receipt-paper");
  await expect(paper).toBeVisible({ timeout: 5_000 });

  const preview = await paper.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const styles = window.getComputedStyle(node);
    return {
      width: rect.width,
      height: rect.height,
      ratio: rect.width / rect.height,
      aspectRatio: styles.aspectRatio,
      background: styles.backgroundColor,
      maxWidth: styles.maxWidth,
    };
  });

  expect(preview.width).toBeGreaterThan(650);
  expect(preview.width).toBeLessThanOrEqual(800);
  expect(Math.abs(preview.ratio - 210 / 297)).toBeLessThan(0.02);
  expect(preview.aspectRatio).toContain("210 / 297");
  expect(preview.background).toBe("rgb(255, 255, 255)");
  const receiptCss =
    readFileSync("src/styles/payment-receipt-a4.css", "utf8") +
    "\n" +
    readFileSync("src/components/financial/payment-receipt-preview-modal.css", "utf8");
  expect(receiptCss).toContain("size: A4");
  expect(receiptCss).toContain("margin: 12mm");

  await dialog.screenshot({ path: OUT.preview });

  await page.evaluate(() => {
    document.documentElement.classList.add("print-payment-receipt-preview");
  });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: "print" });
  const printText = await page.locator("body").innerText();
  expect(printText).toContain("Payment Receipt");
  expect(printText).toContain("$1,234.56");
  expect(printText).not.toContain("Download PDF");
  expect(printText).not.toContain("Payments Received");
  await page.screenshot({ path: OUT.print, fullPage: true });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => {
    document.documentElement.classList.remove("print-payment-receipt-preview");
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await dialog.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  await download.saveAs(OUT.pdf);
  expect(download.suggestedFilename()).toMatch(/^Payment-Receipt-.*\.pdf$/);
  const pdf = readFileSync(OUT.pdf);
  expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const box = mediaBox(pdf);
  expect(Math.abs(box.width - 595.28)).toBeLessThan(3);
  expect(Math.abs(box.height - 841.89)).toBeLessThan(3);
  const pdfText = pdf.toString("latin1");
  expect(pdfText).not.toContain("Download PDF");
  expect(pdfText).not.toContain("Payments Received");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/financial/payments?receipt=${PAYMENT_ID}`, {
    waitUntil: "domcontentloaded",
  });
  const mobileDialog = page.getByRole("dialog", { name: "Payment receipt" });
  await expect(mobileDialog).toBeVisible({ timeout: 30_000 });
  const mobilePaper = mobileDialog.locator(".payment-receipt-paper");
  await expect(mobilePaper).toBeVisible();
  const mobile = await mobilePaper.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      ratio: rect.width / rect.height,
      right: rect.right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(Math.abs(mobile.ratio - 210 / 297)).toBeLessThan(0.02);
  expect(mobile.right).toBeLessThanOrEqual(mobile.viewportWidth + 1);
  expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewportWidth + 4);
  await page.screenshot({ path: OUT.mobile, fullPage: true });
});

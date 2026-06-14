import "server-only";

import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";

export type GenerateWorkerPaymentReceiptPrintPdfOptions = {
  paymentId: string;
  origin: string;
  cookieHeader?: string | null;
};

const WORKER_PAYMENT_RECEIPT_DOCUMENT_SELECTOR = '[data-testid="worker-payment-receipt-document"]';

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function ensureVercelChromiumRuntimeEnv(): void {
  const runtime = process.env.AWS_LAMBDA_JS_RUNTIME ?? "";
  if (!runtime.includes("20.x") && !runtime.includes("22.x")) {
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
  }

  const executionEnv = process.env.AWS_EXECUTION_ENV ?? "";
  if (!executionEnv.includes("20.x") && !executionEnv.includes("22.x")) {
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
  }
}

function applyChromiumLibraryPath(executablePath: string): void {
  const execDir = path.dirname(executablePath);
  const candidates = [execDir, "/tmp/al2023/lib", "/tmp/al2/lib"];
  const existing = (process.env.LD_LIBRARY_PATH ?? "").split(":").filter(Boolean);
  process.env.LD_LIBRARY_PATH = [...new Set([...candidates, ...existing])].join(":");
}

async function launchChromiumOnVercel(): Promise<Browser> {
  ensureVercelChromiumRuntimeEnv();
  const chromium = (await import("@sparticuz/chromium")).default;
  chromium.setGraphicsMode = false;

  const executablePath = await chromium.executablePath();
  applyChromiumLibraryPath(executablePath);

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });
}

async function launchChromiumBrowser(): Promise<Browser> {
  if (isVercelRuntime()) {
    return launchChromiumOnVercel();
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_PATH?.trim() || undefined;

  if (executablePath) {
    return puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  return puppeteer.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function generateWorkerPaymentReceiptPrintPdfBuffer(
  options: GenerateWorkerPaymentReceiptPrintPdfOptions
): Promise<Buffer> {
  const { paymentId, origin, cookieHeader } = options;
  const base = origin.replace(/\/$/, "");
  const url = `${base}/receipt/print/${encodeURIComponent(paymentId)}?pdf=1`;

  let browser: Browser | null = null;
  try {
    browser = await launchChromiumBrowser();
    const page = await browser.newPage();

    if (cookieHeader?.trim()) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    }

    await page.goto(url, { waitUntil: "networkidle0", timeout: 55_000 });
    await page.waitForSelector(WORKER_PAYMENT_RECEIPT_DOCUMENT_SELECTOR, { timeout: 30_000 });

    const pdfUint8 = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfUint8);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

export function workerPaymentReceiptPrintPdfFilename(receiptNo: string): string {
  const safe = receiptNo
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `Receipt-${safe || "worker-payment"}.pdf`;
}

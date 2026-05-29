import "server-only";

import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

export type GenerateEstimatePrintPdfOptions = {
  estimateId: string;
  origin: string;
  cookieHeader?: string | null;
};

const ESTIMATE_DOCUMENT_SELECTOR = '[data-testid="estimate-document"]';

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

async function launchChromiumBrowser(): Promise<Browser> {
  if (isVercelRuntime()) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
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

/**
 * Renders /estimates/[id]/print?pdf=1 via headless Chromium and returns a vector PDF buffer.
 */
export async function generateEstimatePrintPdfBuffer(
  options: GenerateEstimatePrintPdfOptions
): Promise<Buffer> {
  const { estimateId, origin, cookieHeader } = options;
  const base = origin.replace(/\/$/, "");
  const url = `${base}/estimates/${encodeURIComponent(estimateId)}/print?pdf=1`;

  let browser: Browser | null = null;
  try {
    browser = await launchChromiumBrowser();
    const page = await browser.newPage();

    if (cookieHeader?.trim()) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    }

    await page.goto(url, { waitUntil: "networkidle0", timeout: 55_000 });
    await page.waitForSelector(ESTIMATE_DOCUMENT_SELECTOR, { timeout: 30_000 });

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

export function estimatePrintPdfFilename(estimateNumber: string): string {
  const safe = estimateNumber
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `Estimate-${safe || "draft"}.pdf`;
}

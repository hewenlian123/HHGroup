import "server-only";

import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page } from "puppeteer-core";

export type GenerateEstimatePrintPdfOptions = {
  estimateId: string;
  origin: string;
  cookieHeader?: string | null;
};

const ESTIMATE_DOCUMENT_SELECTOR = '[data-testid="estimate-document"]';
const PDF_JOB_TIMEOUT_MS = 45_000;

type BrowserLauncher = () => Promise<Browser>;

export class EstimatePdfBrowserPool {
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  constructor(private readonly launch: BrowserLauncher) {}

  async acquire(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.browser && !this.browser.connected) {
      await this.invalidate(this.browser);
    }
    if (this.launchPromise) return this.launchPromise;

    const pending = this.launch().then((browser) => {
      this.browser = browser;
      browser.on("disconnected", () => {
        if (this.browser === browser) this.browser = null;
      });
      return browser;
    });
    this.launchPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.launchPromise === pending) this.launchPromise = null;
    }
  }

  async invalidate(browser: Browser): Promise<void> {
    if (this.browser === browser) this.browser = null;
    await browser.close().catch(() => undefined);
  }
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

/** Must run before `@sparticuz/chromium` is first imported (dynamic import on Vercel). */
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

type EstimatePdfGlobal = typeof globalThis & {
  __hhEstimatePdfBrowserPool?: EstimatePdfBrowserPool;
};

function getEstimatePdfBrowserPool(): EstimatePdfBrowserPool {
  const shared = globalThis as EstimatePdfGlobal;
  if (!shared.__hhEstimatePdfBrowserPool) {
    shared.__hhEstimatePdfBrowserPool = new EstimatePdfBrowserPool(launchChromiumBrowser);
  }
  return shared.__hhEstimatePdfBrowserPool;
}

function isRecoverableBrowserFailure(error: unknown, browser: Browser): boolean {
  if (!browser.connected) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /browser has disconnected|connection closed|protocol error.*connection.*closed/i.test(
    message
  );
}

async function waitForEstimateDocumentReady(page: Page): Promise<void> {
  await page.waitForSelector(ESTIMATE_DOCUMENT_SELECTOR, { timeout: 15_000 });
  await Promise.all([
    page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    }),
    page
      .waitForFunction(() => Array.from(document.images).every((image) => image.complete), {
        timeout: 5_000,
      })
      .catch(() => undefined),
  ]);
}

async function renderEstimatePdfWithBrowser(params: {
  browser: Browser;
  cookieHeader?: string | null;
  url: string;
}): Promise<Buffer> {
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    context = await params.browser.createBrowserContext();
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(25_000);

    if (params.cookieHeader?.trim()) {
      await page.setExtraHTTPHeaders({ cookie: params.cookieHeader });
    }

    const render = async (): Promise<Buffer> => {
      await page!.goto(params.url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await waitForEstimateDocumentReady(page!);
      const pdfUint8 = await page!.pdf({
        format: "letter",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        timeout: 20_000,
      });
      return Buffer.from(pdfUint8);
    };

    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Estimate PDF generation timed out.")),
        PDF_JOB_TIMEOUT_MS
      );
    });
    return await Promise.race([render(), timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (page) await page.close().catch(() => undefined);
    if (context) await context.close().catch(() => undefined);
  }
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
  const pool = getEstimatePdfBrowserPool();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const browser = await pool.acquire();
    try {
      return await renderEstimatePdfWithBrowser({ browser, cookieHeader, url });
    } catch (error) {
      lastError = error;
      if (!isRecoverableBrowserFailure(error, browser) || attempt === 1) throw error;
      await pool.invalidate(browser);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Estimate PDF generation failed.");
}

export function estimatePrintPdfFilename(estimateNumber: string): string {
  const safe = estimateNumber
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `Estimate-${safe || "draft"}.pdf`;
}

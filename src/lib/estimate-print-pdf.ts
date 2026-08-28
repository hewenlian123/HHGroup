import "server-only";

import path from "node:path";
import type { Browser, BrowserContext, Page } from "puppeteer-core";

export type GenerateEstimatePrintPdfOptions = {
  estimateId: string;
  origin: string;
  cookieHeader?: string | null;
};

const ESTIMATE_DOCUMENT_SELECTOR = '[data-testid="estimate-document"]';
const PDF_JOB_TIMEOUT_MS = 45_000;

type BrowserLauncher = () => Promise<Browser>;

const PDF_UNAVAILABLE_MESSAGE = "Estimate PDF is temporarily unavailable. Please try again.";

export class EstimatePdfUnavailableError extends Error {
  constructor(cause: unknown) {
    super(PDF_UNAVAILABLE_MESSAGE, { cause });
    this.name = "EstimatePdfUnavailableError";
  }
}

export class EstimatePdfBrowserPool {
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;
  private replacementPromise: Promise<Browser> | null = null;
  private readonly invalidationPromises = new WeakMap<Browser, Promise<void>>();

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
    const existing = this.invalidationPromises.get(browser);
    if (existing) return existing;
    const pending = browser.close().catch(() => undefined);
    this.invalidationPromises.set(browser, pending);
    await pending;
  }

  private async replace(failedBrowser: Browser): Promise<Browser> {
    if (this.browser && this.browser !== failedBrowser && this.browser.connected) {
      return this.browser;
    }
    if (this.replacementPromise) return this.replacementPromise;

    const pending = (async () => {
      await this.invalidate(failedBrowser);
      return this.acquire();
    })();
    this.replacementPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.replacementPromise === pending) this.replacementPromise = null;
    }
  }

  async run<T>(job: (browser: Browser) => Promise<T>): Promise<T> {
    let browser = await this.acquire();
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (!browser.connected) {
          throw new Error("Estimate PDF browser disconnected before the render started.");
        }
        return await job(browser);
      } catch (error) {
        lastError = error;
        if (!isRecoverableBrowserFailure(error, browser)) throw error;
        if (attempt === 1) {
          await this.invalidate(browser);
          throw new EstimatePdfUnavailableError(error);
        }
        browser = await this.replace(browser);
      }
    }

    throw new EstimatePdfUnavailableError(lastError);
  }
}

/**
 * Serverless Chromium builds can reject additional browser contexts. A fresh browser gives each
 * invocation an isolated default context without carrying process state across a freeze/thaw.
 */
export class EstimatePdfFreshBrowserRunner {
  constructor(private readonly launch: BrowserLauncher) {}

  async run<T>(job: (browser: Browser) => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let browser: Browser | null = null;
      try {
        browser = await this.launch();
        if (!browser.connected) {
          throw new Error("Estimate PDF browser disconnected before the render started.");
        }
        return await job(browser);
      } catch (error) {
        lastError = error;
        if (!isRecoverableBrowserFailure(error, browser) || attempt === 1) {
          if (isRecoverableBrowserFailure(error, browser)) {
            throw new EstimatePdfUnavailableError(error);
          }
          throw error;
        }
      } finally {
        if (browser) await browser.close().catch(() => undefined);
      }
    }

    throw new EstimatePdfUnavailableError(lastError);
  }
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

/** Must run before `@sparticuz/chromium` is first imported (dynamic import on Vercel). */
function ensureVercelChromiumRuntimeEnv(): void {
  const runtime = process.env.AWS_LAMBDA_JS_RUNTIME ?? "";
  if (!runtime.includes("20.x") && !runtime.includes("22.x")) {
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs22.x";
  }

  const executionEnv = process.env.AWS_EXECUTION_ENV ?? "";
  if (!executionEnv.includes("20.x") && !executionEnv.includes("22.x")) {
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs22.x";
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
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import("estimate-pdf-chromium"),
    import("estimate-pdf-puppeteer"),
  ]);
  chromium.setGraphicsMode = false;

  const executablePath = await chromium.executablePath();
  applyChromiumLibraryPath(executablePath);

  return (await puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    defaultViewport: {
      deviceScaleFactor: 1,
      hasTouch: false,
      height: 1080,
      isLandscape: true,
      isMobile: false,
      width: 1920,
    },
    executablePath,
    headless: "shell",
  })) as unknown as Browser;
}

async function launchChromiumBrowser(): Promise<Browser> {
  if (isVercelRuntime()) {
    return launchChromiumOnVercel();
  }

  const { default: puppeteer } = await import("estimate-pdf-puppeteer");

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_PATH?.trim() || undefined;

  if (executablePath) {
    return (await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })) as unknown as Browser;
  }

  return (await puppeteer.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })) as unknown as Browser;
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

function isRecoverableBrowserFailure(error: unknown, browser: Browser | null): boolean {
  if (browser && !browser.connected) return true;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /targetcloseerror|target closed|browser (?:has )?disconnected|connection closed|session closed|protocol error.*(?:target|connection).*closed/i.test(
    `${name}: ${message}`
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

export async function renderEstimatePdfWithBrowser(params: {
  browser: Browser;
  cookieHeader?: string | null;
  useDefaultContext?: boolean;
  url: string;
}): Promise<Buffer> {
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    context = params.useDefaultContext
      ? params.browser.defaultBrowserContext()
      : await params.browser.createBrowserContext();
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
    if (context && !params.useDefaultContext) await context.close().catch(() => undefined);
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

  if (isVercelRuntime()) {
    const runner = new EstimatePdfFreshBrowserRunner(launchChromiumBrowser);
    return runner.run((browser) =>
      renderEstimatePdfWithBrowser({
        browser,
        cookieHeader,
        useDefaultContext: true,
        url,
      })
    );
  }

  const pool = getEstimatePdfBrowserPool();
  return pool.run((browser) => renderEstimatePdfWithBrowser({ browser, cookieHeader, url }));
}

export function estimatePrintPdfFilename(estimateNumber: string): string {
  const safe = estimateNumber
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `Estimate-${safe || "draft"}.pdf`;
}

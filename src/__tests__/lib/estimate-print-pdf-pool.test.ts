import type { Browser } from "puppeteer-core";
import { describe, expect, it, vi } from "vitest";

import { EstimatePdfBrowserPool, renderEstimatePdfWithBrowser } from "@/lib/estimate-print-pdf";

function fakeBrowser() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    connected: true,
    on: vi.fn(),
  } as unknown as Browser;
}

function targetClosedError(): Error {
  const error = new Error("Protocol error (Target.createTarget): Target closed");
  error.name = "TargetCloseError";
  return error;
}

describe("Estimate PDF browser pool", () => {
  it("shares one launch across concurrent warm requests", async () => {
    const browser = fakeBrowser();
    const launch = vi.fn().mockResolvedValue(browser);
    const pool = new EstimatePdfBrowserPool(launch);

    const [first, second] = await Promise.all([pool.acquire(), pool.acquire()]);

    expect(first).toBe(browser);
    expect(second).toBe(browser);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("invalidates a crashed browser and launches a replacement", async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    const launch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const pool = new EstimatePdfBrowserPool(launch);

    expect(await pool.acquire()).toBe(first);
    await pool.invalidate(first);
    expect(await pool.acquire()).toBe(second);

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("retries once when target creation closes the cached browser", async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    const launch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const pool = new EstimatePdfBrowserPool(launch);
    const job = vi.fn().mockRejectedValueOnce(targetClosedError()).mockResolvedValueOnce("pdf");

    await expect(pool.run(job)).resolves.toBe("pdf");

    expect(job).toHaveBeenNthCalledWith(1, first);
    expect(job).toHaveBeenNthCalledWith(2, second);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("replaces a browser that disconnects immediately before the job", async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    const launch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const pool = new EstimatePdfBrowserPool(launch);
    const job = vi.fn(async (browser: Browser) => {
      if (browser === first) {
        Object.assign(first, { connected: false });
        throw targetClosedError();
      }
      return "pdf";
    });

    await expect(pool.run(job)).resolves.toBe("pdf");

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("shares one atomic relaunch across simultaneous failed jobs", async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    const launch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const pool = new EstimatePdfBrowserPool(launch);
    await pool.acquire();

    const runJob = () =>
      pool.run(async (browser) => {
        if (browser === first) throw targetClosedError();
        return browser;
      });

    const [left, right] = await Promise.all([runJob(), runJob()]);

    expect(left).toBe(second);
    expect(right).toBe(second);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("returns a safe actionable error after the one retry is exhausted", async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    const launch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const pool = new EstimatePdfBrowserPool(launch);

    await expect(pool.run(async () => Promise.reject(targetClosedError()))).rejects.toThrow(
      "Estimate PDF is temporarily unavailable. Please try again."
    );

    expect(launch).toHaveBeenCalledTimes(2);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it("isolates each PDF request and closes only its page and browser context", async () => {
    const makeSession = () => {
      const page = {
        close: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      };
      const context = {
        close: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn().mockResolvedValue(page),
      };
      return { context, page };
    };
    const first = makeSession();
    const second = makeSession();
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      connected: true,
      createBrowserContext: vi
        .fn()
        .mockResolvedValueOnce(first.context)
        .mockResolvedValueOnce(second.context),
      on: vi.fn(),
    } as unknown as Browser;

    await renderEstimatePdfWithBrowser({ browser, url: "http://example.test/print?pdf=1" });
    await renderEstimatePdfWithBrowser({ browser, url: "http://example.test/print?pdf=1" });

    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
    expect(first.page.close).toHaveBeenCalledTimes(1);
    expect(first.context.close).toHaveBeenCalledTimes(1);
    expect(second.page.close).toHaveBeenCalledTimes(1);
    expect(second.context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).not.toHaveBeenCalled();
  });

  it("closes request resources after a render failure without closing the shared browser", async () => {
    const page = {
      close: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockRejectedValue(new Error("navigation failed")),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
      setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      connected: true,
      createBrowserContext: vi.fn().mockResolvedValue(context),
      on: vi.fn(),
    } as unknown as Browser;

    await expect(
      renderEstimatePdfWithBrowser({ browser, url: "http://example.test/print?pdf=1" })
    ).rejects.toThrow("navigation failed");

    expect(page.close).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).not.toHaveBeenCalled();
  });
});

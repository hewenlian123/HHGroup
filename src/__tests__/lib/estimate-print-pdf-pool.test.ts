import type { Browser } from "puppeteer-core";
import { describe, expect, it, vi } from "vitest";

import { EstimatePdfBrowserPool } from "@/lib/estimate-print-pdf";

function fakeBrowser() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    connected: true,
    on: vi.fn(),
  } as unknown as Browser;
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
});

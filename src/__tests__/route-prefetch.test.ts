import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prefetchRoutes,
  shouldBulkPrefetchMobileNav,
  shouldBulkPrefetchOwnerNav,
} from "@/lib/route-prefetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("owner navigation bulk prefetch policy", () => {
  it("warms owner routes only from stable hub pages", () => {
    expect(shouldBulkPrefetchOwnerNav("/dashboard")).toBe(true);
    expect(shouldBulkPrefetchOwnerNav("/financial")).toBe(true);
  });

  it.each([
    "/estimate-templates",
    "/estimates/new",
    "/estimates/estimate-1",
    "/financial/invoices/invoice-1",
    "/financial/payments?receipt=payment-1",
    "/projects/project-1",
  ])("does not start bulk RSC prefetch during transactional route %s", (pathname) => {
    expect(shouldBulkPrefetchOwnerNav(pathname)).toBe(false);
  });
});

describe("mobile navigation bulk prefetch policy", () => {
  it.each(["/dashboard", "/financial"])(
    "warms mobile navigation routes from visible stable hub %s",
    (pathname) => {
      expect(shouldBulkPrefetchMobileNav(pathname, true)).toBe(true);
    }
  );

  it.each(["/dashboard", "/financial"])(
    "does not warm hidden mobile navigation routes on desktop hub %s",
    (pathname) => {
      expect(shouldBulkPrefetchMobileNav(pathname, false)).toBe(false);
    }
  );

  it.each([
    "/estimates/new",
    "/estimates/estimate-1",
    "/financial/invoices/invoice-1",
    "/financial/payments?receipt=payment-1",
    "/projects/project-1",
    "/projects/new",
    "/tasks/new",
  ])("does not warm mobile navigation routes during transaction %s", (pathname) => {
    expect(shouldBulkPrefetchMobileNav(pathname, true)).toBe(false);
  });
});

describe("route prefetch batch cancellation", () => {
  it("does not execute later idle batches after cleanup", () => {
    const idleCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: FrameRequestCallback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      })
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const prefetch = vi.fn();

    const cleanup = prefetchRoutes(
      { prefetch },
      Array.from({ length: 9 }, (_, index) => `/route-${index + 1}`)
    );

    expect(prefetch.mock.calls.map(([href]) => href)).toEqual([
      "/route-1",
      "/route-2",
      "/route-3",
      "/route-4",
    ]);
    expect(idleCallbacks).toHaveLength(1);

    idleCallbacks[0]?.(undefined as never);
    expect(prefetch).toHaveBeenCalledTimes(8);
    expect(idleCallbacks).toHaveLength(2);

    cleanup();
    idleCallbacks[1]?.(undefined as never);

    expect(prefetch).toHaveBeenCalledTimes(8);
  });
});

import { describe, expect, it } from "vitest";

import { classifyNavigationPerformanceResult } from "../../../tests/performance/performance-result";

const routeResult = {
  target: { label: "Projects", href: "/projects" },
  viewport: { name: "desktop", width: 1440, height: 900 },
  run: 1,
  navigation: {
    fromPath: "/dashboard",
    toPath: "/projects",
    linkHref: "/projects",
  },
  clickToFeedbackMs: 16,
  clickToRouteStartMs: 9,
  routeStartToUsefulContentMs: 82,
  fullSettleMs: 150,
  requests: [
    {
      method: "GET",
      url: "https://example.test/api/projects?cursor=one",
      resourceType: "fetch",
      startedAtMs: 12,
      finishedAtMs: 42,
      status: 200,
    },
    {
      method: "GET",
      url: "https://example.test/api/projects?cursor=one",
      resourceType: "fetch",
      startedAtMs: 15,
      finishedAtMs: 48,
      status: 200,
    },
  ],
  errors: [],
} as const;

describe("navigation performance result contract", () => {
  it("rejects a route result when a required timing or diagnostic field is missing", () => {
    for (const field of [
      "clickToFeedbackMs",
      "clickToRouteStartMs",
      "routeStartToUsefulContentMs",
      "fullSettleMs",
      "requests",
      "errors",
    ] as const) {
      const { [field]: _missing, ...incomplete } = routeResult;

      expect(classifyNavigationPerformanceResult(incomplete), field).toEqual({
        ok: false,
        reason: `Missing required navigation performance field: ${field}`,
      });
    }
  });

  it("classifies repeated method and URL requests as duplicates in the emitted result", () => {
    const classified = classifyNavigationPerformanceResult(routeResult);

    expect(classified).toMatchObject({
      ok: true,
      value: {
        requestSummary: {
          duplicateRequests: [
            {
              method: "GET",
              url: "https://example.test/api/projects?cursor=one",
              count: 2,
            },
          ],
          abortedRequests: [],
          slowRequests: [],
        },
      },
    });
  });
});

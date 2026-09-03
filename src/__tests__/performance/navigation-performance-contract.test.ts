import { describe, expect, it } from "vitest";

import {
  classifyNavigationPerformanceResult,
  classifyReadOnlyRequest,
  buildNavigationPlan,
  buildPerformanceOutputDir,
  CORE_NAVIGATION_MATRIX,
  PERFORMANCE_VIEWPORTS,
  resolveVisibleDynamicDetail,
  resolveRouteStart,
  SAMPLE_SEQUENCE,
  settleDecision,
  validateWorkflowHop,
} from "../../../tests/performance/performance-result";

const routeResult = {
  target: { label: "Projects", href: "/projects" },
  viewport: { name: "desktop", width: 1440, height: 900 },
  run: 1,
  navigation: {
    fromPath: "/dashboard",
    toPath: "/projects",
    linkHref: "/projects",
  },
  metadata: {
    environment: "local",
    baseURL: "http://localhost:3000",
    browser: "Chromium 123",
    commit: "abc123",
    timestamp: "2026-09-02T00:00:00.000Z",
    cacheMode: "native",
    sample: "cold",
  },
  clickToFeedbackMs: 16,
  clickToRouteStartMs: 9,
  routeStartSource: "target-request",
  routeStartToUsefulContentMs: 82,
  fullSettleMs: 150,
  settle: {
    outcome: "settled",
    quietWindowMs: 500,
    timeoutMs: 5000,
    inFlightAtEnd: 0,
  },
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

  it("defines the required core route matrix, workflow, and exact viewport widths", () => {
    expect(CORE_NAVIGATION_MATRIX.map((target) => [target.label, target.href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Projects", "/projects"],
      ["Project Detail", "/projects/:visible-record"],
      ["Estimates", "/estimates"],
      ["Estimate Detail", "/estimates/:visible-record"],
      ["Revenue/AR", "/financial/ar"],
      ["Invoice Detail", "/financial/invoices/:visible-record"],
      ["Payments", "/financial/payments"],
      ["Expenses", "/financial/expenses"],
      ["Workers", "/workers"],
      ["Payroll", "/reports/workforce?tab=payroll"],
      ["Documents", "/documents"],
      ["Tasks", "/tasks"],
      ["Schedule", "/schedule"],
      ["Settings", "/settings/company"],
    ]);
    expect(
      CORE_NAVIGATION_MATRIX.filter((target) => target.workflow).map((target) => target.label)
    ).toEqual([
      "Dashboard",
      "Projects",
      "Project Detail",
      "Estimate Detail",
      "Invoice Detail",
      "Payments",
      "Expenses",
      "Workers",
      "Schedule",
    ]);
    expect(PERFORMANCE_VIEWPORTS.map((viewport) => viewport.width)).toEqual([1440, 820, 390]);
  });

  it("rejects impossible timing relationships and missing artifact metadata", () => {
    expect(
      classifyNavigationPerformanceResult({ ...routeResult, fullSettleMs: 80, metadata: {} })
    ).toEqual({
      ok: false,
      reason: "Navigation performance fullSettleMs must include every measured timing",
    });
    const { metadata: _metadata, ...withoutMetadata } = routeResult;
    expect(classifyNavigationPerformanceResult(withoutMetadata)).toEqual({
      ok: false,
      reason: "Missing required navigation performance field: metadata",
    });
  });

  it("models in-flight-aware settle completion and timeout", () => {
    expect(
      settleDecision({
        nowMs: 700,
        lastActivityAtMs: 100,
        inFlight: 1,
        deadlineMs: 1_000,
        quietWindowMs: 500,
      })
    ).toEqual({ outcome: "waiting" });
    expect(
      settleDecision({
        nowMs: 700,
        lastActivityAtMs: 100,
        inFlight: 0,
        deadlineMs: 1_000,
        quietWindowMs: 500,
      })
    ).toEqual({ outcome: "settled" });
    expect(
      settleDecision({
        nowMs: 1_000,
        lastActivityAtMs: 900,
        inFlight: 2,
        deadlineMs: 1_000,
        quietWindowMs: 500,
      })
    ).toEqual({ outcome: "timeout" });
  });

  it("reports unavailable Project, Estimate, and Invoice details after excluding static routes", () => {
    for (const [label, staticHref, parent] of [
      ["Project Detail", "/projects/new", "/projects"],
      ["Estimate Detail", "/estimates/new", "/estimates"],
      ["Invoice Detail", "/financial/invoices/new", "/financial/invoices"],
    ] as const) {
      expect(
        resolveVisibleDynamicDetail(
          CORE_NAVIGATION_MATRIX.find((target) => target.label === label)!,
          [staticHref, parent, `${parent}/abc/edit`]
        )
      ).toEqual({
        status: "unavailable",
        blocker: { code: "NO_VISIBLE_DETAIL_LINK", target: label, discoveryParent: parent },
      });
    }
    const project = CORE_NAVIGATION_MATRIX.find((target) => target.label === "Project Detail")!;
    expect(
      resolveVisibleDynamicDetail(project, [
        "/projects/daily-logs",
        "/projects/documents",
        "/projects/schedule",
      ])
    ).toMatchObject({ status: "unavailable" });
  });

  it("permits safe GET nouns and blocks non-read methods and mutating actions", () => {
    expect(classifyReadOnlyRequest("GET", "https://hhprojectgroup.com/financial/payments")).toEqual(
      {
        allowed: true,
      }
    );
    expect(classifyReadOnlyRequest("GET", "https://hhprojectgroup.com/upload-receipt")).toEqual({
      allowed: true,
    });
    expect(
      classifyReadOnlyRequest("POST", "https://hhprojectgroup.com/api/payments")
    ).toMatchObject({
      allowed: false,
      code: "NON_READ_METHOD",
    });
    expect(
      classifyReadOnlyRequest("GET", "https://hhprojectgroup.com/api/items?action=delete")
    ).toMatchObject({ allowed: false, code: "MUTATING_ACTION" });
    expect(
      classifyReadOnlyRequest("GET", "https://hhprojectgroup.com/api/items?operation=archive")
    ).toMatchObject({ allowed: false, code: "MUTATING_ACTION" });
  });

  it("builds a visible-link plan and labels unavailable static routes separately from detail blockers", () => {
    const payments = CORE_NAVIGATION_MATRIX.find((target) => target.label === "Payments")!;
    expect(buildNavigationPlan(payments, ["/financial/payments"], { production: false })).toEqual({
      kind: "visible-link",
      href: "/financial/payments",
    });
    expect(buildNavigationPlan(payments, [], { production: false })).toEqual({
      kind: "direct-route",
      href: "/financial/payments",
      blocker: { code: "NO_VISIBLE_STATIC_LINK", target: "Payments" },
    });
  });

  it("uses one truthful cold, warm, repeat sequence and records a route-start fallback", () => {
    expect(SAMPLE_SEQUENCE).toEqual(["cold", "warm", "repeat"]);
    expect(resolveRouteStart({ requestAtMs: null, urlChangeAtMs: 42 })).toEqual({
      atMs: 42,
      source: "url-change-fallback",
    });
    expect(
      classifyNavigationPerformanceResult({
        ...routeResult,
        routeStartSource: "url-change-fallback",
      })
    ).toMatchObject({ ok: true });
  });

  it("blocks Production GET mutation families without false-positive page nouns", () => {
    expect(
      classifyReadOnlyRequest("GET", "https://hhprojectgroup.com/api/ensure-owner")
    ).toMatchObject({
      allowed: false,
      code: "MUTATING_GET_FAMILY",
    });
    expect(
      classifyReadOnlyRequest("GET", "https://hhprojectgroup.com/api/production/cleanup")
    ).toMatchObject({
      allowed: false,
      code: "MUTATING_GET_FAMILY",
    });
    expect(classifyReadOnlyRequest("GET", "https://hhprojectgroup.com/financial/payments")).toEqual(
      {
        allowed: true,
      }
    );
  });

  it("uses a UTC environment-stamped output directory and a complete workflow-hop result", () => {
    expect(buildPerformanceOutputDir("/workspace", "production", "2026-09-02T12:34:56.000Z")).toBe(
      "/workspace/test-results/performance/production-2026-09-02T12-34-56-000Z"
    );
    expect(
      validateWorkflowHop({
        target: "Payments",
        href: "/financial/payments?tab=open",
        status: "measured",
      })
    ).toEqual({ ok: true });
  });
});

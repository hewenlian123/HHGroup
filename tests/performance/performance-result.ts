export const SLOW_REQUEST_THRESHOLD_MS = 1_000;
export const SETTLE_QUIET_WINDOW_MS = 500;
export const SETTLE_TIMEOUT_MS = 5_000;

export const PERFORMANCE_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type BaseNavigationTarget = {
  label: string;
  href: string;
  usefulContentLocator: string;
  workflow?: boolean;
};

export type StaticNavigationTarget = BaseNavigationTarget & { kind: "static" };
export type DynamicNavigationTarget = BaseNavigationTarget & {
  kind: "dynamic";
  discoveryParent: string;
  pathPrefix: string;
  staticExclusions: readonly string[];
};
export type CoreNavigationTarget = StaticNavigationTarget | DynamicNavigationTarget;

/** User-approved Local/Production baseline surface matrix. */
export const CORE_NAVIGATION_MATRIX: readonly CoreNavigationTarget[] = [
  {
    kind: "static",
    label: "Dashboard",
    href: "/dashboard",
    usefulContentLocator: "[aria-label='HH Command Center']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Projects",
    href: "/projects",
    usefulContentLocator: "[data-testid='projects-page-heading']",
    workflow: true,
  },
  {
    kind: "dynamic",
    label: "Project Detail",
    href: "/projects/:visible-record",
    discoveryParent: "/projects",
    pathPrefix: "/projects/",
    staticExclusions: ["/projects", "/projects/new"],
    usefulContentLocator: "[aria-label='Project workspace sections']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Estimates",
    href: "/estimates",
    usefulContentLocator: "main h1:has-text('Estimates')",
  },
  {
    kind: "dynamic",
    label: "Estimate Detail",
    href: "/estimates/:visible-record",
    discoveryParent: "/estimates",
    pathPrefix: "/estimates/",
    staticExclusions: ["/estimates", "/estimates/new"],
    usefulContentLocator: "[data-testid='estimate-detail-header-actions']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Revenue/AR",
    href: "/financial/ar",
    usefulContentLocator: "[data-testid='ar-workspace-summary']",
  },
  {
    kind: "dynamic",
    label: "Invoice Detail",
    href: "/financial/invoices/:visible-record",
    discoveryParent: "/financial/invoices",
    pathPrefix: "/financial/invoices/",
    staticExclusions: ["/financial/invoices", "/financial/invoices/new"],
    usefulContentLocator: "[data-testid='invoice-detail']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Payments",
    href: "/financial/payments",
    usefulContentLocator: "[aria-label='Search payments']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Expenses",
    href: "/financial/expenses",
    usefulContentLocator: "[aria-label='Search expenses']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Workers",
    href: "/workers",
    usefulContentLocator: "[aria-label='Search workers']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Payroll",
    href: "/reports/workforce?tab=payroll",
    usefulContentLocator: "main h1:has-text('Workforce')",
  },
  {
    kind: "static",
    label: "Documents",
    href: "/documents",
    usefulContentLocator: "[aria-label='Search documents']",
  },
  {
    kind: "static",
    label: "Tasks",
    href: "/tasks",
    usefulContentLocator: "main h1:has-text('Tasks')",
  },
  {
    kind: "static",
    label: "Schedule",
    href: "/schedule",
    usefulContentLocator: "[aria-label='Search schedule']",
    workflow: true,
  },
  {
    kind: "static",
    label: "Settings",
    href: "/settings/company",
    usefulContentLocator: "[data-testid='company-profile-section']",
  },
] as const;

export type NavigationPerformanceRequest = {
  method: string;
  url: string;
  resourceType: string;
  startedAtMs: number;
  finishedAtMs?: number;
  durationMs?: number;
  status?: number;
  failure?: string;
};
export type NavigationPerformanceError = {
  source: "console" | "pageerror" | "requestfailed" | "safety";
  message: string;
  url?: string;
};
export type NavigationPerformanceMetadata = {
  environment: "local" | "production";
  baseURL: string;
  browser: string;
  commit: string;
  timestamp: string;
  cacheMode: "native" | "disabled-by-production-interception" | "observation-only";
  sample: "cold" | "warm" | "repeat";
};
export type NavigationPerformanceResult = {
  target: { label: string; href: string };
  viewport: { name: string; width: number; height: number };
  run: number;
  navigation: { fromPath: string; toPath: string; linkHref: string };
  metadata: NavigationPerformanceMetadata;
  clickToFeedbackMs: number;
  clickToRouteStartMs: number;
  routeStartToUsefulContentMs: number;
  fullSettleMs: number;
  settle: {
    outcome: "settled" | "timeout";
    quietWindowMs: number;
    timeoutMs: number;
    inFlightAtEnd: number;
  };
  requests: NavigationPerformanceRequest[];
  requestSummary: {
    duplicateRequests: Array<{ method: string; url: string; count: number }>;
    abortedRequests: NavigationPerformanceRequest[];
    slowRequests: NavigationPerformanceRequest[];
  };
  errors: NavigationPerformanceError[];
};
export type NavigationPerformanceUnavailable = {
  status: "unavailable";
  blocker: {
    code: "NO_VISIBLE_DETAIL_LINK" | "ROUTE_START_NOT_OBSERVED";
    target: string;
    discoveryParent?: string;
  };
};
export type NavigationPerformanceClassification =
  | { ok: true; value: NavigationPerformanceResult }
  | { ok: false; reason: string };

const REQUIRED_FIELDS = [
  "clickToFeedbackMs",
  "clickToRouteStartMs",
  "routeStartToUsefulContentMs",
  "fullSettleMs",
  "requests",
  "errors",
  "metadata",
  "settle",
] as const;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isRequest(value: unknown): value is NavigationPerformanceRequest {
  return (
    isRecord(value) &&
    typeof value.method === "string" &&
    typeof value.url === "string" &&
    typeof value.resourceType === "string" &&
    isNonNegativeNumber(value.startedAtMs) &&
    (value.finishedAtMs === undefined || isNonNegativeNumber(value.finishedAtMs)) &&
    (value.durationMs === undefined || isNonNegativeNumber(value.durationMs)) &&
    (value.status === undefined || typeof value.status === "number") &&
    (value.failure === undefined || typeof value.failure === "string")
  );
}
function isError(value: unknown): value is NavigationPerformanceError {
  return (
    isRecord(value) &&
    ["console", "pageerror", "requestfailed", "safety"].includes(String(value.source)) &&
    typeof value.message === "string" &&
    (value.url === undefined || typeof value.url === "string")
  );
}
function isMetadata(value: unknown): value is NavigationPerformanceMetadata {
  return (
    isRecord(value) &&
    (value.environment === "local" || value.environment === "production") &&
    typeof value.baseURL === "string" &&
    typeof value.browser === "string" &&
    typeof value.commit === "string" &&
    typeof value.timestamp === "string" &&
    (value.cacheMode === "native" ||
      value.cacheMode === "disabled-by-production-interception" ||
      value.cacheMode === "observation-only") &&
    (value.sample === "cold" || value.sample === "warm" || value.sample === "repeat")
  );
}
function requestDurationMs(request: NavigationPerformanceRequest): number | null {
  if (request.durationMs !== undefined) return request.durationMs;
  return request.finishedAtMs === undefined ? null : request.finishedAtMs - request.startedAtMs;
}

function summarizeRequests(requests: NavigationPerformanceRequest[]) {
  const counts = new Map<string, { method: string; url: string; count: number }>();
  for (const request of requests) {
    const method = request.method.toUpperCase();
    const key = `${method} ${request.url}`;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { method, url: request.url, count: 1 });
  }
  return {
    duplicateRequests: [...counts.values()].filter((entry) => entry.count > 1),
    abortedRequests: requests.filter((request) => Boolean(request.failure)),
    slowRequests: requests.filter((request) => {
      const duration = requestDurationMs(request);
      return duration !== null && duration >= SLOW_REQUEST_THRESHOLD_MS;
    }),
  };
}

export function settleDecision(input: {
  nowMs: number;
  lastActivityAtMs: number;
  inFlight: number;
  deadlineMs: number;
  quietWindowMs: number;
}): { outcome: "waiting" | "settled" | "timeout" } {
  if (input.nowMs >= input.deadlineMs) return { outcome: "timeout" };
  if (input.inFlight === 0 && input.nowMs - input.lastActivityAtMs >= input.quietWindowMs)
    return { outcome: "settled" };
  return { outcome: "waiting" };
}

export function resolveVisibleDynamicDetail(
  target: CoreNavigationTarget,
  visibleHrefs: readonly string[]
): { status: "available"; href: string } | NavigationPerformanceUnavailable {
  if (target.kind !== "dynamic") throw new Error(`${target.label} is not a dynamic detail target.`);
  const href = visibleHrefs.find((candidate) => {
    const pathname = candidate.split(/[?#]/)[0];
    if (
      !pathname ||
      target.staticExclusions.includes(pathname) ||
      !pathname.startsWith(target.pathPrefix)
    )
      return false;
    const suffix = pathname.slice(target.pathPrefix.length);
    return Boolean(suffix) && !suffix.includes("/");
  });
  return href
    ? { status: "available", href }
    : {
        status: "unavailable",
        blocker: {
          code: "NO_VISIBLE_DETAIL_LINK",
          target: target.label,
          discoveryParent: target.discoveryParent,
        },
      };
}

export function classifyReadOnlyRequest(
  method: string,
  requestUrl: string
): { allowed: true } | { allowed: false; code: "NON_READ_METHOD" | "MUTATING_ACTION" } {
  if (!/^(GET|HEAD)$/i.test(method)) return { allowed: false, code: "NON_READ_METHOD" };
  try {
    const action = new URL(requestUrl).searchParams.get("action")?.toLowerCase() || "";
    if (
      /^(create|update|delete|remove|save|submit|approve|reject|void|archive|restore|upload|pay)$/i.test(
        action
      )
    )
      return { allowed: false, code: "MUTATING_ACTION" };
  } catch {
    return { allowed: false, code: "MUTATING_ACTION" };
  }
  return { allowed: true };
}
export function isMutatingNavigationRequest(method: string, requestUrl: string): boolean {
  return !classifyReadOnlyRequest(method, requestUrl).allowed;
}

export function classifyNavigationPerformanceResult(
  candidate: unknown
): NavigationPerformanceClassification {
  if (!isRecord(candidate))
    return { ok: false, reason: "Navigation performance result must be an object" };
  for (const field of REQUIRED_FIELDS)
    if (!(field in candidate) || candidate[field] === undefined)
      return { ok: false, reason: `Missing required navigation performance field: ${field}` };
  for (const field of REQUIRED_FIELDS.slice(0, 4))
    if (!isNonNegativeNumber(candidate[field]))
      return {
        ok: false,
        reason: `Navigation performance field must be a non-negative number: ${field}`,
      };
  const clickToFeedbackMs = candidate.clickToFeedbackMs as number;
  const clickToRouteStartMs = candidate.clickToRouteStartMs as number;
  const routeStartToUsefulContentMs = candidate.routeStartToUsefulContentMs as number;
  const fullSettleMs = candidate.fullSettleMs as number;
  if (
    fullSettleMs < clickToFeedbackMs ||
    fullSettleMs < clickToRouteStartMs ||
    fullSettleMs < clickToRouteStartMs + routeStartToUsefulContentMs
  )
    return {
      ok: false,
      reason: "Navigation performance fullSettleMs must include every measured timing",
    };
  if (!Array.isArray(candidate.requests) || !candidate.requests.every(isRequest))
    return {
      ok: false,
      reason: "Navigation performance requests must be a valid request inventory",
    };
  if (!Array.isArray(candidate.errors) || !candidate.errors.every(isError))
    return { ok: false, reason: "Navigation performance errors must be a valid error inventory" };
  if (!isMetadata(candidate.metadata))
    return { ok: false, reason: "Navigation performance result has invalid artifact metadata" };
  if (
    !isRecord(candidate.settle) ||
    (candidate.settle.outcome !== "settled" && candidate.settle.outcome !== "timeout") ||
    !isNonNegativeNumber(candidate.settle.quietWindowMs) ||
    !isNonNegativeNumber(candidate.settle.timeoutMs) ||
    !isNonNegativeNumber(candidate.settle.inFlightAtEnd) ||
    !isRecord(candidate.target) ||
    typeof candidate.target.label !== "string" ||
    typeof candidate.target.href !== "string" ||
    !isRecord(candidate.viewport) ||
    typeof candidate.viewport.name !== "string" ||
    !isNonNegativeNumber(candidate.viewport.width) ||
    !isNonNegativeNumber(candidate.viewport.height) ||
    !Number.isInteger(candidate.run) ||
    !isRecord(candidate.navigation) ||
    typeof candidate.navigation.fromPath !== "string" ||
    typeof candidate.navigation.toPath !== "string" ||
    typeof candidate.navigation.linkHref !== "string"
  )
    return { ok: false, reason: "Navigation performance result has invalid route metadata" };
  const requests = candidate.requests;
  return {
    ok: true,
    value: {
      target: candidate.target as NavigationPerformanceResult["target"],
      viewport: candidate.viewport as NavigationPerformanceResult["viewport"],
      run: candidate.run as number,
      navigation: candidate.navigation as NavigationPerformanceResult["navigation"],
      metadata: candidate.metadata,
      clickToFeedbackMs,
      clickToRouteStartMs,
      routeStartToUsefulContentMs,
      fullSettleMs,
      settle: candidate.settle as NavigationPerformanceResult["settle"],
      requests,
      requestSummary: summarizeRequests(requests),
      errors: candidate.errors,
    },
  };
}

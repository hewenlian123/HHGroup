export const SLOW_REQUEST_THRESHOLD_MS = 1_000;

export type NavigationPerformanceRequest = {
  method: string;
  url: string;
  resourceType: string;
  startedAtMs: number;
  finishedAtMs?: number;
  status?: number;
  failure?: string;
};

export type NavigationPerformanceError = {
  source: "console" | "pageerror" | "requestfailed" | "safety";
  message: string;
  url?: string;
};

export type NavigationPerformanceResult = {
  target: { label: string; href: string };
  viewport: { name: string; width: number; height: number };
  run: number;
  navigation: { fromPath: string; toPath: string; linkHref: string };
  clickToFeedbackMs: number;
  clickToRouteStartMs: number;
  routeStartToUsefulContentMs: number;
  fullSettleMs: number;
  requests: NavigationPerformanceRequest[];
  requestSummary: {
    duplicateRequests: Array<{ method: string; url: string; count: number }>;
    abortedRequests: NavigationPerformanceRequest[];
    slowRequests: NavigationPerformanceRequest[];
  };
  errors: NavigationPerformanceError[];
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
    (value.status === undefined || typeof value.status === "number") &&
    (value.failure === undefined || typeof value.failure === "string")
  );
}

function isError(value: unknown): value is NavigationPerformanceError {
  return (
    isRecord(value) &&
    (value.source === "console" ||
      value.source === "pageerror" ||
      value.source === "requestfailed" ||
      value.source === "safety") &&
    typeof value.message === "string" &&
    (value.url === undefined || typeof value.url === "string")
  );
}

function requestDurationMs(request: NavigationPerformanceRequest): number | null {
  if (request.finishedAtMs === undefined) return null;
  return request.finishedAtMs - request.startedAtMs;
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

/**
 * Classifies raw browser measurements into the JSON contract emitted by the navigation probe.
 * It is intentionally framework-free so the result contract can be tested without a browser.
 */
export function classifyNavigationPerformanceResult(
  candidate: unknown
): NavigationPerformanceClassification {
  if (!isRecord(candidate)) {
    return { ok: false, reason: "Navigation performance result must be an object" };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in candidate) || candidate[field] === undefined) {
      return { ok: false, reason: `Missing required navigation performance field: ${field}` };
    }
  }

  for (const field of REQUIRED_FIELDS.slice(0, 4)) {
    if (!isNonNegativeNumber(candidate[field])) {
      return {
        ok: false,
        reason: `Navigation performance field must be a non-negative number: ${field}`,
      };
    }
  }

  const clickToFeedbackMs = candidate.clickToFeedbackMs as number;
  const clickToRouteStartMs = candidate.clickToRouteStartMs as number;
  const routeStartToUsefulContentMs = candidate.routeStartToUsefulContentMs as number;
  const fullSettleMs = candidate.fullSettleMs as number;
  const run = candidate.run;

  if (!Array.isArray(candidate.requests) || !candidate.requests.every(isRequest)) {
    return {
      ok: false,
      reason: "Navigation performance requests must be a valid request inventory",
    };
  }
  if (!Array.isArray(candidate.errors) || !candidate.errors.every(isError)) {
    return { ok: false, reason: "Navigation performance errors must be a valid error inventory" };
  }

  if (
    !isRecord(candidate.target) ||
    typeof candidate.target.label !== "string" ||
    typeof candidate.target.href !== "string" ||
    !isRecord(candidate.viewport) ||
    typeof candidate.viewport.name !== "string" ||
    !isNonNegativeNumber(candidate.viewport.width) ||
    !isNonNegativeNumber(candidate.viewport.height) ||
    !Number.isInteger(run) ||
    typeof run !== "number" ||
    run < 1 ||
    !isRecord(candidate.navigation) ||
    typeof candidate.navigation.fromPath !== "string" ||
    typeof candidate.navigation.toPath !== "string" ||
    typeof candidate.navigation.linkHref !== "string"
  ) {
    return { ok: false, reason: "Navigation performance result has invalid route metadata" };
  }

  const requests = candidate.requests;
  return {
    ok: true,
    value: {
      target: candidate.target as NavigationPerformanceResult["target"],
      viewport: candidate.viewport as NavigationPerformanceResult["viewport"],
      run,
      navigation: candidate.navigation as NavigationPerformanceResult["navigation"],
      clickToFeedbackMs,
      clickToRouteStartMs,
      routeStartToUsefulContentMs,
      fullSettleMs,
      requests,
      requestSummary: summarizeRequests(requests),
      errors: candidate.errors,
    },
  };
}

/** Fail closed for any method or URL/action that could mutate a Production target. */
export function isMutatingNavigationRequest(method: string, requestUrl: string): boolean {
  if (!/^(GET|HEAD)$/i.test(method)) return true;

  const mutatingAction =
    /(?:^|[\/?#&=_-])(create|update|delete|remove|save|submit|approve|reject|void|archive|restore|upload|pay|payment|mutation|action)(?:$|[\/?#&=_-])/i;
  return mutatingAction.test(requestUrl);
}

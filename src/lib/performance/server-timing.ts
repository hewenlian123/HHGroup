export type HhServerTimingMetric =
  | "hh_auth"
  | "hh_middleware"
  | "hh_server_data"
  | "hh_rsc_prepare"
  | "hh_handler_total"
  | "hh_total";

export type HhServerTimings = Partial<Record<HhServerTimingMetric, number>>;

type HhRscRoute =
  | "projects"
  | "projects/[id]"
  | "dashboard"
  | "estimates/[id]"
  | "financial/ar"
  | "financial/expenses"
  | "workers"
  | "invoices/[id]";

type HhRscTimings = Partial<{
  authMs: number;
  serverDataMs: number;
  rscPrepareMs: number;
  totalMs: number;
}>;

const ORDER: readonly HhServerTimingMetric[] = [
  "hh_auth",
  "hh_middleware",
  "hh_server_data",
  "hh_rsc_prepare",
  "hh_handler_total",
  "hh_total",
];

/** Append duration-only telemetry. No descriptions or request data are accepted. */
export function attachServerTiming<T extends Response>(response: T, timings: HhServerTimings): T {
  const metrics = ORDER.flatMap((name) => {
    const duration = timings[name];
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) return [];
    return [`${name};dur=${duration.toFixed(1)}`];
  });
  if (metrics.length === 0) return response;

  const existing = response.headers.get("Server-Timing")?.trim();
  response.headers.set(
    "Server-Timing",
    existing ? `${existing}, ${metrics.join(", ")}` : metrics.join(", ")
  );
  return response;
}

/**
 * Server Components cannot mutate their outgoing RSC response headers. Emit a
 * duration-only, route-template event that can be correlated with browser RSC
 * Resource Timing without serializing a pathname, record id, query, or identity.
 */
export function emitRscTiming(route: HhRscRoute, timings: HhRscTimings): void {
  if (process.env.HH_PERFORMANCE_DIAGNOSTICS !== "1") return;
  const rounded = Object.fromEntries(
    Object.entries(timings).map(([name, duration]) => [
      name,
      Number.isFinite(duration) && duration >= 0 ? Number(duration.toFixed(1)) : null,
    ])
  );
  console.info("[hh-perf]", JSON.stringify({ route, ...rounded }));
}

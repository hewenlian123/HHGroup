import { afterEach, describe, expect, it, vi } from "vitest";
import { attachServerTiming, emitRscTiming } from "@/lib/performance/server-timing";

afterEach(() => vi.unstubAllEnvs());

describe("safe Server-Timing", () => {
  it("emits only allowlisted numeric durations and preserves existing metrics", () => {
    const response = new Response("ok", { headers: { "Server-Timing": "upstream;dur=4.2" } });

    attachServerTiming(response, {
      hh_auth: 12.345,
      hh_server_data: 40,
      hh_handler_total: Number.NaN,
    });

    expect(response.headers.get("Server-Timing")).toBe(
      "upstream;dur=4.2, hh_auth;dur=12.3, hh_server_data;dur=40.0"
    );
  });

  it("never serializes descriptions, route values, or negative durations", () => {
    const response = new Response("ok");

    attachServerTiming(response, {
      hh_auth: -1,
      hh_middleware: 0,
      hh_total: Number.POSITIVE_INFINITY,
    });

    expect(response.headers.get("Server-Timing")).toBe("hh_middleware;dur=0.0");
  });

  it("emits an opt-in RSC event with only a route template and durations", () => {
    vi.stubEnv("HH_PERFORMANCE_DIAGNOSTICS", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    emitRscTiming("projects/[id]", {
      authMs: 3.14,
      serverDataMs: 20.25,
      rscPrepareMs: 1.25,
      totalMs: 25,
    });

    expect(info).toHaveBeenCalledWith(
      "[hh-perf]",
      '{"route":"projects/[id]","authMs":3.1,"serverDataMs":20.3,"rscPrepareMs":1.3,"totalMs":25}'
    );
    info.mockRestore();
  });

  it("allows routes without a second page-level auth stage to omit it", () => {
    vi.stubEnv("HH_PERFORMANCE_DIAGNOSTICS", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    emitRscTiming("dashboard", {
      serverDataMs: 20,
      rscPrepareMs: 2,
      totalMs: 22,
    });

    expect(info).toHaveBeenCalledWith(
      "[hh-perf]",
      '{"route":"dashboard","serverDataMs":20,"rscPrepareMs":2,"totalMs":22}'
    );
    info.mockRestore();
  });
});

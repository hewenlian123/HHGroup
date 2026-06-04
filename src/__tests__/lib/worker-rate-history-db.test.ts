import { describe, expect, it } from "vitest";

import { normalizeWorkerRateDate, workerRateLocalYmd } from "@/lib/worker-rate-date";

describe("worker rate history date normalization", () => {
  it("preserves YYYY-MM-DD dates without timezone conversion", () => {
    expect(normalizeWorkerRateDate("2026-04-04")).toBe("2026-04-04");
    expect(normalizeWorkerRateDate("2026-04-04T23:30:00.000Z")).toBe("2026-04-04");
  });

  it("accepts MM/DD/YYYY dates and persists the intended calendar date", () => {
    expect(normalizeWorkerRateDate("04/04/2026")).toBe("2026-04-04");
    expect(normalizeWorkerRateDate("4/4/2026")).toBe("2026-04-04");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => normalizeWorkerRateDate("04/31/2026")).toThrow("invalid");
    expect(() => normalizeWorkerRateDate("2026-02-29")).toThrow("invalid");
  });

  it("formats the worker rate default date from local date parts", () => {
    const localDate = {
      getFullYear: () => 2026,
      getMonth: () => 3,
      getDate: () => 4,
      toISOString: () => "2026-04-03T10:30:00.000Z",
    } as Date;

    expect(workerRateLocalYmd(localDate)).toBe("2026-04-04");
  });
});

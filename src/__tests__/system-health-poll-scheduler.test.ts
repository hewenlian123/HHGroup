import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleInitialSystemHealthPoll } from "@/components/system-health/system-health-poll-scheduler";

describe("scheduleInitialSystemHealthPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits 1,200 ms before running the first poll exactly once", () => {
    let runs = 0;
    const cancel = scheduleInitialSystemHealthPoll(() => {
      runs += 1;
    });

    expect(runs).toBe(0);

    vi.advanceTimersByTime(1_199);
    expect(runs).toBe(0);

    vi.advanceTimersByTime(1);
    expect(runs).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(runs).toBe(1);

    cancel();
  });

  it("cancels the pending first poll during cleanup", () => {
    let runs = 0;
    const cancel = scheduleInitialSystemHealthPoll(() => {
      runs += 1;
    });

    cancel();
    vi.advanceTimersByTime(1_200);

    expect(runs).toBe(0);
  });
});

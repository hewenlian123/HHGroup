import { describe, it, expect, vi, afterEach } from "vitest";
import {
  E2E_SEED_WORKER_ID,
  omitE2ESeedWorkerFromBalanceWorkers,
} from "@/lib/e2e-seed-worker";

describe("omitE2ESeedWorkerFromBalanceWorkers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes the E2E seed id when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const rows = [
      { id: E2E_SEED_WORKER_ID, name: "[E2E] Seed Worker" },
      { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Real" },
    ];
    expect(omitE2ESeedWorkerFromBalanceWorkers(rows)).toEqual([rows[1]]);
  });

  it("keeps the E2E seed id in non-production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const rows = [{ id: E2E_SEED_WORKER_ID, name: "[E2E] Seed Worker" }];
    expect(omitE2ESeedWorkerFromBalanceWorkers(rows)).toEqual(rows);
  });
});

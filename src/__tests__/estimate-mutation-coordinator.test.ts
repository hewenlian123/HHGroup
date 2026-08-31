import { describe, expect, it } from "vitest";

import {
  createEstimateMutationSingleFlight,
  createEstimateSerialMutationQueue,
} from "@/app/estimates/_components/estimate-mutation-coordinator";

describe("Estimate mutation coordination", () => {
  it("rejects a second command while the first command is still in flight", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const calls: string[] = [];
    const singleFlight = createEstimateMutationSingleFlight();

    const first = singleFlight.run(async () => {
      calls.push("first");
      await firstGate;
      return "done";
    });
    const second = await singleFlight.run(async () => {
      calls.push("second");
      return "duplicate";
    });

    expect(second).toEqual({ accepted: false });
    expect(calls).toEqual(["first"]);

    releaseFirst();
    await expect(first).resolves.toEqual({ accepted: true, value: "done" });
  });

  it("serializes line snapshots so the newest edit is persisted last", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const persisted: string[] = [];
    const queue = createEstimateSerialMutationQueue();

    const first = queue.enqueue(async () => {
      await firstGate;
      persisted.push("qty=120");
      return true;
    });
    const second = queue.enqueue(async () => {
      persisted.push("qty=121");
      return true;
    });

    await Promise.resolve();
    expect(persisted).toEqual([]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(persisted).toEqual(["qty=120", "qty=121"]);
  });

  it("continues the serial queue after a rejected mutation", async () => {
    const queue = createEstimateSerialMutationQueue();
    const persisted: string[] = [];

    const failed = queue.enqueue(async () => {
      throw new Error("network unavailable");
    });
    const recovered = queue.enqueue(async () => {
      persisted.push("latest");
      return "saved";
    });

    await expect(failed).rejects.toThrow("network unavailable");
    await expect(recovered).resolves.toBe("saved");
    expect(persisted).toEqual(["latest"]);
  });
});

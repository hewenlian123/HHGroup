import { describe, expect, it, vi } from "vitest";

import {
  setEstimateStatusWithClient,
  updateEstimateStatusWithClient,
  type EstimateStatus,
} from "@/lib/estimates-db";

const ESTIMATE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR = {
  userId: "33333333-3333-4333-8333-333333333333",
  label: "owner@example.com",
};

function lifecycleClient(changed: boolean) {
  const rpc = vi.fn().mockResolvedValue({ data: changed, error: null });
  return { rpc, db: { rpc } };
}

describe("estimate Phase 1 lifecycle integrity", () => {
  it("refuses to move an approved estimate back to Draft through the legacy status API", async () => {
    const { db, rpc } = lifecycleClient(false);

    const changed = await updateEstimateStatusWithClient(db as never, ESTIMATE_ID, "Draft", ACTOR);

    expect(changed).toBe(false);
    expect(rpc).toHaveBeenCalledWith("transition_estimate_status_with_activity", {
      p_estimate_id: ESTIMATE_ID,
      p_next_status: "Draft",
      p_actor_user_id: ACTOR.userId,
      p_actor_label: ACTOR.label,
      p_related_record_id: null,
      p_related_record_type: null,
    });
  });

  it.each([
    ["Draft", "Sent"],
    ["Sent", "Approved"],
    ["Sent", "Rejected"],
    ["Approved", "Converted"],
  ] as Array<[EstimateStatus, EstimateStatus]>)(
    "allows the authoritative %s to %s transition",
    async (_current, next) => {
      const { db } = lifecycleClient(true);

      const changed = await setEstimateStatusWithClient(ESTIMATE_ID, next, db as never, ACTOR);

      expect(changed).toBe(true);
    }
  );

  it.each(["Rejected", "Converted"] as EstimateStatus[])("treats %s as terminal", async () => {
    const { db } = lifecycleClient(false);

    const changed = await setEstimateStatusWithClient(ESTIMATE_ID, "Draft", db as never, ACTOR);

    expect(changed).toBe(false);
  });
});

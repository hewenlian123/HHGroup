import { describe, expect, it } from "vitest";

import { shouldShowSystemHealthToast } from "@/components/system-health/system-health-toast-policy";

describe("System Health warning placement policy", () => {
  it("keeps transient warnings away from Estimate controls while allowing other routes", () => {
    expect(shouldShowSystemHealthToast("/estimates")).toBe(false);
    expect(shouldShowSystemHealthToast("/estimates/new")).toBe(false);
    expect(shouldShowSystemHealthToast("/estimates/estimate-1/preview")).toBe(false);
    expect(shouldShowSystemHealthToast("/projects/project-1")).toBe(true);
  });
});

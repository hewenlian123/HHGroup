import { describe, expect, it } from "vitest";

import { enforceEstimateMutationResult } from "@/app/estimates/_components/estimate-mutation-result";

describe("Estimate mutation result contract", () => {
  it("preserves explicit success and failure results", () => {
    expect(enforceEstimateMutationResult({ ok: true })).toEqual({ ok: true });
    expect(enforceEstimateMutationResult({ ok: false, error: "Rejected by server" })).toEqual({
      ok: false,
      error: "Rejected by server",
    });
  });

  it("fails closed when an action returns undefined", () => {
    expect(enforceEstimateMutationResult(undefined)).toEqual({
      ok: false,
      error: "Estimate change returned no result. Your edits are still unsaved.",
    });
  });

  it("fails closed when an action returns a malformed payload", () => {
    expect(enforceEstimateMutationResult({ error: "missing status" })).toEqual({
      ok: false,
      error: "Estimate change returned an invalid result. Your edits are still unsaved.",
    });
  });
});

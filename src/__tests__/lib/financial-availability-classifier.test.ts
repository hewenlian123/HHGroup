import { describe, expect, it } from "vitest";
import {
  FinancialDataUnavailableError,
  classifyFinancialAvailabilityFailure,
} from "@/lib/financial-availability";

describe("financial availability failure classification", () => {
  it.each([
    [{ code: "42501", message: "permission denied" }, "permission_denied"],
    [{ code: "PGRST204", message: "column is missing from schema cache" }, "schema_failure"],
    [{ message: "TypeError: fetch failed ECONNRESET" }, "network_failure"],
    [null, "unavailable_source"],
  ] as const)("classifies %j as %s", (failure, expected) => {
    expect(classifyFinancialAvailabilityFailure(failure)).toBe(expected);
  });

  it("carries the source and typed kind without replacing the database message", () => {
    const error = new FinancialDataUnavailableError("commission_payments", {
      code: "42501",
      message: "permission denied for table commission_payments",
    });

    expect(error.kind).toBe("permission_denied");
    expect(error.source).toBe("commission_payments");
    expect(error.message).toContain("permission denied for table commission_payments");
  });
});

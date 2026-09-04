import { afterEach, describe, expect, it } from "vitest";

import {
  deriveWarrantyExpirationDateOnly,
  formatWarrantyDateOnly,
} from "@/lib/closeout-warranty-date";

const originalTimezone = process.env.TZ;
const TIMEZONES = ["UTC", "Pacific/Honolulu"] as const;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe.each(TIMEZONES)("warranty date-only behavior in %s", (timezone) => {
  it("adds one month to 2026-09-01 without a timezone shift", () => {
    process.env.TZ = timezone;

    const expiration = deriveWarrantyExpirationDateOnly("2026-09-01", 1);
    expect(expiration).toBe("2026-10-01");
    expect(formatWarrantyDateOnly(expiration!)).toBe("10/1/2026");
  });

  it("preserves the existing UTC overflow authority for January 31", () => {
    process.env.TZ = timezone;

    const expiration = deriveWarrantyExpirationDateOnly("2026-01-31", 1);
    expect(expiration).toBe("2026-03-03");
    expect(formatWarrantyDateOnly(expiration!)).toBe("3/3/2026");
  });

  it("returns no expiration for an empty date", () => {
    process.env.TZ = timezone;

    expect(deriveWarrantyExpirationDateOnly("", 1)).toBeNull();
  });

  it("fails closed for a malformed date", () => {
    process.env.TZ = timezone;

    expect(deriveWarrantyExpirationDateOnly("2026-02-31", 1)).toBeNull();
    expect(formatWarrantyDateOnly("2026-02-31")).toBeNull();
  });

  it("preserves the existing no-expiration boundary for zero months", () => {
    process.env.TZ = timezone;

    expect(deriveWarrantyExpirationDateOnly("2026-09-01", 0)).toBeNull();
  });
});

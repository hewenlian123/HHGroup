import { describe, expect, it } from "vitest";
import {
  addCalendarDaysYmd,
  calendarMonthStartYmd,
  hawaiiTodayYmd,
} from "@/lib/hawaii-calendar-date";

describe("Hawaiʻi business calendar date", () => {
  it("uses July 29 while UTC is already July 30", () => {
    expect(hawaiiTodayYmd(new Date("2026-07-30T08:30:00.000Z"))).toBe("2026-07-29");
  });

  it("does not cross month or year boundaries before Hawaiʻi", () => {
    expect(hawaiiTodayYmd(new Date("2026-08-01T09:30:00.000Z"))).toBe("2026-07-31");
    expect(hawaiiTodayYmd(new Date("2027-01-01T09:30:00.000Z"))).toBe("2026-12-31");
  });

  it("crosses the boundary at Hawaiʻi midnight", () => {
    expect(hawaiiTodayYmd(new Date("2026-08-01T10:00:00.000Z"))).toBe("2026-08-01");
    expect(hawaiiTodayYmd(new Date("2027-01-01T10:00:00.000Z"))).toBe("2027-01-01");
  });

  it("performs month and year calendar arithmetic without runtime timezone drift", () => {
    expect(addCalendarDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(addCalendarDaysYmd("2027-01-01", -1)).toBe("2026-12-31");
    expect(calendarMonthStartYmd("2026-07-29")).toBe("2026-07-01");
  });
});

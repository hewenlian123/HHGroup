export const HAWAII_TIME_ZONE = "Pacific/Honolulu";

const hawaiiCalendarFormatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
  timeZone: HAWAII_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function ymdFromUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDateFromYmd(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Calendar date must use YYYY-MM-DD.");

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (ymdFromUtcDate(date) !== value) throw new Error("Calendar date is invalid.");
  return date;
}

/** HH Group's business-calendar date, independent of browser and server time zones. */
export function hawaiiTodayYmd(at: Date | number = new Date()): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) throw new Error("Calendar instant is invalid.");

  const values = new Map(
    hawaiiCalendarFormatter
      .formatToParts(date)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value])
  );
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

/** Calendar-day arithmetic that cannot drift across runtime time zones or DST. */
export function addCalendarDaysYmd(value: string, days: number): string {
  const date = utcDateFromYmd(value);
  date.setUTCDate(date.getUTCDate() + days);
  return ymdFromUtcDate(date);
}

export function calendarMonthStartYmd(value: string): string {
  utcDateFromYmd(value);
  return `${value.slice(0, 7)}-01`;
}

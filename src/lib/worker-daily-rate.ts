import { roundMoney } from "@/lib/money";

/**
 * Full-day pay rate.
 * The Workers list shows `half_day_rate` as "$ / day". When `daily_rate` is
 * exactly twice that value, it is the legacy double and the listed rate wins.
 * Otherwise a positive `daily_rate` wins, and a lone `half_day_rate` is the
 * full day.
 */
export function canonicalWorkerDailyRate(input: {
  dailyRate?: unknown;
  halfDayRate?: unknown;
}): number {
  const daily = Number(input.dailyRate);
  const half = Number(input.halfDayRate);
  const dailyRate = Number.isFinite(daily) && daily > 0 ? daily : 0;
  const halfDayRate = Number.isFinite(half) && half > 0 ? half : 0;
  // Workers list shows half_day_rate as "$ / day". A daily_rate of exactly
  // twice that value is the legacy double (8h × half/4), not a higher rate.
  if (halfDayRate > 0 && dailyRate > 0 && Math.abs(dailyRate - halfDayRate * 2) <= 0.02) {
    return halfDayRate;
  }
  if (dailyRate > 0) return dailyRate;
  return halfDayRate;
}

/**
 * Rate history sometimes stored 2× the listed day rate because half_day_rate
 * already held the full day. Prefer the listed rate in that case.
 */
export function displayedWorkerDailyRate(input: {
  dailyRate?: unknown;
  halfDayRate?: unknown;
  historyDailyRate?: unknown;
}): number {
  const listed = canonicalWorkerDailyRate(input);
  const history = Number(input.historyDailyRate);
  const historyRate = Number.isFinite(history) && history > 0 ? history : 0;
  if (historyRate <= 0) return listed;
  const historyDoublesListed = listed > 0 && Math.abs(historyRate - listed * 2) <= 0.02;
  if (historyDoublesListed) return listed;
  return historyRate;
}

/** Default overtime is the worker OT rate, otherwise 1.5× the hourly day rate. */
export function overtimePayAmount(
  dailyRate: number,
  overtimeHours: number,
  explicitHourlyOtRate?: number | null
): number {
  const hours = Number(overtimeHours);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const explicit = Number(explicitHourlyOtRate);
  const hourly =
    Number.isFinite(explicit) && explicit > 0 ? explicit : (Math.max(0, dailyRate) / 8) * 1.5;
  return roundMoney(hours * hourly);
}

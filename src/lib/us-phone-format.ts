/** Strip non-digits from a phone string. */
export function phoneDigitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Format exactly 10 US digits as (XXX) XXX-XXXX. */
export function formatUsPhoneDigits(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Format phone for display while typing or on paste.
 * When input contains exactly 10 digits, returns (808) 332-3232.
 * Otherwise preserves the user's raw input (no clearing partial/invalid numbers).
 */
export function formatPhoneInputValue(value: string): string {
  const digits = phoneDigitsOnly(value);
  if (digits.length === 10) {
    return formatUsPhoneDigits(digits);
  }
  return value;
}

/**
 * Value to persist: formatted when 10 digits, otherwise trimmed original.
 * Does not mutate or reject existing non-standard stored numbers on read.
 */
export function normalizePhoneForSave(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = phoneDigitsOnly(trimmed);
  if (digits.length === 10) {
    return formatUsPhoneDigits(digits);
  }
  return trimmed;
}

export const US_PHONE_PLACEHOLDER = "(808) 332-3232";

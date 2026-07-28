export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordValidation = { ok: true; value: string } | { ok: false; message: string };

const PASSWORD_GUIDANCE =
  "Use 12–128 characters with uppercase, lowercase, a number, and a symbol.";

export function validatePassword(value: unknown): PasswordValidation {
  if (typeof value !== "string") {
    return { ok: false, message: PASSWORD_GUIDANCE };
  }

  if (
    value.length < PASSWORD_MIN_LENGTH ||
    value.length > PASSWORD_MAX_LENGTH ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/\d/.test(value) ||
    !/[^A-Za-z0-9]/.test(value)
  ) {
    return { ok: false, message: PASSWORD_GUIDANCE };
  }

  return { ok: true, value };
}

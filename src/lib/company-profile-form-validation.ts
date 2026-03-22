/**
 * Client-side validation for Settings → Company Profile (testable, no React).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Max logo size per product copy (5MB). */
export const MAX_COMPANY_LOGO_BYTES = 5 * 1024 * 1024;

/** Empty email is allowed; non-empty must look like an email. */
export function validateCompanyProfileEmailField(email: string): string | null {
  const t = email.trim();
  if (!t) return null;
  if (!EMAIL_RE.test(t)) return "Enter a valid email address.";
  return null;
}

/**
 * Validates logo before upload. Allows common image types + SVG (some browsers omit MIME).
 */
export function validateLogoFileForUpload(file: File): string | null {
  const name = file.name.toLowerCase();
  const extOk = /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/.test(name);
  const type = (file.type || "").toLowerCase();
  const mimeOk = type.startsWith("image/");
  if (!mimeOk && !extOk) {
    return "Please choose an image file (PNG, JPG, SVG, etc.).";
  }
  if (file.size > MAX_COMPANY_LOGO_BYTES) {
    return "Logo must be 5MB or smaller.";
  }
  return null;
}

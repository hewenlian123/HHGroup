import {
  lineItemBodyLooksLikeHtml,
  sanitizeLineItemDescriptionHtml,
} from "@/lib/sanitize-line-item-html";

/**
 * Convert stored line-item body (HTML from legacy editor or plain text) to plain
 * text suitable for the proposal scope bullet editor.
 */
export function lineItemDescriptionToScopePlain(body: string): string {
  const raw = body ?? "";
  if (!raw.trim()) return "";
  if (!lineItemBodyLooksLikeHtml(raw)) return raw;

  const clean = sanitizeLineItemDescriptionHtml(raw);
  if (!clean.trim()) return "";

  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = clean;
    return (div.innerText ?? "").replace(/\r\n/g, "\n").trimEnd();
  }

  return clean
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

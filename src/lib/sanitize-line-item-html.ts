import DOMPurify from "isomorphic-dompurify";

/** Allow only tags produced by the line-item TipTap editor + safe structure. */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "span", "div"],
  ALLOWED_ATTR: ["class"],
};

export function sanitizeLineItemDescriptionHtml(dirty: string): string {
  if (typeof dirty !== "string" || !dirty.trim()) return "";
  return DOMPurify.sanitize(dirty.trim(), SANITIZE_CONFIG);
}

/** First line = title / name; remainder = description (HTML or plain). */
export function splitLineItemDesc(raw: string): { title: string; body: string } {
  const s = raw ?? "";
  const i = s.indexOf("\n");
  if (i < 0) return { title: s, body: "" };
  return { title: s.slice(0, i), body: s.slice(i + 1) };
}

export function lineItemBodyLooksLikeHtml(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  return /<\/?[a-z][\s\S]*?>/i.test(t);
}

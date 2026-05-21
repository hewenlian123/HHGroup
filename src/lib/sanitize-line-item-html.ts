/** Allow only tags produced by the line-item TipTap editor + safe structure. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "span",
  "div",
]);

const BLOCKED_CONTENT_TAGS =
  /<\s*(script|style|template|iframe|object|embed|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HTML_TAG = /<\/?([a-z][\w:-]*)([^>]*)>/gi;
const CLASS_ATTR = /\sclass\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/i;

function sanitizeClassName(raw: string): string {
  const unquoted = raw.replace(/^['"]|['"]$/g, "");
  return unquoted
    .replace(/[^a-zA-Z0-9_:\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeAllowedTag(raw: string, tagName: string, attrs: string): string {
  const isClosing = /^<\s*\//.test(raw);
  const normalizedTag = tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(normalizedTag)) return "";
  if (isClosing) return normalizedTag === "br" ? "" : `</${normalizedTag}>`;
  const classMatch = attrs.match(CLASS_ATTR);
  const className = classMatch ? sanitizeClassName(classMatch[1] ?? "") : "";
  const classAttr = className ? ` class="${className}"` : "";
  return normalizedTag === "br" ? "<br>" : `<${normalizedTag}${classAttr}>`;
}

export function sanitizeLineItemDescriptionHtml(dirty: string): string {
  if (typeof dirty !== "string" || !dirty.trim()) return "";
  return dirty
    .trim()
    .replace(BLOCKED_CONTENT_TAGS, "")
    .replace(HTML_COMMENT, "")
    .replace(HTML_TAG, (raw, tagName: string, attrs: string) =>
      sanitizeAllowedTag(raw, tagName, attrs)
    );
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

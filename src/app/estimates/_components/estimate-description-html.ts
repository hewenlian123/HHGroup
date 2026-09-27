import {
  lineItemBodyLooksLikeHtml,
  sanitizeLineItemDescriptionHtml,
} from "@/lib/sanitize-line-item-html";

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainBodyToEditorHtml(plain: string): string {
  const t = (plain ?? "").replace(/\r\n/g, "\n").trim();
  if (!t) return "<p><br></p>";
  const chunks = t.split("\n").map((line) => {
    const withBr = escapeHtmlText(line).replace(/\u2028/g, "<br />");
    return `<p>${withBr || "<br />"}</p>`;
  });
  return chunks.join("");
}

export function bodyToEditorInnerHtml(body: string): string {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return "<p><br></p>";
  if (lineItemBodyLooksLikeHtml(trimmed)) {
    const clean = sanitizeLineItemDescriptionHtml(trimmed);
    return clean || "<p><br></p>";
  }
  return plainBodyToEditorHtml(body ?? "");
}

export function normalizeEditorDescriptionHtml(raw: string): string {
  let clean = sanitizeLineItemDescriptionHtml(raw);
  const emptyInline = String.raw`(?:\s|&nbsp;|&#160;|<br>)*`;
  const emptyParagraph = String.raw`<p>${emptyInline}<\/p>`;
  const emptyListItem = new RegExp(
    String.raw`<li(?: class="[^"]*")?>${emptyInline}(?:${emptyParagraph}${emptyInline})*<\/li>`,
    "gi"
  );
  const edgeEmptyParagraph = new RegExp(
    String.raw`^(?:${emptyParagraph})+|(?:${emptyParagraph})+$`,
    "gi"
  );
  const emptyList = /<(ul|ol)(?: class="[^"]*")?>\s*<\/\1>/gi;

  let previous = "";
  while (clean !== previous) {
    previous = clean;
    clean = clean.replace(emptyListItem, "").replace(emptyList, "");
  }
  return clean.replace(edgeEmptyParagraph, "").trim();
}

import { cn } from "@/lib/utils";
import {
  lineItemBodyLooksLikeHtml,
  sanitizeLineItemDescriptionHtml,
} from "@/lib/sanitize-line-item-html";

/** Renders stored line-item body: HTML (sanitized) or plain text for legacy rows. */
export function LineItemDescriptionBodyPreview({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  const t = body.trim();
  if (!t) return null;
  if (lineItemBodyLooksLikeHtml(t)) {
    const clean = sanitizeLineItemDescriptionHtml(t);
    if (!clean) return null;
    return (
      <div
        className={cn(
          "line-item-desc-html [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
          className
        )}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }
  return <span className={cn("whitespace-pre-wrap", className)}>{t}</span>;
}

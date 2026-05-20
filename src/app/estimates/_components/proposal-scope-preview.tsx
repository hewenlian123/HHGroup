import * as React from "react";
import { cn } from "@/lib/utils";
import { lineItemBodyLooksLikeHtml } from "@/lib/sanitize-line-item-html";
import { LineItemDescriptionBodyPreview } from "./line-item-description-body-preview";
import { parseProposalScopeLines } from "./proposal-scope-model";

export type ProposalScopePreviewProps = {
  text: string | null | undefined;
  className?: string;
  /** When set, only the first N bullets render, then an ellipsis row. */
  maxBullets?: number;
  /** Visual density / color tokens for screen vs print PDF. */
  variant?: "default" | "compact" | "print";
};

/**
 * Read-only bullet list for proposal scope storage (tabs + U+2028).
 * Does not render raw `\t` or U+2028 — only human-readable bullets and soft line breaks.
 */
export function ProposalScopePreview({
  text,
  className,
  maxBullets,
  variant = "default",
}: ProposalScopePreviewProps): React.ReactElement | null {
  const bullets = parseProposalScopeLines(text);
  if (bullets.length === 0) return null;

  const shown = maxBullets != null ? bullets.slice(0, maxBullets) : bullets;
  const hasMore = maxBullets != null && bullets.length > maxBullets;

  const rowText =
    variant === "print"
      ? "text-sm leading-relaxed text-zinc-700 print:text-zinc-800"
      : variant === "compact"
        ? "text-xs leading-snug text-zinc-500"
        : "text-sm leading-relaxed text-zinc-700";

  return (
    <ul className={cn("m-0 list-none space-y-1 p-0", className)} role="list">
      {shown.map((b, i) => (
        <li
          key={i}
          className={cn("flex gap-2", rowText)}
          style={{ marginLeft: `${b.indent * 0.85}rem` }}
        >
          <span className="mt-1.5 shrink-0 text-zinc-400 print:text-zinc-600" aria-hidden>
            {"\u2022"}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{b.text}</span>
        </li>
      ))}
      {hasMore ? <li className={cn("text-xs italic text-zinc-400")}>{"\u2026"}</li> : null}
    </ul>
  );
}

export type LineItemOrScopeBodyPreviewProps = {
  body: string;
  className?: string;
  maxBullets?: number;
  variant?: ProposalScopePreviewProps["variant"];
};

/**
 * Line item `desc` body (after first newline): legacy HTML from TipTap, or plain proposal scope.
 */
export function LineItemOrScopeBodyPreview({
  body,
  className,
  maxBullets,
  variant = "default",
}: LineItemOrScopeBodyPreviewProps): React.ReactElement | null {
  const t = body ?? "";
  if (!t.trim()) return null;
  if (lineItemBodyLooksLikeHtml(t)) {
    return <LineItemDescriptionBodyPreview body={t} className={className} />;
  }
  return (
    <ProposalScopePreview
      text={t}
      className={className}
      maxBullets={maxBullets}
      variant={variant}
    />
  );
}

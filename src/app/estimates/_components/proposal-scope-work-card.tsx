"use client";

import * as React from "react";
import { Bold, Italic, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  lineItemBodyLooksLikeHtml,
  sanitizeLineItemDescriptionHtml,
} from "@/lib/sanitize-line-item-html";
import { EB, ebInput } from "./estimate-builder-ui";
import { LineItemOrScopeBodyPreview } from "./proposal-scope-preview";

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

function bodyToEditorInnerHtml(body: string): string {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return "<p><br></p>";
  if (lineItemBodyLooksLikeHtml(trimmed)) {
    const clean = sanitizeLineItemDescriptionHtml(trimmed);
    return clean || "<p><br></p>";
  }
  return plainBodyToEditorHtml(body ?? "");
}

function execCommandSafe(cmd: string): void {
  try {
    document.execCommand(cmd, false);
  } catch {
    /* ignore */
  }
}

export type ProposalScopeWorkCardProps = {
  /** Customer-facing line / room name */
  title: string;
  /** Proposal scope: HTML or plain storage */
  description: string;
  readOnly?: boolean;
  disabled?: boolean;
  onTitleChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
  onTitleBlur?: () => void;
  onDescriptionBlur?: () => void;
  /** When true, show validation hint under title */
  titleInvalid?: boolean;
  titlePlaceholder?: string;
  titleInputAriaLabel?: string;
  descriptionEditorAriaLabel?: string;
  /** Optional drag handle (persisted reorder) */
  dragSlot?: React.ReactNode;
  /** Duplicate control — button or form submit */
  duplicateNode?: React.ReactNode;
  /** Delete control */
  deleteNode?: React.ReactNode;
  /** Optional footer (e.g. mobile pricing strip) */
  footer?: React.ReactNode;
  /** Qty / unit price / total beside title (proposal-style inline row) */
  inlinePricing?: React.ReactNode;
  className?: string;
};

/**
 * Compact proposal scope block: title row with optional inline pricing,
 * description ~100px floor growing to ~140px then scroll; light format toolbar.
 */
export function ProposalScopeWorkCard({
  title,
  description,
  readOnly = false,
  disabled = false,
  onTitleChange,
  onDescriptionChange,
  onTitleBlur,
  onDescriptionBlur,
  titleInvalid = false,
  titlePlaceholder = "Title",
  titleInputAriaLabel,
  descriptionEditorAriaLabel,
  dragSlot,
  duplicateNode,
  deleteNode,
  footer,
  inlinePricing,
  className,
}: ProposalScopeWorkCardProps): React.ReactElement {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const editorFocusedRef = React.useRef(false);

  const showToolbar =
    Boolean(dragSlot) || (!readOnly && (Boolean(duplicateNode) || Boolean(deleteNode)));

  const resizeEditorToContent = React.useCallback((): void => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minPx = 100;
    const maxPx = 140;
    const sh = el.scrollHeight;
    const next = Math.min(Math.max(sh, minPx), maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = sh > maxPx ? "auto" : "hidden";
  }, []);

  const pushDescriptionFromEditor = (): void => {
    if (!onDescriptionChange) return;
    const raw = editorRef.current?.innerHTML ?? "";
    onDescriptionChange(sanitizeLineItemDescriptionHtml(raw));
  };

  const handleDescriptionInput = (): void => {
    pushDescriptionFromEditor();
    resizeEditorToContent();
  };

  const handleDescriptionBlur = (): void => {
    editorFocusedRef.current = false;
    pushDescriptionFromEditor();
    resizeEditorToContent();
    onDescriptionBlur?.();
  };

  React.useLayoutEffect(() => {
    if (readOnly) return;
    const el = editorRef.current;
    if (!el) return;
    if (editorFocusedRef.current) return;
    el.innerHTML = bodyToEditorInnerHtml(description);
    resizeEditorToContent();
  }, [description, readOnly, resizeEditorToContent]);

  const handleToolbarMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
  };

  const focusEditor = (): void => {
    editorRef.current?.focus();
  };

  const runFormatCommand = (cmd: string): void => {
    focusEditor();
    execCommandSafe(cmd);
    requestAnimationFrame(() => {
      resizeEditorToContent();
    });
  };

  return (
    <div
      className={cn(
        "eb-proposal-scope-work-card rounded-sm border border-white/[0.04] bg-transparent px-0 pb-0 pt-0",
        "shadow-none backdrop-blur-none transition-[border-color,background-color] duration-150",
        "hover:border-white/[0.07] hover:bg-white/[0.012]",
        className
      )}
    >
      {showToolbar ? (
        <div className="flex items-start justify-between gap-1 px-1.5 pt-1">
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            {dragSlot ? <div className="mt-0.5 shrink-0">{dragSlot}</div> : null}
          </div>
          {!readOnly && (duplicateNode || deleteNode) ? (
            <div className="flex shrink-0 items-center gap-1">
              {duplicateNode ? <span className="inline-flex">{duplicateNode}</span> : null}
              {deleteNode ? <span className="inline-flex">{deleteNode}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-end gap-x-3 gap-y-2 px-1.5 pb-0.5",
          showToolbar ? "pt-0" : "pt-1"
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <span className={EB.readLabel}>Title</span>
          {readOnly ? (
            <p className="text-xs font-semibold leading-snug tracking-tight text-zinc-50">
              {title.trim() || "—"}
            </p>
          ) : (
            <Input
              value={title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              onBlur={() => onTitleBlur?.()}
              disabled={disabled}
              placeholder={titlePlaceholder}
              aria-label={titleInputAriaLabel}
              aria-invalid={titleInvalid}
              className={ebInput("h-7 text-xs font-semibold tracking-tight")}
            />
          )}
          {titleInvalid ? (
            <p className="text-xs text-amber-400/90">Add a name for this line.</p>
          ) : null}
        </div>
        {inlinePricing ? (
          <div className="flex shrink-0 flex-wrap items-end justify-end gap-x-2 gap-y-1">
            {inlinePricing}
          </div>
        ) : null}
      </div>

      <div className="space-y-0.5 px-1.5 pb-1.5">
        <span className={EB.readLabel}>Description</span>
        {readOnly ? (
          <div
            className={cn(
              "max-h-[140px] overflow-y-auto rounded-sm border border-white/[0.03] bg-transparent px-1 py-0.5",
              description.trim() ? "min-h-0" : "min-h-[2rem]"
            )}
          >
            {description.trim() ? (
              <LineItemOrScopeBodyPreview
                body={description}
                variant="default"
                className="text-xs leading-snug text-zinc-300"
              />
            ) : (
              <p className="text-xs leading-snug text-zinc-600">—</p>
            )}
          </div>
        ) : (
          <div className="rounded-sm border border-white/[0.03] bg-transparent">
            <div
              className="flex flex-wrap gap-0 border-b border-white/[0.03] px-0.5 py-px"
              onMouseDown={handleToolbarMouseDown}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 min-h-5 min-w-5 shrink-0 px-0 text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                aria-label="Bold"
                disabled={disabled}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => {
                  runFormatCommand("bold");
                }}
              >
                <Bold className="h-2.5 w-2.5" strokeWidth={2} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 min-h-5 min-w-5 shrink-0 px-0 text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                aria-label="Italic"
                disabled={disabled}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => {
                  runFormatCommand("italic");
                }}
              >
                <Italic className="h-2.5 w-2.5" strokeWidth={2} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 min-h-5 min-w-5 shrink-0 px-0 text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                aria-label="Bullet list"
                disabled={disabled}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => {
                  runFormatCommand("insertUnorderedList");
                }}
              >
                <List className="h-2.5 w-2.5" strokeWidth={2} />
              </Button>
            </div>
            <div
              ref={editorRef}
              role="textbox"
              aria-multiline
              aria-label={descriptionEditorAriaLabel}
              contentEditable={!disabled}
              suppressContentEditableWarning
              onFocus={() => {
                editorFocusedRef.current = true;
                requestAnimationFrame(() => {
                  resizeEditorToContent();
                });
              }}
              onBlur={handleDescriptionBlur}
              onInput={handleDescriptionInput}
              className={cn(
                "proposal-scope-inline-editor max-h-[140px] min-h-0 w-full px-1 py-0.5 text-xs leading-snug text-zinc-200 outline-none break-words",
                "[&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-3 [&_ol]:my-0 [&_ol]:list-decimal [&_ol]:pl-3",
                "[&_p]:my-0 [&_p]:min-h-[1.05em]",
                "[&_strong]:font-semibold [&_b]:font-semibold",
                "[&_em]:italic [&_i]:italic",
                disabled && "pointer-events-none opacity-50"
              )}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                try {
                  document.execCommand("insertText", false, text);
                } catch {
                  /* ignore */
                }
                requestAnimationFrame(() => {
                  resizeEditorToContent();
                });
              }}
            />
          </div>
        )}
      </div>

      {footer ? <div className="border-t border-white/[0.03] bg-transparent">{footer}</div> : null}
    </div>
  );
}

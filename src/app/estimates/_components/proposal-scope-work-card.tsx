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
  /** Optional 1-based line index badge */
  lineIndex?: number;
  /** Unified index + title + pricing + description grid (/estimates/new) */
  lineItemGridLayout?: boolean;
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
  lineIndex,
  lineItemGridLayout = false,
  className,
}: ProposalScopeWorkCardProps): React.ReactElement {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const editorFocusedRef = React.useRef(false);

  const showDragRow = Boolean(dragSlot);
  const showLineItemActions = !readOnly && (Boolean(duplicateNode) || Boolean(deleteNode));

  const resizeEditorToContent = React.useCallback((): void => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = "auto";
    const isDesktop =
      typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    const minPx = isDesktop ? 90 : 88;
    const maxPx = 112;
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

  const useLineItemGrid = lineItemGridLayout && Boolean(inlinePricing);

  const titleField = readOnly ? (
    <p className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-[#F6F7FA]">
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
      className={ebInput(
        "h-8 text-[14px] font-medium leading-[1.4] tracking-[-0.01em] text-[#D8DEE8] placeholder:text-[#7F899B]"
      )}
    />
  );

  const descriptionBlock = (
    <div className={cn(EB.lineItemDescriptionBlock, !useLineItemGrid && "pt-1.5")}>
      <span className={cn(EB.readLabel, "block pb-1")}>Description</span>
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
              className="text-[14px] leading-[1.4] text-[#D8DEE8]"
            />
          ) : (
            <p className="text-[14px] leading-snug text-[#A7B0C0]">—</p>
          )}
        </div>
      ) : (
        <div className="eb-scope-editor-surface">
          <div
            className="eb-scope-editor-toolbar flex flex-wrap gap-0 px-0.5 py-0"
            onMouseDown={handleToolbarMouseDown}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 min-h-6 min-w-6 shrink-0 px-0 text-[#929CAF] hover:bg-white/[0.04] hover:text-[#B5BECC]"
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
              className="h-6 w-6 min-h-6 min-w-6 shrink-0 px-0 text-[#929CAF] hover:bg-white/[0.04] hover:text-[#B5BECC]"
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
              className="h-6 w-6 min-h-6 min-w-6 shrink-0 px-0 text-[#929CAF] hover:bg-white/[0.04] hover:text-[#B5BECC]"
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
              "proposal-scope-inline-editor max-h-[7rem] w-full px-2 py-1.5 text-[14px] leading-[1.4] text-[#D8DEE8] outline-none break-words",
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
  );

  return (
    <div
      className={cn(
        "eb-proposal-scope-work-card rounded-sm border-0 bg-transparent px-0 pb-0 pt-0 shadow-none backdrop-blur-none",
        className
      )}
    >
      {showDragRow ? (
        <div className={cn(EB.lineItemDragRow, "flex items-center px-1 pt-0.5")}>
          <div className="shrink-0">{dragSlot}</div>
        </div>
      ) : null}

      {useLineItemGrid ? (
        <div className={cn(EB.lineItemGridPricing, showDragRow ? "pt-0" : "pt-1")}>
          {lineIndex != null ? (
            <span className={EB.lineIndexBadge} aria-label={`Line ${lineIndex}`}>
              #{lineIndex}
            </span>
          ) : null}
          <span className={cn(EB.readLabel, EB.lineTitleLabel)}>Title</span>
          <div className={cn(EB.lineTitleInputWrap, EB.lineItemTitleField)}>
            {titleField}
            {titleInvalid ? (
              <p className="text-xs text-amber-400/90">Add a name for this line.</p>
            ) : null}
          </div>
          <div className={EB.lineItemPricingWrap}>{inlinePricing}</div>
          {descriptionBlock}
        </div>
      ) : (
        <>
          <div
            className={cn(
              inlinePricing ? EB.lineItemFirstRowPricing : EB.lineItemFirstRow,
              showDragRow ? "pt-0" : "pt-1"
            )}
          >
            {lineIndex != null ? (
              <span className={EB.lineIndexBadge} aria-label={`Line ${lineIndex}`}>
                #{lineIndex}
              </span>
            ) : null}
            <div className={cn(EB.lineFieldStack, EB.lineItemTitleField)}>
              <span className={EB.readLabel}>Title</span>
              {titleField}
              {titleInvalid ? (
                <p className="text-xs text-amber-400/90">Add a name for this line.</p>
              ) : null}
            </div>
            {inlinePricing ? <div className={EB.lineItemPricingWrap}>{inlinePricing}</div> : null}
          </div>
          {descriptionBlock}
        </>
      )}

      {!useLineItemGrid && showLineItemActions ? (
        <div className={EB.lineItemActionsBar}>
          <div className={EB.lineItemActionsInner}>
            {duplicateNode ? <span className="inline-flex">{duplicateNode}</span> : null}
            {deleteNode ? <span className="inline-flex">{deleteNode}</span> : null}
          </div>
        </div>
      ) : null}

      {footer ? <div className="border-t border-white/[0.03] bg-transparent">{footer}</div> : null}
    </div>
  );
}

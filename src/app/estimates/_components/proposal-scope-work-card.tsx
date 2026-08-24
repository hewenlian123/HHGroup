"use client";

import * as React from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  lineItemBodyLooksLikeHtml,
  sanitizeLineItemDescriptionHtml,
} from "@/lib/sanitize-line-item-html";
import { EB, ebInput } from "./estimate-builder-ui";

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

function normalizeEditorDescriptionHtml(raw: string): string {
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

function removeEmptyEditorBoundaryParagraphs(root: HTMLElement): void {
  const isEmptyParagraph = (node: Element | null): node is HTMLParagraphElement => {
    if (!(node instanceof HTMLParagraphElement)) return false;
    const text = (node.textContent ?? "").replace(/\u00a0/g, "").trim();
    return text.length === 0 && !node.querySelector("img,video,audio,iframe");
  };

  while (isEmptyParagraph(root.firstElementChild)) root.firstElementChild.remove();
  while (isEmptyParagraph(root.lastElementChild)) root.lastElementChild.remove();
}

function descriptionSummaryText(body: string): string {
  const source = lineItemBodyLooksLikeHtml(body)
    ? sanitizeLineItemDescriptionHtml(body)
        .replace(/<\s*li\b[^>]*>/gi, " • ")
        .replace(/<\s*br\s*\/?\s*>/gi, " ")
        .replace(/<\s*\/\s*(?:p|div|li|ul|ol)\s*>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
    : body;

  return source
    .replace(/[\r\n\t\u2028]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function execCommandSafe(cmd: string): void {
  try {
    document.execCommand(cmd, false);
  } catch {
    /* ignore */
  }
}

const DESCRIPTION_FORMAT_COMMANDS = [
  { label: "Bold", command: "bold", Icon: Bold },
  { label: "Italic", command: "italic", Icon: Italic },
  { label: "Bullet list", command: "insertUnorderedList", Icon: List },
  { label: "Numbered list", command: "insertOrderedList", Icon: ListOrdered },
] as const;

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
  onDescriptionBlur?: (normalizedValue: string) => void;
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
  /** Status pill or other chips beside title */
  titleTrailingSlot?: React.ReactNode;
  className?: string;
};

/**
 * Compact proposal scope block: title row with optional inline pricing,
 * content-driven description editor, and light format toolbar.
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
  titleTrailingSlot,
  className,
}: ProposalScopeWorkCardProps): React.ReactElement {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const descriptionSummaryRef = React.useRef<HTMLButtonElement>(null);
  const editorFocusedRef = React.useRef(false);
  const editorSelectionRef = React.useRef<Range | null>(null);
  const [descriptionEditing, setDescriptionEditing] = React.useState(false);

  const showDragRow = Boolean(dragSlot);
  const showLineItemActions = !readOnly && (Boolean(duplicateNode) || Boolean(deleteNode));

  const resizeEditorToContent = React.useCallback((): void => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minPx = 104;
    const sh = el.scrollHeight;
    const next = Math.max(sh, minPx);
    el.style.height = `${next}px`;
    el.style.overflowY = "hidden";
  }, []);

  const captureEditorSelection = (): void => {
    const root = editorRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    editorSelectionRef.current = range.cloneRange();
  };

  const restoreEditorSelection = (): void => {
    const range = editorSelectionRef.current;
    if (!range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const pushDescriptionFromEditor = (): string => {
    const raw = editorRef.current?.innerHTML ?? "";
    const normalized = normalizeEditorDescriptionHtml(raw);
    onDescriptionChange?.(normalized);
    return normalized;
  };

  const handleDescriptionInput = (): void => {
    pushDescriptionFromEditor();
    resizeEditorToContent();
  };

  const collapseDescriptionEditor = (focusSummary: boolean): void => {
    editorFocusedRef.current = false;
    const normalized = pushDescriptionFromEditor();
    setDescriptionEditing(false);
    onDescriptionBlur?.(normalized);
    if (focusSummary) {
      requestAnimationFrame(() => descriptionSummaryRef.current?.focus());
    }
  };

  const handleDescriptionSurfaceBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    collapseDescriptionEditor(false);
  };

  React.useLayoutEffect(() => {
    if (readOnly || !descriptionEditing) return;
    const el = editorRef.current;
    if (!el) return;
    if (editorFocusedRef.current) return;
    el.innerHTML = bodyToEditorInnerHtml(description);
    el.focus();
    removeEmptyEditorBoundaryParagraphs(el);
    resizeEditorToContent();
    const selection = window.getSelection();
    const range = document.createRange();
    const caretTarget =
      el.querySelector<HTMLElement>(
        "ol:last-child > li:last-child, ul:last-child > li:last-child"
      ) ??
      el.lastElementChild ??
      el;
    range.selectNodeContents(caretTarget);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    captureEditorSelection();
  }, [description, descriptionEditing, readOnly, resizeEditorToContent]);

  const handleToolbarMouseDown = (e: React.MouseEvent): void => {
    captureEditorSelection();
    e.preventDefault();
  };

  const focusEditor = (): void => {
    editorRef.current?.focus();
  };

  const ensureListFormatting = (cmd: string, beforeHtml: string): void => {
    const tagName =
      cmd === "insertOrderedList" ? "ol" : cmd === "insertUnorderedList" ? "ul" : null;
    const root = editorRef.current;
    const selection = window.getSelection();
    if (!tagName || !root || !selection || selection.rangeCount === 0) return;
    if (root.innerHTML !== beforeHtml && root.querySelector(tagName)) return;

    const range = selection.getRangeAt(0);
    const blocks = Array.from(root.children).filter((block) => range.intersectsNode(block));
    if (blocks.length === 0) return;

    const list = document.createElement(tagName);
    for (const block of blocks) {
      const item = document.createElement("li");
      while (block.firstChild) item.appendChild(block.firstChild);
      list.appendChild(item);
    }
    blocks[0]?.replaceWith(list);
    for (const block of blocks.slice(1)) block.remove();

    const nextRange = document.createRange();
    nextRange.selectNodeContents(list);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    captureEditorSelection();
  };

  const runFormatCommand = (cmd: string): void => {
    focusEditor();
    restoreEditorSelection();
    const beforeHtml = editorRef.current?.innerHTML ?? "";
    execCommandSafe(cmd);
    ensureListFormatting(cmd, beforeHtml);
    pushDescriptionFromEditor();
    requestAnimationFrame(() => {
      resizeEditorToContent();
    });
  };

  const handleDescriptionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      collapseDescriptionEditor(true);
    }
  };

  const useLineItemGrid = lineItemGridLayout && Boolean(inlinePricing);

  const titleField = readOnly ? (
    <p className="text-hh-body font-semibold leading-snug tracking-normal text-foreground">
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
        "h-8 text-hh-body font-medium leading-[1.4] tracking-normal text-foreground placeholder:text-muted-foreground"
      )}
    />
  );

  const descriptionSummary = descriptionSummaryText(description);
  const descriptionBlock = (
    <div className={cn(EB.lineItemDescriptionBlock, !useLineItemGrid && "pt-1.5")}>
      <span className={cn(EB.readLabel, "block pb-1")}>Description</span>
      {readOnly ? (
        <div className="eb-scope-description-readonly-wrap">
          <div
            className={cn(
              "eb-scope-description-readonly min-w-0 truncate px-0 py-0.5 text-hh-body leading-[1.4] text-foreground",
              descriptionSummary ? "min-h-0" : "min-h-[2rem] text-muted-foreground"
            )}
            title={descriptionSummary || undefined}
          >
            {descriptionSummary || "—"}
          </div>
        </div>
      ) : !descriptionEditing ? (
        <button
          ref={descriptionSummaryRef}
          type="button"
          className="eb-description-summary-button flex h-8 min-h-8 w-full min-w-0 items-center rounded-hh-compact px-2 text-left text-hh-body text-foreground outline-none"
          onClick={() => {
            if (!disabled) setDescriptionEditing(true);
          }}
          disabled={disabled}
          aria-label={descriptionEditorAriaLabel}
          aria-expanded="false"
          title={descriptionSummary || "Add description"}
        >
          <span
            className={cn(
              "eb-description-summary-text block min-w-0 flex-1 truncate",
              !descriptionSummary && "text-muted-foreground"
            )}
          >
            {descriptionSummary || "Add description…"}
          </span>
        </button>
      ) : (
        <div
          className="eb-scope-editor-surface"
          data-description-expanded="true"
          onBlur={handleDescriptionSurfaceBlur}
          onKeyDown={handleDescriptionKeyDown}
        >
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
            onInput={handleDescriptionInput}
            className={cn(
              "proposal-scope-inline-editor w-full break-words px-2 py-2 text-hh-body leading-[1.4] text-foreground outline-none",
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
          <div
            className="eb-scope-editor-toolbar flex min-h-8 items-center gap-0 border-t px-1 py-0.5"
            onMouseDown={handleToolbarMouseDown}
          >
            {DESCRIPTION_FORMAT_COMMANDS.map(({ label, command, Icon }) => (
              <Button
                key={command}
                type="button"
                variant="ghost"
                size="sm"
                className="eb-scope-editor-format-button h-6 w-6 min-h-6 min-w-6 shrink-0 px-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={label}
                disabled={disabled}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => runFormatCommand(command)}
              >
                <Icon className="h-2.5 w-2.5" strokeWidth={2} />
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="eb-scope-editor-done ml-auto h-6 min-h-6 px-2 text-xs font-medium"
              data-testid="estimate-description-done"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => collapseDescriptionEditor(true)}
            >
              Done
            </Button>
          </div>
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
      {showDragRow && !useLineItemGrid ? (
        <div className={cn(EB.lineItemDragRow, "flex items-center px-1 pt-0.5")}>
          <div className="shrink-0">{dragSlot}</div>
        </div>
      ) : null}

      {useLineItemGrid ? (
        <div className={cn(EB.lineItemGridPricing, showDragRow ? "pt-0" : "pt-1")}>
          <div className={EB.lineItemItemCell}>
            <div className="eb-line-item-index-control">
              {lineIndex != null ? (
                <span className={EB.lineIndexBadge} aria-label={`Line ${lineIndex}`}>
                  #{lineIndex}
                </span>
              ) : null}
              {showDragRow ? <span className="eb-line-item-inline-drag">{dragSlot}</span> : null}
            </div>
            <span className={cn(EB.readLabel, EB.lineTitleLabel)}>Item</span>
            <div className={cn(EB.lineTitleInputWrap, EB.lineItemTitleField)}>
              <div className="eb-line-item-title-control flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">{titleField}</div>
                {titleTrailingSlot ? (
                  <div className="eb-line-item-title-meta">{titleTrailingSlot}</div>
                ) : null}
              </div>
              {titleInvalid ? (
                <p className="text-hh-error text-[var(--hh-warning)]">Add a name for this line.</p>
              ) : null}
            </div>
          </div>
          {descriptionBlock}
          <div className={EB.lineItemPricingWrap}>{inlinePricing}</div>
        </div>
      ) : (
        <>
          <div
            className={cn(
              inlinePricing ? EB.lineItemFirstRowPricing : EB.lineItemFirstRow,
              lineIndex == null && "eb-line-item-first-row--no-index",
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
              <div className="eb-line-item-title-control flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">{titleField}</div>
                {titleTrailingSlot ? (
                  <div className="eb-line-item-title-meta">{titleTrailingSlot}</div>
                ) : null}
              </div>
              {titleInvalid ? (
                <p className="text-hh-error text-[var(--hh-warning)]">Add a name for this line.</p>
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

      {footer ? <div className="border-t border-border bg-transparent">{footer}</div> : null}
    </div>
  );
}

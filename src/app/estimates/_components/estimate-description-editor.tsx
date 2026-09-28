"use client";

import * as React from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { bodyToEditorInnerHtml, normalizeEditorDescriptionHtml } from "./estimate-description-html";

const formats = [
  { label: "Bold", command: "bold", Icon: Bold },
  { label: "Italic", command: "italic", Icon: Italic },
  { label: "Bullets", command: "insertUnorderedList", Icon: List },
  { label: "Numbered List", command: "insertOrderedList", Icon: ListOrdered },
] as const;

export function EstimateDescriptionEditor({
  body,
  label = "Description",
  disabled = false,
  readOnly = false,
  onChange,
  onBlur,
  editorRef,
  bodyClassName = "",
  placeholder = "Add description…",
}: {
  body: string;
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onChange?: (body: string) => void;
  onBlur?: (body: string) => void;
  editorRef?: React.RefObject<HTMLDivElement>;
  bodyClassName?: string;
  placeholder?: string;
}): React.ReactElement {
  const ownRef = React.useRef<HTMLDivElement>(null);
  const editor = editorRef ?? ownRef;
  const [active, setActive] = React.useState(false);
  const dirty = React.useRef(false);
  const selectionRef = React.useRef<Range | null>(null);
  const captureSelection = (): void => {
    const selection = window.getSelection();
    if (
      selection?.rangeCount &&
      editor.current?.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };
  React.useLayoutEffect(() => {
    const el = editor.current;
    if (el && !el.contains(document.activeElement)) el.innerHTML = bodyToEditorInnerHtml(body);
  }, [body, editor]);
  const publish = (): string => {
    const value = normalizeEditorDescriptionHtml(editor.current?.innerHTML ?? "");
    dirty.current = true;
    onChange?.(value);
    return value;
  };
  const runFormat = (command: string): void => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (
      selection &&
      selectionRef.current &&
      el.contains(selectionRef.current.commonAncestorContainer)
    ) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    const before = el.innerHTML;
    document.execCommand(command, false);
    const tag =
      command === "insertOrderedList" ? "ol" : command === "insertUnorderedList" ? "ul" : null;
    if (tag && selection?.rangeCount && (el.innerHTML === before || !el.querySelector(tag))) {
      const range = selection.getRangeAt(0);
      const blocks = Array.from(el.children).filter((block) => range.intersectsNode(block));
      if (blocks.length) {
        const list = document.createElement(tag);
        for (const block of blocks) {
          const item = document.createElement("li");
          while (block.firstChild) item.appendChild(block.firstChild);
          list.appendChild(item);
        }
        blocks[0].replaceWith(list);
        blocks.slice(1).forEach((block) => block.remove());
        const next = document.createRange();
        next.selectNodeContents(list);
        selection.removeAllRanges();
        selection.addRange(next);
      }
    }
    captureSelection();
    publish();
  };
  return (
    <div
      className="estimate-description-editor eb-note-rich-surface"
      data-description-active={active || undefined}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setActive(false);
        if (dirty.current) {
          dirty.current = false;
          onBlur?.(normalizeEditorDescriptionHtml(editor.current?.innerHTML ?? ""));
        }
      }}
    >
      <div
        ref={editor}
        role="textbox"
        aria-label={label}
        aria-multiline
        aria-keyshortcuts="Alt+F10"
        aria-readonly={readOnly || disabled}
        contentEditable={!disabled && !readOnly}
        suppressContentEditableWarning
        className={`estimate-description-body eb-note-rich-body ${bodyClassName}`}
        data-placeholder={placeholder}
        data-empty={!normalizeEditorDescriptionHtml(body) || undefined}
        onFocus={() => setActive(true)}
        onInput={publish}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "F10") {
            event.preventDefault();
            event.currentTarget.parentElement
              ?.querySelector<HTMLButtonElement>('[role="toolbar"] button')
              ?.focus();
            return;
          }
          if (
            !event.nativeEvent.isComposing &&
            (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey)))
          ) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          publish();
        }}
      />
      {active && !disabled && !readOnly ? (
        <div
          className="estimate-description-toolbar eb-note-rich-toolbar"
          role="toolbar"
          aria-label="Description formatting"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button")
            );
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              buttons[
                (index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length
              ]?.focus();
            } else if (event.key === "Escape") {
              event.preventDefault();
              editor.current?.focus();
            }
          }}
        >
          {formats.map(({ label: name, command, Icon }) => (
            <button
              key={command}
              type="button"
              tabIndex={-1}
              aria-label={name}
              title={name}
              onMouseDown={(event) => {
                captureSelection();
                event.preventDefault();
              }}
              onClick={() => runFormat(command)}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";
import {
  type ScopeBulletRow,
  createEmptyScopeRow,
  parseScopeStorage,
  serializeScopeStorage,
} from "./proposal-scope-model";

export type ProposalScopeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** Shown when all bullets are empty */
  placeholder?: string;
  /** Accessible name for the writing surface */
  ariaLabel: string;
  id?: string;
  /** Table row: tighter; modal / intro: more air */
  density?: "compact" | "comfortable";
  /** Decorative drag handle (non-interactive); hidden on small screens when compact */
  showHandle?: boolean;
  /** Extra class on outer surface */
  className?: string;
};

function resizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "0";
  el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
}

export function ProposalScopeEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  placeholder = "Mobilization, site protection, dust control…",
  ariaLabel,
  id,
  density = "compact",
  showHandle = true,
  className,
}: ProposalScopeEditorProps): React.ReactElement {
  const [rows, setRows] = React.useState<ScopeBulletRow[]>(() => parseScopeStorage(value));
  const rowRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  React.useEffect(() => {
    setRows((prev) => {
      const prevSerialized = serializeScopeStorage(prev);
      if (prevSerialized === value) return prev;
      return parseScopeStorage(value);
    });
  }, [value]);

  const applyRows = React.useCallback(
    (next: ScopeBulletRow[]): void => {
      rowsRef.current = next;
      setRows(next);
      onChange(serializeScopeStorage(next));
    },
    [onChange]
  );

  const comfortable = density === "comfortable";
  const rowPad = comfortable ? "py-2.5" : "py-2 md:py-1.5";
  const textClass = comfortable
    ? "text-[15px] leading-[1.55] tracking-[-0.01em] text-zinc-100"
    : "text-sm leading-[1.5] text-zinc-100";

  const onRowTextChange = (rowId: string, text: string): void => {
    const prev = rowsRef.current;
    const next = prev.map((r) => (r.id === rowId ? { ...r, text } : r));
    applyRows(next);
    requestAnimationFrame(() => resizeTextarea(rowRefs.current[rowId]));
  };

  const focusRowEnd = (rowId: string): void => {
    requestAnimationFrame(() => {
      const el = rowRefs.current[rowId];
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      resizeTextarea(el);
    });
  };

  const focusRowStart = (rowId: string): void => {
    requestAnimationFrame(() => {
      const el = rowRefs.current[rowId];
      if (!el) return;
      el.focus();
      el.setSelectionRange(0, 0);
      resizeTextarea(el);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number): void => {
    if (disabled) return;
    const prev = rowsRef.current;
    const row = prev[index];
    if (!row) return;
    const el = e.currentTarget;
    const { selectionStart, selectionEnd, value: v } = el;

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (row.indent <= 0) return;
        const next = prev.map((r, i) =>
          i === index ? { ...r, indent: Math.max(0, r.indent - 1) } : r
        );
        applyRows(next);
      } else {
        const next = prev.map((r, i) =>
          i === index ? { ...r, indent: Math.min(8, r.indent + 1) } : r
        );
        applyRows(next);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const before = v.slice(0, selectionStart);
      const after = v.slice(selectionEnd);
      const nextRows = [...prev];
      nextRows[index] = { ...row, text: before };
      const newRow: ScopeBulletRow = { ...createEmptyScopeRow(row.indent), text: after };
      nextRows.splice(index + 1, 0, newRow);
      applyRows(nextRows);
      focusRowStart(newRow.id);
      return;
    }

    if (e.key === "Backspace" && selectionStart === selectionEnd && selectionStart === 0) {
      if (!v.trim() && prev.length > 1) {
        e.preventDefault();
        const prevRow = prev[index - 1];
        const next = prev.filter((_, i) => i !== index);
        applyRows(next);
        if (prevRow) focusRowEnd(prevRow.id);
        return;
      }
    }
  };

  React.useLayoutEffect(() => {
    rows.forEach((r) => resizeTextarea(rowRefs.current[r.id]));
  }, [rows]);

  const isEmpty = rows.every((r) => !r.text.replace(/\n/g, "").trim());

  return (
    <div
      role="group"
      aria-label={id ? undefined : ariaLabel}
      className={cn(
        "eb-proposal-scope-editor",
        EB.glassNotes,
        "px-1.5 py-2 transition-[border-color,background,box-shadow] duration-200",
        "border border-white/[0.06] bg-white/[0.025] focus-within:border-white/[0.11] focus-within:bg-white/[0.04] focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
        comfortable && "rounded-md px-2 py-2.5",
        className
      )}
    >
      {isEmpty && !disabled ? (
        <p
          className="pointer-events-none select-none px-2 pb-1 text-[13px] leading-snug text-zinc-500/90"
          aria-hidden
        >
          {placeholder}
        </p>
      ) : null}
      <div className="flex flex-col gap-0">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={cn(
              "group/scope-row flex min-h-11 items-start gap-1 rounded-sm pl-0.5 transition-colors duration-150",
              rowPad,
              "hover:bg-white/[0.03] focus-within:bg-white/[0.04]"
            )}
            style={{ paddingLeft: row.indent * (comfortable ? 18 : 16) }}
          >
            {showHandle ? (
              <>
                <span
                  className={cn(
                    "mt-2.5 flex w-4 shrink-0 justify-center font-serif text-zinc-500 md:hidden",
                    comfortable ? "text-[15px]" : "text-sm"
                  )}
                  aria-hidden
                >
                  ·
                </span>
                <span
                  className="mt-2.5 hidden w-5 shrink-0 justify-center text-zinc-600 opacity-0 transition-opacity duration-150 group-hover/scope-row:opacity-100 group-focus-within/scope-row:opacity-100 md:flex md:mt-2"
                  aria-hidden
                >
                  <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
              </>
            ) : (
              <span
                className={cn(
                  "mt-2.5 flex w-4 shrink-0 justify-center font-serif text-zinc-500",
                  comfortable ? "text-[15px]" : "text-sm"
                )}
                aria-hidden
              >
                ·
              </span>
            )}
            <textarea
              ref={(node) => {
                rowRefs.current[row.id] = node;
              }}
              id={id && index === 0 ? id : undefined}
              value={row.text}
              disabled={disabled}
              rows={1}
              onChange={(e) => onRowTextChange(row.id, e.target.value)}
              onBlur={onBlur}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                "eb-proposal-scope-field min-h-11 w-full flex-1 resize-none border-0 bg-transparent",
                "py-1.5 placeholder:text-zinc-600/80",
                "focus:outline-none focus-visible:ring-0",
                textClass
              )}
              placeholder={index === 0 ? placeholder : ""}
              aria-label={
                id && index === 0 && rows.length === 1
                  ? undefined
                  : rows.length > 1
                    ? `${ariaLabel}, bullet ${index + 1} of ${rows.length}`
                    : ariaLabel
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

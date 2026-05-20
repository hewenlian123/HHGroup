"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Shown when editor is empty */
  placeholder?: string;
  /** Pass imperative editor access through Next dynamic(), which does not forward React refs. */
  editorRef?: React.Ref<LineItemDescriptionRichTextHandle>;
};

export type LineItemDescriptionRichTextHandle = {
  /** Latest HTML (synced on every keystroke); use on Save so parent state is not lagging behind debounced onChange */
  getValue: () => string;
};

function normalizeIncomingHtml(html: string): string {
  const t = html?.trim() ?? "";
  return t || "<p></p>";
}

function htmlToStored(editorHtml: string): string {
  const t = editorHtml.trim();
  if (!t || t === "<p></p>") return "";
  return t;
}

export const LineItemDescriptionRichText = React.forwardRef<
  LineItemDescriptionRichTextHandle,
  Props
>(function LineItemDescriptionRichText(
  { value, onChange, disabled, placeholder = "Optional details", editorRef },
  ref
) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const latestHtmlRef = React.useRef<string>("");
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleParentNotify = React.useCallback((html: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      onChangeRef.current(html);
    }, 140);
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      getValue: () => latestHtmlRef.current,
    }),
    []
  );
  React.useImperativeHandle(
    editorRef,
    () => ({
      getValue: () => latestHtmlRef.current,
    }),
    []
  );

  React.useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    []
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
    ],
    editable: !disabled,
    content: normalizeIncomingHtml(value),
    editorProps: {
      attributes: {
        class: cn(
          "max-w-none min-h-[140px] px-3.5 py-3 text-sm leading-6 text-zinc-100 outline-none",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
          "[&_strong]:font-semibold [&_b]:font-semibold",
          "[&_ul]:text-zinc-100 [&_ol]:text-zinc-100"
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const empty = !ed.getText().trim();
      const html = htmlToStored(empty ? "" : ed.getHTML());
      latestHtmlRef.current = html;
      scheduleParentNotify(html);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const empty = !editor.getText().trim();
    latestHtmlRef.current = htmlToStored(empty ? "" : editor.getHTML());
  }, [editor]);

  React.useEffect(() => {
    if (!editor || disabled) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    return (
      <div
        className="min-h-[176px] animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.04]"
        aria-hidden
      />
    );
  }

  const toolbarButtonClass =
    "h-8 w-8 shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.035] p-0 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-amber-200/25 hover:bg-white/[0.075] hover:text-zinc-50 focus-visible:ring-2 focus-visible:ring-amber-200/20 focus-visible:ring-offset-0";
  const toolbarButtonActiveClass =
    "border-amber-200/35 bg-amber-200/[0.14] text-amber-50 shadow-[0_0_18px_rgba(212,184,120,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]";

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.18)] focus-within:border-amber-200/25 focus-within:shadow-[0_0_0_3px_rgba(212,184,120,0.08),0_18px_48px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] bg-white/[0.055] px-2 py-2 backdrop-blur-xl">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(toolbarButtonClass, editor.isActive("bold") && toolbarButtonActiveClass)}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(toolbarButtonClass, editor.isActive("italic") && toolbarButtonActiveClass)}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            toolbarButtonClass,
            editor.isActive("underline") && toolbarButtonActiveClass
          )}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-1 h-5 w-px shrink-0 bg-white/[0.1]" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            toolbarButtonClass,
            editor.isActive("bulletList") && toolbarButtonActiveClass
          )}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            toolbarButtonClass,
            editor.isActive("orderedList") && toolbarButtonActiveClass
          )}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="relative min-h-[140px] bg-slate-950/20">
        <EditorContent editor={editor} className="relative z-[1]" />
        {editor.isEmpty && !disabled ? (
          <span className="pointer-events-none absolute left-3.5 top-3 z-0 text-sm text-zinc-500">
            {placeholder}
          </span>
        ) : null}
      </div>
    </div>
  );
});

LineItemDescriptionRichText.displayName = "LineItemDescriptionRichText";

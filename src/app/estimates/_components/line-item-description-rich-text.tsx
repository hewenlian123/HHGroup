"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Shown when editor is empty */
  placeholder?: string;
};

function normalizeIncomingHtml(html: string): string {
  const t = html?.trim() ?? "";
  return t || "<p></p>";
}


export function LineItemDescriptionRichText({ value, onChange, disabled, placeholder = "Optional details" }: Props) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

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
      TiptapUnderline,
    ],
    editable: !disabled,
    content: normalizeIncomingHtml(value),
    editorProps: {
      attributes: {
        class: cn(
          "max-w-none min-h-[120px] px-3 py-2 text-sm text-foreground outline-none",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
          "[&_strong]:font-semibold [&_b]:font-semibold"
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const empty = !ed.getText().trim();
      onChangeRef.current(empty ? "" : ed.getHTML().trim());
    },
  });

  React.useEffect(() => {
    if (!editor || disabled) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    return (
      <div className="min-h-[120px] rounded-md border border-input bg-muted/20 animate-pulse" aria-hidden />
    );
  }

  return (
    <div className="rounded-md border border-input bg-transparent shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/20 px-1.5 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 w-7 shrink-0 rounded-sm p-0", editor.isActive("bold") && "bg-muted")}
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
          className={cn("h-7 w-7 shrink-0 rounded-sm p-0", editor.isActive("italic") && "bg-muted")}
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
          className={cn("h-7 w-7 shrink-0 rounded-sm p-0", editor.isActive("underline") && "bg-muted")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-0.5 h-4 w-px bg-border shrink-0" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 w-7 shrink-0 rounded-sm p-0", editor.isActive("bulletList") && "bg-muted")}
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
          className={cn("h-7 w-7 shrink-0 rounded-sm p-0", editor.isActive("orderedList") && "bg-muted")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="relative min-h-[120px]">
        <EditorContent editor={editor} className="relative z-[1]" />
        {editor.isEmpty && !disabled ? (
          <span className="pointer-events-none absolute left-3 top-2 z-0 text-sm text-muted-foreground">{placeholder}</span>
        ) : null}
      </div>
    </div>
  );
}

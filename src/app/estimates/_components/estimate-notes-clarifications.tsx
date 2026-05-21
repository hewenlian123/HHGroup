"use client";

import * as React from "react";
import { ChevronDown, Copy, MoreVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EB, ebGlassPanel, ebInput } from "./estimate-builder-ui";
import {
  ESTIMATE_NOTE_TYPES,
  NOTE_TYPE_LABELS,
  defaultTitleForNoteType,
  type EstimateNoteBlock,
  type EstimateNoteType,
} from "@/lib/estimate-notes";

export type { EstimateNoteBlock, EstimateNoteType } from "@/lib/estimate-notes";

export function createEstimateNoteBlock(type: EstimateNoteType): EstimateNoteBlock {
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    title: defaultTitleForNoteType(type),
    body: "",
  };
}

export type EstimateNotesClarificationsProps = {
  notes: EstimateNoteBlock[];
  onNotesChange: (notes: EstimateNoteBlock[]) => void;
  disabled?: boolean;
  defaultCollapsed?: boolean;
};

export function EstimateNotesClarifications({
  notes,
  onNotesChange,
  disabled = false,
  defaultCollapsed = true,
}: EstimateNotesClarificationsProps): React.ReactElement {
  const [addOpen, setAddOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(!defaultCollapsed || notes.length > 0);

  React.useEffect(() => {
    if (notes.length > 0) setExpanded(true);
  }, [notes.length]);

  const updateNote = (id: string, patch: Partial<EstimateNoteBlock>): void => {
    onNotesChange(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const duplicateNote = (id: string): void => {
    const src = notes.find((n) => n.id === id);
    if (!src) return;
    onNotesChange([
      ...notes,
      {
        ...src,
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: src.title ? `${src.title} (copy)` : "Copy",
      },
    ]);
  };

  const deleteNote = (id: string): void => {
    onNotesChange(notes.filter((n) => n.id !== id));
  };

  const addNote = (type: EstimateNoteType): void => {
    onNotesChange([...notes, createEstimateNoteBlock(type)]);
    setExpanded(true);
    setAddOpen(false);
  };

  return (
    <section className={EB.section}>
      <div className={ebGlassPanel("eb-notes-clarifications-panel")}>
        <details
          className="group"
          open={expanded}
          onToggle={(e) => setExpanded(e.currentTarget.open)}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-1 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-1.5">
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#929CAF] transition-transform group-open:rotate-180" />
              <div className="min-w-0">
                <h2 className={EB.scopeHeading}>Notes &amp; Clarifications</h2>
                <p className={EB.scopeSubtitle}>Exclusions, assumptions, and terms (draft only)</p>
              </div>
            </div>
            <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("min-h-11 shrink-0 px-2.5 md:min-h-8", EB.actionSecondary)}
                  disabled={disabled}
                  onClick={(e) => e.preventDefault()}
                  aria-label="Add note"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  Add note
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={cn(EB.builderPickerMenu, EB.commandMenu)}>
                {ESTIMATE_NOTE_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    className={EB.commandMenuItem}
                    disabled={disabled}
                    onSelect={() => addNote(type)}
                  >
                    {NOTE_TYPE_LABELS[type]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </summary>
          <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
            {notes.length === 0 ? (
              <p className={EB.scopeEmptyMessage}>
                No notes yet. Add exclusions, assumptions, or terms.
              </p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className={EB.noteBlock}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <input
                      type="text"
                      value={note.title}
                      onChange={(e) => updateNote(note.id, { title: e.target.value })}
                      disabled={disabled}
                      className={ebInput(
                        "h-8 min-h-8 w-full min-w-0 border-0 bg-transparent px-0 text-[14px] font-semibold text-[#F6F7FA] shadow-none focus-visible:ring-0"
                      )}
                      aria-label="Note title"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={EB.lineItemMoreTrigger}
                          aria-label="Note actions"
                          disabled={disabled}
                        >
                          <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className={cn(EB.lineItemMoreMenu, EB.commandMenu)}
                      >
                        <DropdownMenuItem
                          className={EB.lineItemMoreMenuItem}
                          disabled={disabled}
                          onSelect={() => duplicateNote(note.id)}
                        >
                          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={cn(EB.lineItemMoreMenuItem, EB.lineItemMoreMenuItemDanger)}
                          disabled={disabled}
                          onSelect={() => deleteNote(note.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <textarea
                    value={note.body}
                    onChange={(e) => updateNote(note.id, { body: e.target.value })}
                    disabled={disabled}
                    rows={3}
                    className={cn(
                      EB.noteBlockTextarea,
                      ebInput("min-h-[4.5rem] w-full resize-y text-[13px]")
                    )}
                    placeholder={`${NOTE_TYPE_LABELS[note.type]} details…`}
                    aria-label={`${note.title} body`}
                  />
                </div>
              ))
            )}
          </div>
        </details>
      </div>
    </section>
  );
}

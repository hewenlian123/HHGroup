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
import { EstimateAutoResizeTextarea } from "./estimate-auto-resize-textarea";
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
  allowedTypes?: readonly EstimateNoteType[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  addLabel?: string;
};

export function EstimateNotesClarifications({
  notes,
  onNotesChange,
  disabled = false,
  defaultCollapsed = true,
  allowedTypes = ESTIMATE_NOTE_TYPES,
  title = "Notes & Clarifications",
  subtitle = "Client-facing scope notes",
  emptyMessage = "No notes yet. Add a client-facing clarification when needed.",
  addLabel = "Add note",
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
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              <div className="min-w-0">
                <h2 className={EB.scopeHeading}>{title}</h2>
                <p className={EB.scopeSubtitle}>{subtitle}</p>
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
                  aria-label={addLabel}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  {addLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={cn(EB.builderPickerMenu, EB.commandMenu)}>
                {allowedTypes.map((type) => (
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
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            {notes.length === 0 ? (
              <p className={EB.scopeEmptyMessage}>{emptyMessage}</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className={EB.noteBlock}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <EstimateAutoResizeTextarea
                      value={note.title}
                      onChange={(e) => updateNote(note.id, { title: e.target.value })}
                      disabled={disabled}
                      rows={1}
                      minHeight={32}
                      maxHeight={112}
                      className={ebInput(
                        "eb-note-title-textarea min-h-8 w-full min-w-0 border-0 bg-transparent px-0 py-1 text-hh-body-strong text-foreground shadow-none focus-visible:ring-0"
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
                  <EstimateAutoResizeTextarea
                    value={note.body}
                    onChange={(e) => updateNote(note.id, { body: e.target.value })}
                    disabled={disabled}
                    rows={2}
                    minHeight={54}
                    maxHeight={360}
                    className={cn(
                      EB.noteBlockTextarea,
                      ebInput("w-full text-hh-table-cell leading-[1.45]")
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

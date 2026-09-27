"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";
import {
  ESTIMATE_NOTE_TYPES,
  defaultTitleForNoteType,
  type EstimateNoteBlock,
  type EstimateNoteType,
} from "@/lib/estimate-notes";
import { EstimateDescriptionEditor as EstimateNoteBody } from "./estimate-description-editor";
export { EstimateDescriptionEditor as EstimateNoteBody } from "./estimate-description-editor";
export type { EstimateNoteBlock, EstimateNoteType } from "@/lib/estimate-notes";

export function createEstimateNoteBlock(type: EstimateNoteType): EstimateNoteBlock {
  return { id: crypto.randomUUID(), type, title: defaultTitleForNoteType(type), body: "" };
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
  allowedTypes = ESTIMATE_NOTE_TYPES,
  title = "Customer Notes",
  subtitle = "Client-facing scope notes and clarifications",
  emptyMessage = "No customer notes yet.",
  addLabel = "Add Customer Note",
}: EstimateNotesClarificationsProps): React.ReactElement {
  const root = React.useRef<HTMLElement>(null);
  const pendingFocus = React.useRef<string | null>(null);
  const [dragged, setDragged] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!pendingFocus.current) return;
    const input = root.current?.querySelector<HTMLInputElement>(
      `[data-note-title="${pendingFocus.current}"]`
    );
    if (input) {
      input.focus();
      input.select();
      pendingFocus.current = null;
    }
  }, [notes]);
  const update = (id: string, patch: Partial<EstimateNoteBlock>): void =>
    onNotesChange(notes.map((note) => (note.id === id ? { ...note, ...patch } : note)));
  const move = (id: string, destination: number): void => {
    if (disabled) return;
    const next = [...notes];
    const index = next.findIndex((note) => note.id === id);
    if (index < 0 || destination < 0 || destination >= next.length) return;
    next.splice(destination, 0, ...next.splice(index, 1));
    onNotesChange(next);
  };
  return (
    <section ref={root} className="eb-note-cards">
      <header className="eb-note-cards-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      {!notes.length ? <p className="eb-note-cards-empty">{emptyMessage}</p> : null}
      {notes.map((note, index) => (
        <article
          key={note.id}
          className="eb-note-card"
          onDragOver={(event) => {
            if (dragged && !disabled) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragged) move(dragged, index);
            setDragged(null);
          }}
        >
          <div className="eb-note-card-heading">
            <button
              type="button"
              className="eb-note-drag"
              aria-label={`Drag ${note.title} to reorder`}
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(event) => {
                setDragged(note.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", note.id);
              }}
              onDragEnd={() => setDragged(null)}
            >
              <GripVertical size={14} />
            </button>
            <input
              data-note-title={note.id}
              value={note.title}
              placeholder="Note title"
              aria-label="Note title"
              disabled={disabled}
              onChange={(event) => update(note.id, { title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                  event.preventDefault();
                  event.currentTarget
                    .closest("article")
                    ?.querySelector<HTMLElement>('[role="textbox"]')
                    ?.focus();
                }
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${note.title}`}
                  disabled={disabled}
                >
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={cn(EB.lineItemMoreMenu, EB.commandMenu)}>
                <DropdownMenuItem
                  onSelect={() => {
                    const copy = {
                      ...note,
                      id: crypto.randomUUID(),
                      title: `${note.title} (copy)`,
                    };
                    const next = [...notes];
                    next.splice(index + 1, 0, copy);
                    onNotesChange(next);
                  }}
                >
                  <Copy size={14} />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === 0} onSelect={() => move(note.id, index - 1)}>
                  <ArrowUp size={14} />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === notes.length - 1}
                  onSelect={() => move(note.id, index + 1)}
                >
                  <ArrowDown size={14} />
                  Move down
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={EB.lineItemMoreMenuItemDanger}
                  onSelect={() => onNotesChange(notes.filter((entry) => entry.id !== note.id))}
                >
                  <Trash2 size={14} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <EstimateNoteBody
            body={note.body}
            label={`${note.title} description`}
            disabled={disabled}
            onChange={(body) => update(note.id, { body })}
          />
        </article>
      ))}
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        className="eb-note-add"
        onClick={() => {
          const note = createEstimateNoteBlock(allowedTypes[0] ?? "custom");
          pendingFocus.current = note.id;
          onNotesChange([...notes, note]);
        }}
      >
        <Plus size={14} />
        {addLabel}
      </Button>
    </section>
  );
}

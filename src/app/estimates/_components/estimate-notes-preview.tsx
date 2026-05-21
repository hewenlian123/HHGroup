import * as React from "react";
import { cn } from "@/lib/utils";
import type { EstimateNoteBlock } from "@/lib/estimate-notes";

export function EstimateNotesPreview({
  notes,
  variant = "preview",
  className,
}: {
  notes: EstimateNoteBlock[];
  variant?: "preview" | "print";
  className?: string;
}): React.ReactElement | null {
  const visibleNotes = notes.filter((note) => note.title.trim() || note.body.trim());
  if (visibleNotes.length === 0) return null;

  return (
    <section className={cn("print:break-inside-avoid", className)}>
      <h2
        className={cn(
          "font-semibold uppercase tracking-wide text-zinc-500",
          variant === "print" ? "mb-4 text-xs tracking-wider" : "mb-3 text-[11px]"
        )}
      >
        Notes &amp; Clarifications
      </h2>
      <div className={variant === "print" ? "space-y-4 text-sm" : "space-y-3 text-sm"}>
        {visibleNotes.map((note) => (
          <div key={note.id} className="border-b border-zinc-100 pb-3 last:border-b-0">
            <p className="font-semibold text-zinc-900">{note.title || "Note"}</p>
            {note.body.trim() ? (
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-700">
                {note.body.trim()}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

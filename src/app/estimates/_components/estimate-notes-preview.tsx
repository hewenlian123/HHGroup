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
      <p className="text-[11px] font-medium tracking-[0.08em] text-zinc-500">
        Notes &amp; Clarifications
      </p>
      <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em] text-zinc-950">
        Important notes
      </h2>
      <div
        className={cn("mt-4 px-0", variant === "print" ? "space-y-3 text-sm" : "space-y-3 text-sm")}
      >
        {visibleNotes.map((note) => (
          <div
            key={note.id}
            className={cn("break-inside-avoid", variant === "print" ? "py-0.5" : "py-1")}
          >
            <p className="text-[12.5px] font-semibold tracking-[-0.005em] text-zinc-950">
              {note.title || "Note"}
            </p>
            {note.body.trim() ? (
              <p className="mt-1.5 whitespace-pre-wrap break-words leading-[1.58] text-zinc-700">
                {note.body.trim()}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

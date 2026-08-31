"use client";

import * as React from "react";
import { ChevronRight, ListTree } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";

export type EstimateSectionOutlineItem = {
  id: string;
  name: string;
  itemCount: number;
  subtotal: number;
  collapsed: boolean;
};

function visibleSectionElement(sectionId: string): HTMLElement | null {
  const escaped =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(sectionId)
      : sectionId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return (
    Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-estimate-section-id="${escaped}"], [data-estimate-section-mobile-id="${escaped}"]`
      )
    ).find((candidate) => candidate.getClientRects().length > 0) ?? null
  );
}

export function EstimateSectionOutline({
  sections,
  activeSectionId,
  onActiveSectionChange,
  onCollapseAll,
  onExpandAll,
  addSectionControl,
}: {
  sections: EstimateSectionOutlineItem[];
  activeSectionId: string | null;
  onActiveSectionChange: (sectionId: string, source: "explicit" | "inferred") => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  addSectionControl?: React.ReactNode;
}): React.ReactElement {
  const jumpToSection = (sectionId: string, allowSmoothScroll: boolean): void => {
    const target = visibleSectionElement(sectionId);
    if (!target) return;
    onActiveSectionChange(sectionId, "explicit");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: reduceMotion || !allowSmoothScroll ? "auto" : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
  };

  return (
    <nav className="eb-section-outline" aria-label="Estimate sections">
      <div className="eb-section-outline-sticky">
        <div className="eb-section-outline-heading">
          <ListTree className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span>Sections</span>
          <span className="ml-auto tabular-nums text-muted-foreground">{sections.length}</span>
        </div>

        <div className="eb-section-outline-controls" aria-label="Section display controls">
          <button type="button" onClick={onCollapseAll} aria-label="Collapse all">
            Collapse all
          </button>
          <span aria-hidden>·</span>
          <button type="button" onClick={onExpandAll} aria-label="Expand all">
            Expand all
          </button>
        </div>

        <ol className="eb-section-outline-list">
          {sections.map((section) => {
            const active = section.id === activeSectionId;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  className={cn("eb-section-outline-row", active && "is-active")}
                  onClick={(event) => jumpToSection(section.id, event.detail > 0)}
                  aria-current={active ? "location" : undefined}
                  aria-label={`${section.name}, ${section.itemCount} ${
                    section.itemCount === 1 ? "item" : "items"
                  }, ${formatEstimateCurrency(section.subtotal)}, ${
                    section.collapsed ? "collapsed" : "expanded"
                  }`}
                >
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 shrink-0", !section.collapsed && "rotate-90")}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {section.name}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-hh-status text-muted-foreground">
                      <span className="tabular-nums">
                        {section.itemCount} {section.itemCount === 1 ? "item" : "items"}
                      </span>
                      <span className="tabular-nums">
                        {formatEstimateCurrency(section.subtotal)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {addSectionControl ? (
          <div className="eb-section-outline-add">{addSectionControl}</div>
        ) : null}
      </div>
    </nav>
  );
}

"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  filterEstimateScopeSearchResults,
  type EstimateScopeSearchEntry,
} from "./estimate-builder-productivity";

export type EstimateScopeToolbarSection = {
  id: string;
  name: string;
  itemCount: number;
  subtotal: number;
  collapsed: boolean;
};

function escapeAttributeSelector(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function visibleElement(selector: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (candidate) => candidate.getClientRects().length > 0
    ) ?? null
  );
}

function visibleSectionElement(sectionId: string): HTMLElement | null {
  const escaped = escapeAttributeSelector(sectionId);
  return visibleElement(
    `[data-estimate-section-id="${escaped}"], [data-estimate-section-mobile-id="${escaped}"]`
  );
}

function visibleLineElement(lineItemId: string): HTMLElement | null {
  return visibleElement(`[data-estimate-line-item-id="${escapeAttributeSelector(lineItemId)}"]`);
}

function scrollAndFocus(target: HTMLElement): void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  const focusTarget = target.hasAttribute("data-estimate-line-item-id")
    ? (target.querySelector<HTMLElement>(
        'input[aria-label*=" title"], [role="textbox"], .eb-line-item-mobile-summary'
      ) ?? target)
    : target;
  focusTarget.focus({ preventScroll: true });
}

export function EstimateScopeToolbar({
  sections,
  searchEntries,
  initialExplicitSectionId,
  onCollapseAll,
  onExpandAll,
  onRevealSection,
  onActiveSectionChange,
  addSectionControl,
}: {
  sections: EstimateScopeToolbarSection[];
  searchEntries: EstimateScopeSearchEntry[];
  initialExplicitSectionId?: string | null;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onRevealSection?: (sectionId: string) => void;
  onActiveSectionChange?: (sectionId: string) => void;
  addSectionControl?: React.ReactNode;
}): React.ReactElement {
  const [activeSectionId, setActiveSectionId] = React.useState<string | null>(
    initialExplicitSectionId ?? sections[0]?.id ?? null
  );
  const [explicitSectionId, setExplicitSectionId] = React.useState<string | null>(
    initialExplicitSectionId ?? null
  );
  const [query, setQuery] = React.useState("");
  const [activeResultIndex, setActiveResultIndex] = React.useState(0);
  const [resultsOpen, setResultsOpen] = React.useState(false);
  const shellRef = React.useRef<HTMLDivElement>(null);
  const sectionKey = sections.map((section) => section.id).join("|");
  const results = React.useMemo(
    () => filterEstimateScopeSearchResults(searchEntries, query),
    [query, searchEntries]
  );

  const setActive = React.useCallback(
    (sectionId: string): void => {
      setActiveSectionId(sectionId);
      onActiveSectionChange?.(sectionId);
    },
    [onActiveSectionChange]
  );

  React.useEffect(() => {
    if (activeSectionId && sections.some((section) => section.id === activeSectionId)) return;
    const next = sections[0]?.id ?? null;
    setActiveSectionId(next);
    if (next) onActiveSectionChange?.(next);
  }, [activeSectionId, onActiveSectionChange, sectionKey, sections]);

  React.useEffect(() => {
    if (!explicitSectionId) return;
    if (sections.some((section) => section.id === explicitSectionId)) return;
    setExplicitSectionId(null);
  }, [explicitSectionId, sectionKey, sections]);

  React.useEffect(() => {
    if (!initialExplicitSectionId) return;
    if (!sections.some((section) => section.id === initialExplicitSectionId)) return;
    setExplicitSectionId(initialExplicitSectionId);
    setActive(initialExplicitSectionId);
  }, [initialExplicitSectionId, sectionKey, sections, setActive]);

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = sections
      .map((section) => ({ id: section.id, element: visibleSectionElement(section.id) }))
      .filter((entry): entry is { id: string; element: HTMLElement } => Boolean(entry.element));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const nearest = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top - 112) - Math.abs(b.boundingClientRect.top - 112)
          )[0];
        const match = nearest
          ? elements.find((entry) => entry.element === nearest.target)
          : undefined;
        if (match && !explicitSectionId) setActive(match.id);
      },
      { rootMargin: "-96px 0px -58% 0px", threshold: [0, 0.2, 0.5] }
    );
    elements.forEach((entry) => observer.observe(entry.element));
    return () => observer.disconnect();
  }, [explicitSectionId, sectionKey, sections, setActive]);

  const jumpToSection = (sectionId: string): void => {
    const target = visibleSectionElement(sectionId);
    if (!target) return;
    setExplicitSectionId(sectionId);
    setActive(sectionId);
    scrollAndFocus(target);
  };

  const chooseSearchResult = (entry: EstimateScopeSearchEntry): void => {
    setResultsOpen(false);
    setQuery("");
    setExplicitSectionId(entry.sectionId);
    setActive(entry.sectionId);
    if (entry.lineItemId) onRevealSection?.(entry.sectionId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = entry.lineItemId
          ? visibleLineElement(entry.lineItemId)
          : visibleSectionElement(entry.sectionId);
        if (target) scrollAndFocus(target);
      });
    });
  };

  return (
    <div
      ref={shellRef}
      className="eb-scope-toolbar"
      data-estimate-active-section-id={explicitSectionId ?? activeSectionId ?? undefined}
      role="toolbar"
      aria-label="Scope tools"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setResultsOpen(false);
        }
      }}
    >
      <div className="eb-scope-toolbar-search-wrap">
        <Search className="eb-scope-toolbar-search-icon h-3.5 w-3.5" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-label="Search scope"
          aria-autocomplete="list"
          aria-controls="estimate-scope-search-results"
          aria-expanded={resultsOpen && results.length > 0}
          aria-activedescendant={
            resultsOpen && results[activeResultIndex]
              ? `estimate-scope-search-result-${results[activeResultIndex].id}`
              : undefined
          }
          value={query}
          placeholder="Search scope…"
          onFocus={() => setResultsOpen(Boolean(query.trim()))}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveResultIndex(0);
            setResultsOpen(Boolean(event.target.value.trim()));
          }}
          onKeyDown={(event) => {
            if (!resultsOpen || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveResultIndex((current) => (current + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveResultIndex((current) => (current - 1 + results.length) % results.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const result = results[activeResultIndex];
              if (result) chooseSearchResult(result);
            } else if (event.key === "Escape") {
              setResultsOpen(false);
            }
          }}
        />
        {resultsOpen && query.trim() ? (
          <div
            id="estimate-scope-search-results"
            className="eb-scope-search-results"
            role="listbox"
            aria-label="Scope search results"
          >
            {results.length ? (
              results.map((entry, index) => (
                <button
                  key={entry.id}
                  id={`estimate-scope-search-result-${entry.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeResultIndex}
                  className={cn(
                    "eb-scope-search-result",
                    index === activeResultIndex && "is-active"
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveResultIndex(index)}
                  onClick={() => chooseSearchResult(entry)}
                >
                  <span className="truncate font-medium text-foreground">{entry.label}</span>
                  <span className="truncate text-muted-foreground">{entry.detail}</span>
                </button>
              ))
            ) : (
              <p className="eb-scope-search-empty">No matching scope lines</p>
            )}
          </div>
        ) : null}
      </div>

      <label className="eb-scope-jump-wrap">
        <span className="sr-only">Jump to section</span>
        <select
          aria-label="Jump to section"
          value={activeSectionId ?? ""}
          disabled={sections.length === 0}
          onChange={(event) => jumpToSection(event.target.value)}
        >
          {sections.length === 0 ? <option value="">No sections</option> : null}
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name} · {section.itemCount} {section.itemCount === 1 ? "item" : "items"}
            </option>
          ))}
        </select>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </label>

      <div className="eb-scope-toolbar-display-controls" aria-label="Section display controls">
        <button type="button" onClick={onCollapseAll} disabled={sections.length === 0}>
          Collapse all
        </button>
        <button type="button" onClick={onExpandAll} disabled={sections.length === 0}>
          Expand all
        </button>
      </div>

      {addSectionControl ? <div className="eb-scope-toolbar-add">{addSectionControl}</div> : null}
    </div>
  );
}

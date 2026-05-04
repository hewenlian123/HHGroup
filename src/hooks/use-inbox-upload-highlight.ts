"use client";

import * as React from "react";
import { getExpenseTotal, type Expense } from "@/lib/data";
import { buildExpenseDateGroups } from "@/lib/expense-list-date-groups";
import { expenseInboxDuplicateIdSet } from "@/lib/expense-inbox-dup";
import { expenseMatchesInboxPool } from "@/lib/expense-workflow-status";

export function parseInboxHighlightParam(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type UseInboxUploadHighlightArgs = {
  inboxMode: boolean;
  highlightParam: string | null;
  expensesForListing: Expense[];
  filteredSortedExpenses: Expense[];
  flatListRows: Expense[];
  curPage: number;
  pageSize: number;
  setPage: (nextPage: number) => void;
  rowElsRef: React.MutableRefObject<Record<string, HTMLTableRowElement | HTMLLIElement | null>>;
  listPath: string;
  bundleWaiting: boolean;
  listBusyFetching: boolean;
  replaceRoute: (href: string, opts?: { scroll?: boolean }) => void;
  onClearNarrowingFilters: () => void;
};

/**
 * Deep-links from upload modal: `/financial/inbox?highlight=INBOX-UP-...,...`
 * Clears local narrowing filters once if the row is hidden, paginates, scrolls smoothly,
 * highlights rows briefly, then strips `highlight` from the URL.
 */
export function useInboxUploadHighlight(args: UseInboxUploadHighlightArgs): {
  rowHighlightRefs: ReadonlySet<string>;
  autoExpandDateGroupsForHighlight: boolean;
} {
  const tokens = React.useMemo(
    () => parseInboxHighlightParam(args.highlightParam),
    [args.highlightParam]
  );

  const [visualHighlightRefs, setVisualHighlightRefs] = React.useState(() => new Set<string>());
  const filtersClearedRef = React.useRef(false);
  const runGenRef = React.useRef(0);
  const strippedForMissingTargetRef = React.useRef(false);

  const replaceRef = React.useRef(args.replaceRoute);
  replaceRef.current = args.replaceRoute;
  const clearFiltersRef = React.useRef(args.onClearNarrowingFilters);
  clearFiltersRef.current = args.onClearNarrowingFilters;
  const setPageRef = React.useRef(args.setPage);
  setPageRef.current = args.setPage;
  const listPathRef = React.useRef(args.listPath);
  listPathRef.current = args.listPath;

  const inboxDupSet = React.useMemo(
    () => expenseInboxDuplicateIdSet(args.expensesForListing, getExpenseTotal),
    [args.expensesForListing]
  );

  const inboxPoolRows = React.useMemo(
    () => args.expensesForListing.filter((e) => expenseMatchesInboxPool(e, inboxDupSet.has(e.id))),
    [args.expensesForListing, inboxDupSet]
  );

  React.useEffect(() => {
    strippedForMissingTargetRef.current = false;
    filtersClearedRef.current = false;
  }, [args.highlightParam]);

  const stripHighlightFromUrl = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has("highlight")) return;
    sp.delete("highlight");
    const qs = sp.toString();
    replaceRef.current(qs ? `${listPathRef.current}?${qs}` : listPathRef.current, {
      scroll: false,
    });
  }, []);

  React.useEffect(() => {
    if (!args.inboxMode || tokens.length === 0) {
      filtersClearedRef.current = false;
      strippedForMissingTargetRef.current = false;
      setVisualHighlightRefs(new Set());
      return;
    }

    if (args.bundleWaiting) return;

    const pickFirstMatchingExpense = (list: Expense[]): Expense | undefined => {
      for (const t of tokens) {
        const hit = list.find((e) => e.referenceNo === t);
        if (hit) return hit;
      }
      return undefined;
    };

    const targetInPool = pickFirstMatchingExpense(inboxPoolRows);

    const isInboxUploadHighlight = tokens.some((t) => t.startsWith("INBOX-UP-"));

    if (!targetInPool) {
      if (args.listBusyFetching) return;
      // Upload deep-links use INBOX-UP-* before the client list refresh includes the new draft.
      // Do not strip the query while waiting — otherwise the URL loses highlight immediately.
      if (isInboxUploadHighlight) return;
      if (args.expensesForListing.length > 0 && !strippedForMissingTargetRef.current) {
        strippedForMissingTargetRef.current = true;
        stripHighlightFromUrl();
      }
      return;
    }

    const targetVisible = pickFirstMatchingExpense(args.filteredSortedExpenses);

    if (!targetVisible && !filtersClearedRef.current) {
      filtersClearedRef.current = true;
      clearFiltersRef.current();
      return;
    }

    if (!targetVisible) {
      // Filters/search may still be catching up (e.g. debounced search) — wait for next render.
      return;
    }

    const groups = buildExpenseDateGroups(args.filteredSortedExpenses);
    const gi = groups.findIndex((g) => g.rows.some((r) => r.id === targetVisible.id));
    if (gi < 0) {
      if (!strippedForMissingTargetRef.current) {
        strippedForMissingTargetRef.current = true;
        stripHighlightFromUrl();
      }
      return;
    }

    const pageNeeded = Math.floor(gi / args.pageSize) + 1;
    if (args.curPage !== pageNeeded) {
      setPageRef.current(pageNeeded);
      return;
    }

    const onVisiblePage = args.flatListRows.some((r) => r.id === targetVisible.id);
    if (!onVisiblePage) {
      if (args.listBusyFetching) return;
      return;
    }

    const gen = ++runGenRef.current;
    const tid = targetVisible.id;

    const scrollOne = () => {
      const el = args.rowElsRef.current[tid];
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    setVisualHighlightRefs((prev) => {
      const next = new Set(tokens);
      if (prev.size === next.size && [...tokens].every((t) => prev.has(t))) return prev;
      return next;
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(scrollOne);
    });

    const done = window.setTimeout(() => {
      if (gen !== runGenRef.current) return;
      setVisualHighlightRefs(new Set());
      filtersClearedRef.current = false;
      strippedForMissingTargetRef.current = false;
      stripHighlightFromUrl();
    }, 2000);

    return () => window.clearTimeout(done);
  }, [
    args.inboxMode,
    args.bundleWaiting,
    args.listBusyFetching,
    args.expensesForListing,
    args.filteredSortedExpenses,
    args.flatListRows,
    args.curPage,
    args.pageSize,
    args.rowElsRef,
    inboxPoolRows,
    stripHighlightFromUrl,
    tokens,
  ]);

  const autoExpandDateGroupsForHighlight = tokens.length > 0 || visualHighlightRefs.size > 0;

  return {
    rowHighlightRefs: visualHighlightRefs,
    autoExpandDateGroupsForHighlight,
  };
}
